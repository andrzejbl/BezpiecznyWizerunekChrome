/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {import('../../../types/scanning.js').PasswordObservation} PasswordObservation */
/** @typedef {import('../../../types/scanning.js').PasswordPayload} PasswordPayload */
/** @typedef {import('../../../types/scanning.js').ScannerResponse} ScannerResponse */
/** @typedef {import('../../../types/cdp.js').BindingCalled} BindingCalled */
/** @typedef {import('../../../types/cdp.js').NetworkEvent} NetworkEvent */
/** @typedef {import('../../../types/cdp.js').ScriptParsed} ScriptParsed */
/** @typedef {import('../../../types/cdp.js').ExecutionContextCreated} ExecutionContextCreated */
/** @typedef {import('../../../types/cdp.js').FrameNavigated} FrameNavigated */

import { PASSWORD_ACCESS_BINDING } from './protocol.js';

// Kieruj wiadomości Chrome i zdarzenia CDP do przekazanych funkcji obsługi aplikacji.
// Rejestracja jest jawna; sam import modułu nie wywołuje operacji przeglądarki.


/** @typedef {ReturnType<typeof import("../../business/scanning/scan-flow.js").createScanFlow>} ScanFlow */
/** @typedef {ReturnType<typeof import("../../business/scanning/scan-lifecycle.js").createScanLifecycle>} ScanLifecycle */
/** @typedef {ReturnType<typeof import("../../business/scanning/page-observations.js").createPageObservationHandlers>} PageHandlers */
/** @typedef {ReturnType<typeof import("./network-events.js").createNetworkObservationHandlers>} NetworkHandlers */
/** @typedef {ReturnType<typeof import("../../business/scanning/script-records.js").createScriptRecorder>} ScriptRecorder */
/** @typedef {ReturnType<typeof import("../../business/scanning/password-access.js").createPasswordAccessRecorder>} PasswordRecorder */

/**
 * Funkcje aplikacji podłączone do wiadomości Chrome i zdarzeń debuggera.
 * @typedef {object} ExtensionEventHandlers
 * @property {Map<number,ScanState>} tabStates
 * @property {Clock} clock
 * @property {(state:ScanState)=>Promise<void>} pollPasswordInputInfo
 * @property {ScanFlow["startScanWithReload"]} startScanWithReload
 * @property {ScanFlow["stopScan"]} stopScan
 * @property {ScanFlow["getActiveTabState"]} getActiveTabState
 * @property {ScanLifecycle["handleDebuggerDetached"]} handleDebuggerDetached
 * @property {ScanLifecycle["handleTabRemoved"]} handleTabRemoved
 * @property {PageHandlers["handleExecutionContextCreated"]} handleExecutionContextCreated
 * @property {PageHandlers["handleExecutionContextDestroyed"]} handleExecutionContextDestroyed
 * @property {PageHandlers["handleExecutionContextsCleared"]} handleExecutionContextsCleared
 * @property {PageHandlers["handleFrameDetached"]} handleFrameDetached
 * @property {PageHandlers["handleFrameNavigated"]} handleFrameNavigated
 * @property {NetworkHandlers["handleRequestWillBeSent"]} handleRequestWillBeSent
 * @property {NetworkHandlers["handleResponseReceived"]} handleResponseReceived
 * @property {NetworkHandlers["handleLoadingFinished"]} handleLoadingFinished
 * @property {NetworkHandlers["handleLoadingFailed"]} handleLoadingFailed
 * @property {NetworkHandlers["handleRequestServedFromCache"]} handleRequestServedFromCache
 * @property {ScriptRecorder["handleScriptParsed"]} handleScriptParsed
 * @property {PasswordRecorder["recordPasswordAccess"]} recordPasswordAccess
 */

/**
 * @param {ExtensionEventHandlers} ports
 */
