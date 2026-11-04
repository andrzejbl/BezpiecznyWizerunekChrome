/** @typedef {import('../../../types/cdp.js').ResourceBody} ResourceBody */
/** @typedef {import('../../../types/cdp.js').NetworkResponse} NetworkResponse */
/** @typedef {{requestId?:string,request?:{url?:string},type?:string,redirectResponse?:NetworkResponse,redirectHasExtraInfo?:boolean,response?:NetworkResponse,hasExtraInfo?:boolean,headers?:Record<string,string>,statusCode?:number,errorText?:string,dataLength?:number,wallTime?:number}} ResourceEvent */

import { attachDebugger, detachDebugger, sendDebuggerCommand } from './chrome-api.js';

const RESOURCE_TIMEOUT_MS = 15000;
const BODY_RETRY_MS = 50;
const BUFFER_LIMITS = {
  maxTotalBufferSize: 50 * 1024 * 1024,
  maxResourceBufferSize: 25 * 1024 * 1024
};
let resourceQueue = Promise.resolve();
/** @type {Set<string>} */
const assignedRequests = new Set();

/** @returns {Promise<chrome.debugger.TargetInfo[]>} */
function getTargets() {
  return new Promise((resolve, reject) => {
    chrome.debugger.getTargets((targets) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error('Could not find background worker: ' + error.message));
      else resolve(targets);
    });
  });
}

/** @param {string} url */
function checkedUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Only HTTP(S) URLs without embedded credentials can be checked.');
  }
  parsed.hash = '';
  return parsed.href;
}