export function registerExtensionListeners({
  tabStates,
  handleExecutionContextCreated,
  handleExecutionContextDestroyed,
  handleExecutionContextsCleared,
  handleFrameDetached,
  handleFrameNavigated,
  handleScriptParsed,
  handleRequestWillBeSent,
  handleResponseReceived,
  handleLoadingFinished,
  handleLoadingFailed,
  handleRequestServedFromCache,
  recordPasswordAccess,
  pollPasswordInputInfo,
  startScanWithReload,
  stopScan,
  getActiveTabState,
  handleDebuggerDetached,
  handleTabRemoved,
  clock
}) {
  // Skrypt wstrzyknięty do strony wysyła JSON przez zarejestrowaną funkcję; warstwa biznesowa otrzymuje obserwację.
  /**
   * @param {BindingCalled} params
   * @returns {PasswordObservation|null}
   */
  function readPasswordObservation(params) {
    if (!params || params.name !== PASSWORD_ACCESS_BINDING) return null;
    /** @type {PasswordPayload} */
    let payload;
    try {
      // Strukturę JSON określa wstrzyknięty monitor; odczyt nie zmienia jego dotychczasowego protokołu.
      payload = JSON.parse(params.payload || '{}');
    } catch (error) {
      return null;
    }
    return {
      payload,
      executionContextId: typeof params.executionContextId === 'number' ? params.executionContextId : null
    };
  }

  /**
   * @param {{type?:string}|null|undefined} message
   * @returns {Promise<ScannerResponse>}
   */
  async function handlePopupRequest(message) {
    if (!message || typeof message.type !== 'string') {
      throw new Error('Unknown message.');
    }

    if (message.type === 'startScanWithReload') {
      return { ok: true, state: await startScanWithReload() };
    }

    if (message.type === 'stopScan') {
      return { ok: true, state: await stopScan() };
    }

    if (message.type === 'getState') {
      return { ok: true, state: await getActiveTabState() };
    }

    throw new Error(`Unsupported message type: ${message.type}`);
  }

  /**
   * @param {{type?:string}|null|undefined} message
   * @param {chrome.runtime.MessageSender} sender
   * @param {(response:ScannerResponse)=>void} sendResponse
   */
  function handleRuntimeMessage(message, sender, sendResponse) {
    handlePopupRequest(message)
      .then((response) => sendResponse(response))
      .catch(/** @param {unknown} error */ (error) => sendResponse({ ok: false, error: /** @type {Error} */ (error).message }));

    // Utrzymaj otwarty kanał odpowiedzi Chrome do zakończenia operacji asynchronicznej.
    return true;
  }

  /**
   * @param {chrome.debugger.Debuggee} source
   * @param {string} method
   * @param {object|undefined} params
   */
  function handleDebuggerEvent(source, method, params) {
    if (typeof source.tabId !== 'number') {
      return;
    }

    const state = tabStates.get(source.tabId);
    if (!state || !state.attached) {
      return;
    }

    if (method === 'Network.requestWillBeSent') {
      handleRequestWillBeSent(state, /** @type {NetworkEvent} */ (params));
    } else if (method === 'Network.responseReceived') {
      handleResponseReceived(state, /** @type {NetworkEvent} */ (params));
    } else if (method === 'Network.loadingFinished') {
      handleLoadingFinished(state, /** @type {NetworkEvent} */ (params));
    } else if (method === 'Network.loadingFailed') {
      handleLoadingFailed(state, /** @type {NetworkEvent} */ (params));
    } else if (method === 'Network.requestServedFromCache') {
      handleRequestServedFromCache(state, /** @type {NetworkEvent} */ (params));
    } else if (method === 'Debugger.scriptParsed') {
      handleScriptParsed(state, /** @type {ScriptParsed} */ (params));
    } else if (method === 'Runtime.bindingCalled') {
      const observation = readPasswordObservation(/** @type {BindingCalled} */ (params));
      if (observation) recordPasswordAccess(state, observation);
    } else if (method === 'Runtime.executionContextCreated') {
      handleExecutionContextCreated(state, /** @type {ExecutionContextCreated} */ (params));
    } else if (method === 'Runtime.executionContextDestroyed') {
      handleExecutionContextDestroyed(state, /** @type {{executionContextId?:number}} */ (params));
    } else if (method === 'Runtime.executionContextsCleared') {
      handleExecutionContextsCleared(state);
    } else if (method === 'Page.frameDetached') {
      handleFrameDetached(state, /** @type {{frameId?:string}} */ (params));
    } else if (method === 'Page.frameNavigated') {
      handleFrameNavigated(state, /** @type {FrameNavigated} */ (params));
    } else if (method === 'Page.domContentEventFired' || method === 'Page.loadEventFired') {
      pollPasswordInputInfo(state).catch(/** @param {unknown} error */ (error) => {
        state.passwordInputInfo = {
          ...state.passwordInputInfo,
          lastChecked: clock.nowIso(),
          error: /** @type {Error} */ (error).message
        };
      });
    }
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  chrome.debugger.onEvent.addListener(handleDebuggerEvent);
  chrome.debugger.onDetach.addListener(handleDebuggerDetached);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);

  return {  };
}