/** Policz bajty bez dekodowania dużej odpowiedzi. @param {string} text @param {boolean} base64 @param {number} limit */
function bodyByteLength(text, base64, limit) {
  if (base64) return Math.floor(text.length * 3 / 4) - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
  let length = 0;
  for (let index = 0; index < text.length && length <= limit; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

/** @param {chrome.debugger.Debuggee} target @param {()=>void} assertActive */
async function enableDurableBodies(target, assertActive) {
  await sendDebuggerCommand(target, 'Network.enable', BUFFER_LIMITS);
  assertActive();
  try {
    await sendDebuggerCommand(target, 'Network.configureDurableMessages', BUFFER_LIMITS);
  } catch (error) {
    assertActive();
    const message = error instanceof Error ? error.message : String(error);
    if (!/-32601\b|method not found|unknown (?:method|command)|configureDurableMessages['"]?\s+(?:was not|wasn't) found/i.test(message)) throw error;
    // Starszy Chrome konfiguruje ten sam kolektor opcją Network.enable.
    await sendDebuggerCommand(target, 'Network.enable', { ...BUFFER_LIMITS, enableDurableMessages: true });
  }
}

/**
 * Wykonaj własny fetch z twardym omit. Samo CDP includeCredentials:false
 * oznacza same-origin i może wysłać cookies po przyznaniu activeTab.
 * CDP służy tutaj wyłącznie do pasywnego odczytu odpowiedzi własnego workera.
 * Całe pobrania są szeregowane, aby nie pomylić identycznych URL i przekierowań.
 * @param {string} url
 * @param {number} maxBytes
 * @param {{skipHttpErrorBody?:boolean}} [options]
 * @returns {Promise<ResourceBody>}
 */
export function loadBackgroundResource(url, maxBytes, { skipHttpErrorBody = false } = {}) {
  let normalizedUrl;
  try {
    normalizedUrl = checkedUrl(url);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
      throw new Error('The resource byte limit must be a non-negative safe integer.');
    }
  } catch (error) {
    return Promise.reject(error);
  }
  const result = resourceQueue.then(() => loadOneResource(normalizedUrl, maxBytes, skipHttpErrorBody));
  resourceQueue = result.then(() => {}, () => {});
  return result;
}

/** @param {string} url @param {number} maxBytes @param {boolean} skipHttpErrorBody @returns {Promise<ResourceBody>} */
async function loadOneResource(url, maxBytes, skipHttpErrorBody) {
  const background = chrome.runtime.getManifest().background;
  const workerPath = background && 'service_worker' in background ? background.service_worker : '';
  if (!workerPath) throw new Error('The extension has no background service worker.');
  const workerUrl = chrome.runtime.getURL(workerPath);
  const targets = await getTargets();
  const worker = targets.find((target) => target.url === workerUrl &&
    (target.type === 'worker' || String(target.type) === 'service_worker'));
  if (!worker) throw new Error('The extension background worker target is unavailable.');
  const target = { targetId: worker.id };
  await attachDebugger(target);

  const controller = new AbortController();
  let active = true;
  let detached = false;
  let requestId = '';
  let fetchStartedAt = Infinity;
  let redirectExtras = 0;
  let needsFinalExtra = false;
  let receivedBytes = 0;
  /** @type {NetworkResponse|null} */
  let response = null;
  /** @type {Map<string,ResourceEvent[]>} */
  const extraResponses = new Map();
  /** @type {Error|null} */
  let failure = null;
  /** @type {(resource:ResourceBody)=>void} */
  let finishWithoutBody = () => {};
  /** @type {(error:Error)=>void} */
  let rejectFailure = () => {};
  /** @type {Promise<ResourceBody>} */
  const stopped = new Promise((resolve, reject) => { finishWithoutBody = resolve; rejectFailure = reject; });

  // robots.txt nie wymaga odczytu strony błędu. ExtraInfo może być jedynym
  // źródłem statusu przy CORP; pomiń nagłówki wcześniejszych przekierowań.
  function finishOnHttpError(message = '') {
    const extra = extraResponses.get(requestId)?.[redirectExtras];
    const status = extra?.statusCode ?? response?.status;
    if (typeof status !== 'number' || status < 400 || status >= 600) return false;
    finishWithoutBody({
      success: false, httpStatusCode: status, headers: extra?.headers || response?.headers || {},
      netErrorName: message || `HTTP ${status}`
    });
    return true;
  }
  /** @param {Error} error */
  function fail(error) {
    if (!active || failure) return;
    failure = error;
    controller.abort();
    rejectFailure(error);
  }
  function assertActive() {
    if (!active || detached || controller.signal.aborted) {
      throw failure || new Error('Background resource load was cancelled.');
    }
  }
  /** @param {chrome.debugger.Debuggee} source */
  function onDetach(source) {
    if (source.targetId !== target.targetId) return;
    detached = true;
    fail(new Error('Background worker debugger was detached.'));
  }
  /** @param {chrome.debugger.Debuggee} source @param {string} method @param {object|undefined} event */
  function onEvent(source, method, event) {
    if (!active || source.targetId !== target.targetId) return;
    const params = /** @type {ResourceEvent} */ (event || {});
    if (method === 'Network.responseReceivedExtraInfo' && params.requestId) {
      // ExtraInfo może wyprzedzić requestWillBeSent. Przechowuj wyłącznie małą
      // liczbę metadanych; ciąg przekierowań ma ten sam identyfikator żądania.
      if (!extraResponses.has(params.requestId) && extraResponses.size >= 32) return;
      const extras = extraResponses.get(params.requestId) || [];
      if (extras.length < 32) extras.push(params);
      extraResponses.set(params.requestId, extras);
      if (skipHttpErrorBody && requestId === params.requestId) finishOnHttpError();
      return;
    }
    if (method === 'Network.requestWillBeSent' && params.request?.url) {
      if (!requestId) {
        if (params.type !== 'Fetch') return;
        if (typeof params.wallTime === 'number' && params.wallTime < fetchStartedAt) return;
        const assignment = target.targetId + ':' + params.requestId;
        if (assignedRequests.has(assignment)) return;
        try {
          if (checkedUrl(params.request.url) !== url) return;
        } catch { return; }
        requestId = params.requestId || '';
        assignedRequests.add(assignment);
        if (assignedRequests.size > 512) {
          const oldest = assignedRequests.values().next().value;
          if (oldest !== undefined) assignedRequests.delete(oldest);
        }
      } else if (params.requestId !== requestId) {
        // Nie przypisuj cudzej równoległej odpowiedzi do aktualnej próby.
        if (params.request.url === url && params.type === 'Fetch') {
          fail(new Error('The background resource request could not be identified unambiguously.'));
        }
        return;
      }
      try { checkedUrl(params.request.url); } catch (error) { fail(/** @type {Error} */ (error)); }
      if (params.redirectResponse) {
        if (params.redirectHasExtraInfo) redirectExtras += 1;
        response = null;
        needsFinalExtra = false;
        receivedBytes = 0;
      }
      if (skipHttpErrorBody) finishOnHttpError();
      return;
    }
    if (!requestId || params.requestId !== requestId) return;
    if (method === 'Network.responseReceived' && params.response) {
      response = params.response;
      needsFinalExtra = params.hasExtraInfo === true;
      if (skipHttpErrorBody) finishOnHttpError();
    } else if (method === 'Network.loadingFailed') {
      const message = params.errorText || 'Background resource load failed.';
      if (!finishOnHttpError(message)) fail(new Error(message));
    } else if (method === 'Network.dataReceived' && typeof params.dataLength === 'number') {
      receivedBytes += Math.max(0, params.dataLength);
      if (receivedBytes > maxBytes) fail(new Error('Body is larger than ' + maxBytes + ' bytes.'));
    }
  }
  chrome.debugger.onDetach.addListener(onDetach);
  chrome.debugger.onEvent.addListener(onEvent);
  const timer = setTimeout(() => fail(new Error('Background resource load timed out after ' + RESOURCE_TIMEOUT_MS + ' ms.')), RESOURCE_TIMEOUT_MS);

  // Każdy wait kończy się także przy deadline/odłączeniu. Jego timer jest
  // sprzątany natychmiast, więc spóźnione callbacki nie dotkną kolejnej sesji.
  async function waitForBody() {
    let retryTimer = 0;
    try {
      await Promise.race([stopped, new Promise((resolve) => {
        retryTimer = setTimeout(resolve, BODY_RETRY_MS);
      })]);
    } finally {
      clearTimeout(retryTimer);
    }
    assertActive();
  }

  async function operation() {
    await enableDurableBodies(target, assertActive);
    assertActive();
    fetchStartedAt = Date.now() / 1000;
    let fetched;
    try {
      fetched = await fetch(url, {
        credentials: 'omit', cache: 'no-store', mode: 'no-cors',
        redirect: 'follow', signal: controller.signal
      });
    } catch (error) {
      // Fetch może odrzucić odpowiedź CORP, zanim debugger dostarczy status.
      // Zakończy nas zdarzenie CDP, odłączenie albo wspólny limit czasu.
      if (skipHttpErrorBody) return stopped;
      throw error;
    }
    assertActive();
    if (fetched.type === 'error' || fetched.type === 'opaqueredirect') {
      throw new Error('The background fetch did not expose a complete response.');
    }
    // basic/cors należy opróżnić do EOF; opaque ukrywa body przed Fetch API.
    // Nie zatrzymujemy kopii tych bajtów: kolektor CDP ma osobny limit pamięci.
    if (fetched.body) {
      const reader = fetched.body.getReader();
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          assertActive();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > maxBytes) throw new Error('Body is larger than ' + maxBytes + ' bytes.');
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    while (true) {
      assertActive();
      const extras = extraResponses.get(requestId) || [];
      const metadata = /** @type {NetworkResponse|null} */ (response);
      if (!requestId || !metadata || (needsFinalExtra && extras.length <= redirectExtras)) {
        await waitForBody();
        continue;
      }
      const finalExtra = needsFinalExtra ? extras[redirectExtras] : null;
      /** @type {import('../../../types/cdp.js').ResponseBody} */
      let body;
      try {
        // DurableMessageCollector wydaje tylko is_complete() body. Dla opaque
        // nie ma loadingFinished; przed końcem transferu polecenie odrzuca.
        body = await sendDebuggerCommand(target, 'Network.getResponseBody', { requestId });
      } catch (error) {
        assertActive();
        const message = error instanceof Error ? error.message : String(error);
        if (!/No data found|No resource with given identifier|not finished loading/i.test(message)) throw error;
        await waitForBody();
        continue;
      }
      assertActive();
      if (typeof body.body !== 'string') throw new Error('CDP did not return a complete response body.');
      const byteLength = bodyByteLength(body.body, body.base64Encoded === true, maxBytes);
      if (byteLength > maxBytes) throw new Error('Body is larger than ' + maxBytes + ' bytes.');
      const status = finalExtra?.statusCode ?? metadata.status;
      if (typeof status !== 'number' || status <= 0) throw new Error('CDP did not return an HTTP status.');
      return {
        success: true,
        httpStatusCode: status,
        headers: finalExtra?.headers || metadata.headers || {},
        mimeType: metadata.mimeType,
        content: body.body,
        base64Encoded: body.base64Encoded === true
      };
    }
  }
  try {
    return await Promise.race([operation(), stopped]);
  } finally {
    active = false;
    clearTimeout(timer);
    controller.abort();
    chrome.debugger.onEvent.removeListener(onEvent);
    chrome.debugger.onDetach.removeListener(onDetach);
    extraResponses.clear();
    if (!detached) {
      detached = true;
      try { await detachDebugger(target); } catch { /* Target mógł już zniknąć. */ }
    }
  }
}
