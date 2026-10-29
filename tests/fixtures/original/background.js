'use strict';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const IMAGE_EXTENSION_RE = /\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)$/i;
const PASSWORD_ACCESS_BINDING = '__networkAssetInspectorPasswordAccess';
const PASSWORD_INPUT_POLL_INTERVAL_MS = 1000;
const ROBOTS_READ_LIMIT_BYTES = 262144;
const IMAGE_BODY_COMPARE_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_BODY_COMPARE_CONCURRENCY = 2;
const GOOGLE_IMAGE_USER_AGENTS = ['googlebot-image', 'googlebot', '*'];
const PASSWORD_ACCESS_MONITOR_SOURCE = `
(() => {
  if (window.__networkAssetInspectorPasswordMonitorInstalled) {
    return;
  }

  Object.defineProperty(window, '__networkAssetInspectorPasswordMonitorInstalled', {
    value: true,
    configurable: false
  });

  const bindingName = '${PASSWORD_ACCESS_BINDING}';
  const originalType = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type');
  const originalValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  const safeString = (value) => {
    try {
      return String(value === undefined || value === null ? '' : value).slice(0, 250);
    } catch (error) {
      return '';
    }
  };

  const getInputType = (target) => {
    try {
      if (originalType && originalType.get) {
        return safeString(originalType.get.call(target)).toLowerCase();
      }
      return safeString(target.getAttribute('type')).toLowerCase();
    } catch (error) {
      return '';
    }
  };

  const isPasswordInput = (target) => {
    try {
      return target instanceof HTMLInputElement && getInputType(target) === 'password';
    } catch (error) {
      return false;
    }
  };

  const summarizeTarget = (target) => {
    if (!target || !target.tagName) {
      return {};
    }
    return {
      tagName: safeString(target.tagName).toLowerCase(),
      id: safeString(target.id),
      name: safeString(target.name),
      autocomplete: safeString(target.autocomplete),
      inputType: getInputType(target)
    };
  };

  const report = (kind, target, detail) => {
    try {
      const binding = window[bindingName];
      if (typeof binding !== 'function') {
        return;
      }
      binding(JSON.stringify({
        kind: safeString(kind),
        detail: safeString(detail),
        target: summarizeTarget(target),
        pageUrl: safeString(location.href),
        timestamp: new Date().toISOString(),
        stack: String((new Error()).stack || '').slice(0, 8000)
      }));
    } catch (error) {
      // Do not affect page behavior if reporting fails.
    }
  };

  const reportIfPasswordResult = (kind, detail, result) => {
    try {
      if (isPasswordInput(result)) {
        report(kind, result, detail);
        return result;
      }
      if (result && typeof result.length === 'number') {
        const limit = Math.min(result.length, 25);
        for (let index = 0; index < limit; index += 1) {
          if (isPasswordInput(result[index])) {
            report(kind, result[index], detail);
            break;
          }
        }
      }
    } catch (error) {
      // Ignore probe errors.
    }
    return result;
  };

  const wrapMethod = (prototype, methodName, kind) => {
    try {
      const original = prototype && prototype[methodName];
      if (typeof original !== 'function') {
        return;
      }
      prototype[methodName] = function wrappedPasswordProbe(...args) {
        const result = original.apply(this, args);
        return reportIfPasswordResult(kind, args[0], result);
      };
    } catch (error) {
      // Ignore non-configurable browser APIs.
    }
  };

  if (originalType && originalType.configurable && originalType.get) {
    Object.defineProperty(HTMLInputElement.prototype, 'type', {
      configurable: true,
      enumerable: originalType.enumerable,
      get() {
        const value = originalType.get.call(this);
        if (safeString(value).toLowerCase() === 'password') {
          report('password.type.get', this, 'read input.type');
        }
        return value;
      },
      set(value) {
        if (safeString(value).toLowerCase() === 'password') {
          report('password.type.set', this, 'set input.type=password');
        }
        return originalType.set.call(this, value);
      }
    });
  }

  if (originalValue && originalValue.configurable && originalValue.get) {
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      enumerable: originalValue.enumerable,
      get() {
        if (isPasswordInput(this)) {
          report('password.value.get', this, 'read input.value');
        }
        return originalValue.get.call(this);
      },
      set(value) {
        if (isPasswordInput(this)) {
          report('password.value.set', this, 'write input.value');
        }
        return originalValue.set.call(this, value);
      }
    });
  }

  try {
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function wrappedAddEventListener(type, listener, options) {
      if (isPasswordInput(this)) {
        report('password.addEventListener', this, type);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  } catch (error) {
    // Ignore non-configurable browser APIs.
  }

  wrapMethod(Document.prototype, 'querySelector', 'password.querySelector');
  wrapMethod(Document.prototype, 'querySelectorAll', 'password.querySelectorAll');
  wrapMethod(Document.prototype, 'getElementById', 'password.getElementById');
  wrapMethod(Document.prototype, 'getElementsByName', 'password.getElementsByName');
  wrapMethod(Document.prototype, 'getElementsByTagName', 'password.getElementsByTagName');
  wrapMethod(Document.prototype, 'getElementsByClassName', 'password.getElementsByClassName');
  wrapMethod(Element.prototype, 'querySelector', 'password.element.querySelector');
  wrapMethod(Element.prototype, 'querySelectorAll', 'password.element.querySelectorAll');
})();
//# sourceURL=__network_asset_inspector_password_monitor.js
`;

const tabStates = new Map();

const INTERNAL_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'chromewebdata:',
  'devtools:',
  'edge:',
  'about:'
]);

const KNOWN_MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'com.cn',
  'com.hk',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.in',
  'com.pl',
  'net.pl',
  'org.pl'
]);

function createState(tabId) {
  return {
    tabId,
    attached: false,
    scanning: false,
    stopRequested: false,
    status: 'idle',
    statusMessage: 'No scan has been started for this tab.',
    scanStartedAt: '',
    scanStoppedAt: '',
    debuggerDetachedAt: '',
    pageUrl: '',
    pageOrigin: '',
    pageHostname: '',
    pageRegistrableDomain: '',
    mainFrameId: '',
    images: [],
    imagesByUrl: new Map(),
    imageRequests: new Map(),
    imageBodyCompareQueue: [],
    imageBodyCompareQueuedUrls: new Set(),
    imageBodyCompareActiveCount: 0,
    robotsChecksByOrigin: new Map(),
    robotsChecksInFlight: new Set(),
    scripts: [],
    scriptsById: new Map(),
    scriptRequests: new Map(),
    blockedScriptsByUrl: new Map(),
    contexts: new Map(),
    passwordAccesses: [],
    passwordAccessesByKey: new Map(),
    passwordPollTimerId: null,
    passwordPollInFlight: false,
    passwordInputInfo: {
      hasPasswordInputs: false,
      hasEverPasswordInputs: false,
      count: 0,
      inputs: [],
      lastChecked: ''
    }
  };
}

function ensureState(tabId) {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, createState(tabId));
  }

  return tabStates.get(tabId);
}

function resetScanData(state) {
  stopPasswordInputPolling(state);
  state.stopRequested = false;
  state.scanStartedAt = '';
  state.scanStoppedAt = '';
  state.debuggerDetachedAt = '';
  state.images = [];
  state.imagesByUrl = new Map();
  state.imageRequests = new Map();
  state.imageBodyCompareQueue = [];
  state.imageBodyCompareQueuedUrls = new Set();
  state.imageBodyCompareActiveCount = 0;
  state.robotsChecksByOrigin = new Map();
  state.robotsChecksInFlight = new Set();
  state.mainFrameId = '';
  state.imageBodyCompareQueue = [];
  state.imageBodyCompareQueuedUrls = new Set();
  state.imageBodyCompareActiveCount = 0;
  state.scripts = [];
  state.scriptsById = new Map();
  state.scriptRequests = new Map();
  state.blockedScriptsByUrl = new Map();
  state.contexts = new Map();
  state.passwordAccesses = [];
  state.passwordAccessesByKey = new Map();
  state.passwordPollInFlight = false;
  state.passwordInputInfo = {
    hasPasswordInputs: false,
    hasEverPasswordInputs: false,
    count: 0,
    inputs: [],
    lastChecked: ''
  };
}

function chromeError(messagePrefix) {
  const error = chrome.runtime.lastError;
  if (!error) {
    return null;
  }

  return new Error(`${messagePrefix}: ${error.message}`);
}

function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION, () => {
      const error = chromeError('Could not attach debugger');
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function detachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach({ tabId }, () => {
      const error = chromeError('Could not detach debugger');
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sendDebuggerCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const error = chromeError(`CDP command failed (${method})`);
      if (error) {
        reject(error);
        return;
      }

      resolve(result || {});
    });
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab || typeof activeTab.id !== 'number') {
    throw new Error('No active tab was found.');
  }

  return activeTab;
}

function parseUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      origin: '',
      hostname: '',
      protocol: '',
      pathname: '',
      filename: '',
      query: ''
    };
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const parts = pathname.split('/').filter(Boolean);
    const filename = parts.length > 0 ? parts[parts.length - 1] : '';

    return {
      origin: parsed.origin === 'null' ? '' : parsed.origin,
      hostname: parsed.hostname || '',
      protocol: parsed.protocol || '',
      pathname,
      filename: filename || '(index)',
      query: parsed.search || ''
    };
  } catch (error) {
    return {
      origin: '',
      hostname: '',
      protocol: '',
      pathname: '',
      filename: url.slice(0, 80) || '(anonymous)',
      query: ''
    };
  }
}

function isLikelyIpAddress(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

function getRegistrableDomain(hostname) {
  if (!hostname) {
    return '';
  }

  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'localhost' || isLikelyIpAddress(normalized)) {
    return normalized;
  }

  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }

  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  /*
   * This is a small fallback, not a full Public Suffix List implementation.
   * It correctly handles common cases used by this extension, for example:
   * creator.empikfoto.pl -> empikfoto.pl,
   * www.googletagmanager.com -> googletagmanager.com,
   * d2w4x5cd12tf59.cloudfront.net -> cloudfront.net.
   * In production code, prefer a library such as tldts.
   */
  if (KNOWN_MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }

  return lastTwo;
}

function normalizeHeaders(headers) {
  const normalized = {};
  if (!headers || typeof headers !== 'object') {
    return normalized;
  }

  Object.entries(headers).forEach(([name, value]) => {
    const key = String(name || '').toLowerCase();
    if (!key) {
      return;
    }

    const stringValue = Array.isArray(value)
      ? value.join(', ')
      : String(value === undefined || value === null ? '' : value);

    if (!stringValue) {
      return;
    }

    normalized[key] = normalized[key] ? `${normalized[key]}, ${stringValue}` : stringValue;
  });

  return normalized;
}

function mergeHeaders(existingHeaders, incomingHeaders) {
  return {
    ...normalizeHeaders(existingHeaders),
    ...normalizeHeaders(incomingHeaders)
  };
}

function getHeaderValue(headers, name) {
  const normalized = normalizeHeaders(headers);
  return normalized[String(name || '').toLowerCase()] || '';
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.toLowerCase() === 'null') {
    return 'null';
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin === 'null' ? '' : parsed.origin.toLowerCase();
  } catch (error) {
    return raw.toLowerCase();
  }
}

function parseAccessControlAllowOrigin(headers) {
  const value = getHeaderValue(headers, 'access-control-allow-origin');
  if (!value) {
    return { header: '', values: [] };
  }

  return {
    header: value,
    values: value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  };
}

function getImageResponseHeaderEvidence(image) {
  const comparison = image && image.bodyComparison ? image.bodyComparison : null;
  if (comparison && Object.prototype.hasOwnProperty.call(comparison, 'noCredentialsHeaders')) {
    return {
      headers: normalizeHeaders(comparison.noCredentialsHeaders),
      source: 'no-credentials-request'
    };
  }

  return {
    headers: normalizeHeaders(image && image.headers),
    source: 'session-response'
  };
}

function getCorsPixelAccessInfo(image, state) {
  const pageOrigin = normalizeOrigin(state && state.pageOrigin);
  const imageOrigin = normalizeOrigin(parseUrl(image && image.url ? image.url : '').origin);
  const headerEvidence = getImageResponseHeaderEvidence(image);
  const allowOrigin = parseAccessControlAllowOrigin(headerEvidence.headers);
  const normalizedValues = allowOrigin.values.map(normalizeOrigin).filter(Boolean);
  const modes = [];

  if (pageOrigin && imageOrigin && pageOrigin === imageOrigin) {
    modes.push('same-origin');
  }

  if (normalizedValues.includes('*')) {
    modes.push('cors-wildcard');
  }

  if (pageOrigin && normalizedValues.includes(pageOrigin)) {
    modes.push('cors-page-origin');
  }

  if (pageOrigin === 'null' && normalizedValues.includes('null')) {
    modes.push('cors-null-origin');
  }

  return {
    possible: modes.length > 0,
    modes,
    accessControlAllowOrigin: allowOrigin.header,
    responseHeaderSource: headerEvidence.source,
    pageOrigin: state && state.pageOrigin ? state.pageOrigin : '',
    imageOrigin: parseUrl(image && image.url ? image.url : '').origin,
    reason: modes.join(', ')
  };
}

function isImageBodyComparisonImproperAuthorization(image) {
  return image && image.bodyComparison && image.bodyComparison.improperAuthorization === true;
}

function getCorsPixelReadableImproperAuthorizationImages(state) {
  if (!state || !Array.isArray(state.images)) {
    return [];
  }

  return state.images
    .filter(isImageBodyComparisonImproperAuthorization)
    .map((image) => ({ image, cors: getCorsPixelAccessInfo(image, state) }))
    .filter((item) => item.cors.possible);
}

function summarizeCorsPixelReadableImages(items) {
  const domains = new Set();
  const modes = new Set();
  const allowOrigins = new Set();

  items.forEach((item) => {
    const parsed = parseUrl(item.image.url || '');
    if (parsed.hostname) {
      domains.add(getRegistrableDomain(parsed.hostname) || parsed.hostname);
    }
    (item.cors.modes || []).forEach((mode) => modes.add(mode));
    if (item.cors.accessControlAllowOrigin) {
      allowOrigins.add(item.cors.accessControlAllowOrigin);
    }
  });

  return {
    possible: items.length > 0,
    imageCount: items.length,
    imageDomains: Array.from(domains).sort(),
    modes: Array.from(modes).sort(),
    accessControlAllowOrigins: Array.from(allowOrigins).sort().slice(0, 20)
  };
}

function hasCacheNoStore(headers) {
  return /(?:^|[,\s])no-store(?:$|[,\s=;])/i.test(getHeaderValue(headers, 'cache-control'));
}

function hasMeaningfulResponseMetadata(image) {
  return (
    typeof image.status === 'number' ||
    Boolean(image.mimeType) ||
    Object.keys(normalizeHeaders(image.headers)).length > 0
  );
}

function getGoogleRobotsHeaderBlock(headers) {
  const header = getHeaderValue(headers, 'x-robots-tag');
  if (!header) {
    return { header: '', blocked: false, directives: [] };
  }

  const directives = [];
  const blocked = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const scopedMatch = part.match(/^([a-z0-9_-]+)\s*:\s*(.+)$/i);
      const agent = scopedMatch ? scopedMatch[1].toLowerCase() : '';
      const directiveText = (scopedMatch ? scopedMatch[2] : part).toLowerCase();
      const isGoogleScope = !agent || agent === 'googlebot' || agent === 'googlebot-image';
      const blocks = /\b(?:noindex|none|noimageindex)\b/i.test(directiveText);

      directives.push({ agent, value: directiveText, blocksGoogle: isGoogleScope && blocks });
      return isGoogleScope && blocks;
    });

  return { header, blocked, directives };
}

function getRobotsUrlForOrigin(origin) {
  return origin ? `${origin}/robots.txt` : '';
}

function isRobotsCheckableUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(parsed.origin && (parsed.protocol === 'http:' || parsed.protocol === 'https:'));
}

function parseRobotsTxt(text) {
  const groups = [];
  let currentGroup = null;

  String(text || '').split(/\r?\n/).forEach((rawLine) => {
    const commentIndex = rawLine.indexOf('#');
    const line = (commentIndex === -1 ? rawLine : rawLine.slice(0, commentIndex)).trim();
    if (!line) {
      return;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'user-agent') {
      if (!currentGroup || currentGroup.rules.length > 0) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
      }

      if (value) {
        currentGroup.agents.push(value.toLowerCase());
      }
      return;
    }

    if ((key === 'allow' || key === 'disallow') && currentGroup) {
      currentGroup.rules.push({ directive: key, path: value });
    }
  });

  return groups.filter((group) => group.agents.length > 0);
}

function getRobotsAgentSpecificity(agents) {
  let bestSpecificity = -1;

  agents.forEach((agent) => {
    const normalizedAgent = String(agent || '').toLowerCase().trim();
    if (!normalizedAgent) {
      return;
    }

    if (normalizedAgent === '*') {
      bestSpecificity = Math.max(bestSpecificity, 0);
      return;
    }

    GOOGLE_IMAGE_USER_AGENTS.forEach((targetAgent) => {
      if (targetAgent !== '*' && targetAgent.startsWith(normalizedAgent)) {
        bestSpecificity = Math.max(bestSpecificity, normalizedAgent.length);
      }
    });
  });

  return bestSpecificity;
}

function robotsPatternToRegExp(pattern) {
  const hasEndAnchor = pattern.endsWith('$');
  const patternBody = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = patternBody
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${escaped}${hasEndAnchor ? '$' : ''}`);
}

function robotsRuleMatches(pattern, path) {
  if (!pattern) {
    return false;
  }

  try {
    return robotsPatternToRegExp(pattern).test(path);
  } catch (error) {
    return path.startsWith(pattern.replace(/[*$]/g, ''));
  }
}

function getRobotsRuleSpecificity(pattern) {
  return String(pattern || '').replace(/\*/g, '').replace(/\$$/, '').length;
}

function evaluateRobotsForPath(groups, path) {
  const candidates = groups
    .map((group) => ({
      group,
      specificity: getRobotsAgentSpecificity(group.agents)
    }))
    .filter((candidate) => candidate.specificity >= 0);

  if (candidates.length === 0) {
    return { blocked: false, matchedRule: null };
  }

  const bestSpecificity = Math.max(...candidates.map((candidate) => candidate.specificity));
  const relevantRules = candidates
    .filter((candidate) => candidate.specificity === bestSpecificity)
    .flatMap((candidate) => candidate.group.rules);

  let bestRule = null;

  relevantRules.forEach((rule) => {
    if (!rule.path || !robotsRuleMatches(rule.path, path)) {
      return;
    }

    const specificity = getRobotsRuleSpecificity(rule.path);
    if (
      !bestRule ||
      specificity > bestRule.specificity ||
      (specificity === bestRule.specificity && rule.directive === 'allow' && bestRule.directive === 'disallow')
    ) {
      bestRule = { ...rule, specificity };
    }
  });

  if (!bestRule) {
    return { blocked: false, matchedRule: null };
  }

  return {
    blocked: bestRule.directive === 'disallow',
    matchedRule: {
      directive: bestRule.directive,
      path: bestRule.path,
      specificity: bestRule.specificity
    }
  };
}

function getRobotsResultForImage(image, state) {
  const parsed = parseUrl(image.url);
  const robotsUrl = getRobotsUrlForOrigin(parsed.origin);

  if (!robotsUrl || !isRobotsCheckableUrl(image.url)) {
    return { status: 'unavailable', blocked: false, robotsUrl: '', message: 'Only http and https image URLs can be checked.' };
  }

  const check = state && state.robotsChecksByOrigin ? state.robotsChecksByOrigin.get(parsed.origin) : null;
  if (!check) {
    return { status: 'unchecked', blocked: false, robotsUrl, message: 'robots.txt has not been checked yet.' };
  }

  if (check.status !== 'loaded') {
    return {
      status: check.status,
      checkedAt: check.checkedAt || '',
      blocked: false,
      robotsUrl: check.robotsUrl || robotsUrl,
      message: check.message || '',
      httpStatusCode: check.httpStatusCode || null
    };
  }

  const path = `${parsed.pathname || '/'}${parsed.query || ''}`;
  const evaluation = evaluateRobotsForPath(check.groups || [], path || '/');

  return {
    status: evaluation.blocked ? 'blocked' : 'allowed',
    checkedAt: check.checkedAt || '',
    blocked: evaluation.blocked,
    robotsUrl: check.robotsUrl || robotsUrl,
    message: evaluation.blocked ? 'robots.txt blocks Google image crawling for this path.' : '',
    httpStatusCode: check.httpStatusCode || null,
    matchedRule: evaluation.matchedRule
  };
}

function getImageAuditInfo(image, state) {
  const headerEvidence = getImageResponseHeaderEvidence(image);
  const headers = headerEvidence.headers;
  const comparison = image && image.bodyComparison ? image.bodyComparison : {};
  const cacheChecked = headerEvidence.source === 'no-credentials-request'
    ? comparison.noCredentialsStatus !== null && comparison.noCredentialsStatus !== undefined
    : hasMeaningfulResponseMetadata(image);
  const cacheHasNoStore = hasCacheNoStore(headers);
  const headerBlock = getGoogleRobotsHeaderBlock(headers);
  const robotsResult = getRobotsResultForImage(image, state);
  const robotsCheckAllowsGoogle = robotsResult.status === 'allowed' || robotsResult.status === 'not-found';
  const googleBlocked = headerBlock.blocked || robotsResult.blocked === true;
  const googleNotBlocked = !googleBlocked && robotsCheckAllowsGoogle;

  return {
    cache: {
      checked: cacheChecked,
      headerSource: headerEvidence.source,
      cacheControl: getHeaderValue(headers, 'cache-control'),
      hasNoStore: cacheHasNoStore,
      missingNoStore: cacheChecked && !cacheHasNoStore
    },
    indexing: {
      xRobotsTag: headerBlock.header,
      headerSource: headerEvidence.source,
      xRobotsDirectives: headerBlock.directives,
      headerBlocksGoogle: headerBlock.blocked,
      robotsTxtStatus: robotsResult.status,
      robotsTxtCheckedAt: robotsResult.checkedAt || '',
      robotsTxtUrl: robotsResult.robotsUrl,
      robotsTxtBlocksGoogle: robotsResult.blocked === true,
      robotsTxtMatchedRule: robotsResult.matchedRule || null,
      robotsTxtMessage: robotsResult.message || '',
      robotsTxtHttpStatusCode: robotsResult.httpStatusCode || null,
      googleBlocked,
      googleNotBlocked,
      googleIndexingOpen: googleNotBlocked
    }
  };
}

async function readCdpStream(tabId, streamHandle) {
  let text = '';

  try {
    while (text.length < ROBOTS_READ_LIMIT_BYTES) {
      const chunk = await sendDebuggerCommand(tabId, 'IO.read', { handle: streamHandle });
      if (chunk.data) {
        text += chunk.base64Encoded ? atob(chunk.data) : chunk.data;
      }

      if (chunk.eof === true) {
        break;
      }
    }
  } finally {
    try {
      await sendDebuggerCommand(tabId, 'IO.close', { handle: streamHandle });
    } catch (error) {
      // Closing a stream is best-effort; the audit result is still useful.
    }
  }

  return text;
}

function decodeCdpBodyToBytes(body, base64Encoded) {
  if (!body) {
    return new Uint8Array();
  }

  if (!base64Encoded) {
    return new TextEncoder().encode(String(body));
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getImagePreviewMimeType(image) {
  const mimeType = String(image && image.mimeType ? image.mimeType : '').split(';')[0].trim().toLowerCase();
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml' && mimeType !== 'image/gif') {
    return mimeType;
  }

  const pathname = parseUrl(image && image.url ? image.url : '').pathname.toLowerCase();
  if (/\.jpe?g$/i.test(pathname)) {
    return 'image/jpeg';
  }
  if (/\.png$/i.test(pathname)) {
    return 'image/png';
  }
  if (/\.webp$/i.test(pathname)) {
    return 'image/webp';
  }
  if (/\.avif$/i.test(pathname)) {
    return 'image/avif';
  }
  if (/\.bmp$/i.test(pathname)) {
    return 'image/bmp';
  }
  if (/\.ico$/i.test(pathname)) {
    return 'image/x-icon';
  }

  return '';
}

function makeImagePreviewDataUrl(image, originalBody, originalBytes) {
  if (!originalBytes || originalBytes.length === 0 || originalBytes.length > IMAGE_PREVIEW_MAX_BYTES) {
    return '';
  }

  const mimeType = getImagePreviewMimeType(image);
  if (!mimeType) {
    return '';
  }

  const base64 = originalBody && originalBody.base64Encoded === true
    ? String(originalBody.body || '')
    : bytesToBase64(originalBytes);

  return `data:${mimeType};base64,${base64}`;
}

function concatByteChunks(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readCdpStreamBytes(tabId, streamHandle, maxBytes) {
  const chunks = [];
  let totalLength = 0;

  try {
    while (true) {
      const chunk = await sendDebuggerCommand(tabId, 'IO.read', { handle: streamHandle });
      const bytes = decodeCdpBodyToBytes(chunk.data || '', chunk.base64Encoded === true);

      if (bytes.length > 0) {
        totalLength += bytes.length;
        if (totalLength > maxBytes) {
          throw new Error(`Body is larger than ${maxBytes} bytes.`);
        }
        chunks.push(bytes);
      }

      if (chunk.eof === true) {
        break;
      }
    }
  } finally {
    try {
      await sendDebuggerCommand(tabId, 'IO.close', { handle: streamHandle });
    } catch (error) {
      // Closing a stream is best-effort; the comparison result is still useful.
    }
  }

  return concatByteChunks(chunks, totalLength);
}

function isSuccessfulHttpStatus(status) {
  return typeof status === 'number' && status >= 200 && status < 300;
}

function setImageBodyComparison(image, patch) {
  image.bodyComparison = {
    ...(image.bodyComparison || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

function markImageBodyComparisonSkipped(image, reason) {
  setImageBodyComparison(image, {
    status: 'skipped',
    exactMatch: false,
    improperAuthorization: false,
    reason
  });
}

function enqueueImageBodyComparison(state, requestId, url, encodedDataLength) {
  if (!state || !state.attached || !requestId || !url || !isRobotsCheckableUrl(url)) {
    return;
  }

  const image = state.imagesByUrl.get(url);
  if (!image) {
    return;
  }

  if (typeof encodedDataLength === 'number' && encodedDataLength > IMAGE_BODY_COMPARE_MAX_BYTES) {
    markImageBodyComparisonSkipped(image, `Encoded data length is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
    return;
  }

  const existingStatus = image.bodyComparison && image.bodyComparison.status;
  if (existingStatus === 'queued' || existingStatus === 'checking' || existingStatus === 'same' || existingStatus === 'different') {
    return;
  }

  if (state.imageBodyCompareQueuedUrls.has(url)) {
    return;
  }

  setImageBodyComparison(image, {
    status: 'queued',
    exactMatch: false,
    improperAuthorization: false,
    mode: 'cdp-no-credentials'
  });
  state.imageBodyCompareQueuedUrls.add(url);
  state.imageBodyCompareQueue.push({ requestId, url });
  runImageBodyCompareQueue(state);
}

function runImageBodyCompareQueue(state) {
  if (!state || !state.attached) {
    return;
  }

  while (state.imageBodyCompareActiveCount < IMAGE_BODY_COMPARE_CONCURRENCY && state.imageBodyCompareQueue.length > 0) {
    const item = state.imageBodyCompareQueue.shift();
    state.imageBodyCompareQueuedUrls.delete(item.url);
    state.imageBodyCompareActiveCount += 1;

    compareImageBodyWithoutCredentials(state, item)
      .catch((error) => {
        const image = state.imagesByUrl.get(item.url);
        if (image) {
          setImageBodyComparison(image, {
            status: 'error',
            exactMatch: false,
            improperAuthorization: false,
            error: error.message
          });
        }
      })
      .finally(() => {
        state.imageBodyCompareActiveCount = Math.max(0, state.imageBodyCompareActiveCount - 1);
        runImageBodyCompareQueue(state);
      });
  }
}

async function compareImageBodyWithoutCredentials(state, item) {
  if (!state.attached || !state.mainFrameId) {
    throw new Error('Debugger is not attached to a loaded frame.');
  }

  const image = state.imagesByUrl.get(item.url);
  if (!image) {
    return;
  }

  setImageBodyComparison(image, {
    status: 'checking',
    exactMatch: false,
    improperAuthorization: false,
    mode: 'cdp-no-credentials'
  });

  const originalBody = await sendDebuggerCommand(state.tabId, 'Network.getResponseBody', {
    requestId: item.requestId
  });
  const originalBytes = decodeCdpBodyToBytes(originalBody.body || '', originalBody.base64Encoded === true);

  if (originalBytes.length > IMAGE_BODY_COMPARE_MAX_BYTES) {
    markImageBodyComparisonSkipped(image, `Original body is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
    return;
  }

  const originalSha256 = await sha256Hex(originalBytes);

  const loaded = await sendDebuggerCommand(state.tabId, 'Network.loadNetworkResource', {
    frameId: state.mainFrameId,
    url: item.url,
    options: {
      disableCache: true,
      includeCredentials: false
    }
  });
  const resource = loaded.resource || {};
  const publicStatus = typeof resource.httpStatusCode === 'number' ? resource.httpStatusCode : null;
  const noCredentialsHeaders = normalizeHeaders(resource.headers);

  if (resource.success === false) {
    setImageBodyComparison(image, {
      status: 'error',
      exactMatch: false,
      improperAuthorization: false,
      originalBodySha256: originalSha256,
      originalBodyLength: originalBytes.length,
      noCredentialsStatus: publicStatus,
      noCredentialsHeaders,
      error: resource.netErrorName || resource.netError || 'No-credentials image load failed.'
    });
    return;
  }

  const publicBytes = resource.stream
    ? await readCdpStreamBytes(state.tabId, resource.stream, IMAGE_BODY_COMPARE_MAX_BYTES)
    : decodeCdpBodyToBytes(resource.content || '', resource.base64Encoded === true);

  if (publicBytes.length > IMAGE_BODY_COMPARE_MAX_BYTES) {
    markImageBodyComparisonSkipped(image, `No-credentials body is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
    return;
  }

  const publicSha256 = await sha256Hex(publicBytes);
  const exactMatch = originalBytes.length === publicBytes.length && originalSha256 === publicSha256;
  const improperAuthorization = exactMatch && isSuccessfulHttpStatus(image.status) && isSuccessfulHttpStatus(publicStatus);

  if (improperAuthorization) {
    const previewDataUrl = makeImagePreviewDataUrl(image, originalBody, originalBytes);
    if (previewDataUrl) {
      image.previewDataUrl = previewDataUrl;
    } else {
      delete image.previewDataUrl;
    }
  } else {
    delete image.previewDataUrl;
  }

  setImageBodyComparison(image, {
    status: exactMatch ? 'same' : 'different',
    exactMatch,
    improperAuthorization,
    originalBodySha256: originalSha256,
    originalBodyLength: originalBytes.length,
    noCredentialsBodySha256: publicSha256,
    noCredentialsBodyLength: publicBytes.length,
    noCredentialsStatus: publicStatus,
    noCredentialsHeaders,
    noCredentialsMimeType: resource.mimeType || '',
    mode: 'cdp-no-credentials',
    comparedAt: new Date().toISOString()
  });
}
async function checkRobotsForOrigin(state, origin) {
  const robotsUrl = getRobotsUrlForOrigin(origin);

  if (!state.attached || !state.mainFrameId) {
    throw new Error('Debugger is not attached to a loaded frame.');
  }

  const result = await sendDebuggerCommand(state.tabId, 'Network.loadNetworkResource', {
    frameId: state.mainFrameId,
    url: robotsUrl,
    options: {
      disableCache: true,
      includeCredentials: false
    }
  });

  const resource = result.resource || {};
  const httpStatusCode = typeof resource.httpStatusCode === 'number' ? resource.httpStatusCode : null;
  const baseResult = {
    origin,
    robotsUrl,
    httpStatusCode,
    headers: normalizeHeaders(resource.headers),
    checkedAt: new Date().toISOString()
  };

  if (httpStatusCode !== null && httpStatusCode >= 400 && httpStatusCode < 500 && httpStatusCode !== 429) {
    state.robotsChecksByOrigin.set(origin, {
      ...baseResult,
      status: 'not-found',
      message: `robots.txt returned HTTP ${httpStatusCode}; Google treats this as no effective robots.txt restriction.`,
      groups: []
    });
    return;
  }

  if (resource.success === false) {
    state.robotsChecksByOrigin.set(origin, {
      ...baseResult,
      status: 'error',
      message: resource.netErrorName || resource.netError || 'Could not load robots.txt.',
      groups: []
    });
    return;
  }

  if (httpStatusCode !== null && (httpStatusCode < 200 || httpStatusCode >= 300)) {
    state.robotsChecksByOrigin.set(origin, {
      ...baseResult,
      status: 'error',
      message: `robots.txt returned HTTP ${httpStatusCode}.`,
      groups: []
    });
    return;
  }

  const body = resource.stream
    ? await readCdpStream(state.tabId, resource.stream)
    : String(resource.content || '');

  state.robotsChecksByOrigin.set(origin, {
    ...baseResult,
    status: 'loaded',
    message: '',
    groups: parseRobotsTxt(body),
    contentLength: body.length
  });
}

function scheduleRobotsCheckForOrigin(state, origin) {
  if (!state || !state.attached || !state.mainFrameId || !origin) {
    return;
  }

  if (state.robotsChecksByOrigin.has(origin) || state.robotsChecksInFlight.has(origin)) {
    return;
  }

  state.robotsChecksByOrigin.set(origin, {
    origin,
    robotsUrl: getRobotsUrlForOrigin(origin),
    status: 'checking',
    message: 'Checking robots.txt...',
    checkedAt: ''
  });
  state.robotsChecksInFlight.add(origin);

  checkRobotsForOrigin(state, origin)
    .catch((error) => {
      state.robotsChecksByOrigin.set(origin, {
        origin,
        robotsUrl: getRobotsUrlForOrigin(origin),
        status: 'error',
        message: error.message,
        checkedAt: new Date().toISOString(),
        groups: []
      });
    })
    .finally(() => {
      state.robotsChecksInFlight.delete(origin);
    });
}

function scheduleRobotsCheckForImage(state, url) {
  if (!state || !isRobotsCheckableUrl(url)) {
    return;
  }

  const parsed = parseUrl(url);
  scheduleRobotsCheckForOrigin(state, parsed.origin);
}

function scheduleRobotsChecks(state) {
  if (!state || !state.attached || !state.mainFrameId) {
    return;
  }

  state.images.forEach((image) => scheduleRobotsCheckForImage(state, image.url));
}
function setPageInfo(state, pageUrl) {
  if (!pageUrl || typeof pageUrl !== 'string') {
    return;
  }

  const parsed = parseUrl(pageUrl);
  state.pageUrl = pageUrl;
  state.pageOrigin = parsed.origin;
  state.pageHostname = parsed.hostname;
  state.pageRegistrableDomain = getRegistrableDomain(parsed.hostname);
}

function isTypicalImageUrl(url) {
  if (!url) {
    return false;
  }

  if (/^data:image\//i.test(url)) {
    return true;
  }

  try {
    return IMAGE_EXTENSION_RE.test(new URL(url).pathname);
  } catch (error) {
    return IMAGE_EXTENSION_RE.test(url.split(/[?#]/, 1)[0]);
  }
}

function isImageLike(metadata) {
  return (
    metadata.resourceType === 'Image' ||
    (typeof metadata.mimeType === 'string' && metadata.mimeType.toLowerCase().startsWith('image/')) ||
    isTypicalImageUrl(metadata.url)
  );
}

function normalizeStatus(status) {
  return typeof status === 'number' ? status : null;
}

function normalizeEncodedDataLength(encodedDataLength) {
  return typeof encodedDataLength === 'number' ? encodedDataLength : null;
}

function addOrUpdateImage(state, metadata) {
  if (!metadata.url || !isImageLike(metadata)) {
    return;
  }

  const normalizedHeaders = normalizeHeaders(metadata.headers);

  const existing = state.imagesByUrl.get(metadata.url);
  if (existing) {
    if (metadata.status !== undefined) {
      existing.status = normalizeStatus(metadata.status);
    }
    if (metadata.mimeType) {
      existing.mimeType = metadata.mimeType;
    }
    if (metadata.resourceType) {
      existing.resourceType = metadata.resourceType;
    }
    if (!existing.requestId && metadata.requestId) {
      existing.requestId = metadata.requestId;
    }
    if (metadata.fromDiskCache === true) {
      existing.fromDiskCache = true;
    }
    if (metadata.fromServiceWorker === true) {
      existing.fromServiceWorker = true;
    }
    if (typeof metadata.encodedDataLength === 'number') {
      existing.encodedDataLength = metadata.encodedDataLength;
    }
    if (Object.keys(normalizedHeaders).length > 0) {
      existing.headers = mergeHeaders(existing.headers, normalizedHeaders);
    }
    scheduleRobotsCheckForImage(state, existing.url);
    return;
  }

  const parsed = parseUrl(metadata.url);
  const image = {
    url: metadata.url,
    domain: parsed.hostname,
    status: normalizeStatus(metadata.status),
    mimeType: metadata.mimeType || '',
    resourceType: metadata.resourceType || '',
    requestId: metadata.requestId || '',
    fromDiskCache: metadata.fromDiskCache === true,
    fromServiceWorker: metadata.fromServiceWorker === true,
    encodedDataLength: normalizeEncodedDataLength(metadata.encodedDataLength),
    headers: normalizedHeaders,
    timestamp: new Date().toISOString()
  };

  state.imagesByUrl.set(image.url, image);
  state.images.push(image);
  scheduleRobotsCheckForImage(state, image.url);
}

function mergeImageRequestMetadata(state, requestId, metadata) {
  if (!requestId) {
    return metadata;
  }

  const previous = state.imageRequests.get(requestId) || {};
  const merged = {
    ...previous,
    ...metadata,
    requestId
  };

  state.imageRequests.set(requestId, merged);
  return merged;
}

function mergeScriptRequestMetadata(state, requestId, metadata) {
  if (!requestId) {
    return metadata;
  }

  const previous = state.scriptRequests.get(requestId) || {};
  const merged = {
    ...previous,
    ...metadata,
    requestId
  };

  state.scriptRequests.set(requestId, merged);
  return merged;
}

function isScriptNetworkResource(metadata) {
  return metadata && metadata.resourceType === 'Script';
}

function isBlockedByClientFailure(params) {
  return typeof params.errorText === 'string' && params.errorText.includes('ERR_BLOCKED_BY_CLIENT');
}

function addBlockedThirdPartyScript(state, metadata) {
  if (!metadata || !metadata.url || !isScriptNetworkResource(metadata) || !isBlockedByClientFailure(metadata)) {
    return;
  }

  if (state.blockedScriptsByUrl.has(metadata.url)) {
    const existing = state.blockedScriptsByUrl.get(metadata.url);
    existing.lastSeen = new Date().toISOString();
    existing.requestId = metadata.requestId || existing.requestId;
    existing.errorText = metadata.errorText || existing.errorText;
    existing.blockedReason = metadata.blockedReason || existing.blockedReason;
    return;
  }

  const parsed = parseUrl(metadata.url);
  const script = {
    scriptId: metadata.requestId ? `blocked:${metadata.requestId}` : `blocked:${metadata.url}`,
    url: metadata.url,
    sourceMapURL: '',
    executionContextId: null,
    startLine: null,
    endLine: null,
    isModule: false,
    hash: '',
    embedderName: '',
    type: 'blocked',
    origin: parsed.origin,
    hostname: parsed.hostname,
    protocol: parsed.protocol,
    pathname: parsed.pathname,
    filename: getScriptFilename(parsed, 'blocked', metadata.url),
    query: parsed.query,
    registrableDomain: getRegistrableDomain(parsed.hostname),
    blockedByClient: true,
    blockedReason: metadata.blockedReason || '',
    errorText: metadata.errorText || 'net::ERR_BLOCKED_BY_CLIENT',
    requestId: metadata.requestId || '',
    networkResourceType: metadata.resourceType || 'Script',
    timestamp: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  script.displayName = makeDisplayName(script);
  script.classification = classifyScript(script, state);

  if (script.classification !== 'third-party') {
    return;
  }

  state.blockedScriptsByUrl.set(script.url, script);
  state.scripts.push(script);
}
function handleRequestWillBeSent(state, params) {
  const requestUrl = params.request && params.request.url;
  const metadata = mergeImageRequestMetadata(state, params.requestId, {
    requestId: params.requestId,
    url: requestUrl,
    resourceType: params.type || '',
    mimeType: '',
    timestamp: params.timestamp
  });

  if (params.type === 'Script') {
    mergeScriptRequestMetadata(state, params.requestId, {
      requestId: params.requestId,
      url: requestUrl,
      resourceType: params.type || '',
      timestamp: params.timestamp
    });
  }

  addOrUpdateImage(state, metadata);

  if (params.redirectResponse && params.redirectResponse.url) {
    addOrUpdateImage(state, {
      requestId: params.requestId,
      url: params.redirectResponse.url,
      resourceType: params.type || metadata.resourceType || '',
      status: params.redirectResponse.status,
      mimeType: params.redirectResponse.mimeType || '',
      fromDiskCache: params.redirectResponse.fromDiskCache === true,
      fromServiceWorker: params.redirectResponse.fromServiceWorker === true,
      encodedDataLength: params.redirectResponse.encodedDataLength,
      headers: params.redirectResponse.headers || {}
    });
  }
}

function handleResponseReceived(state, params) {
  const response = params.response || {};
  const metadata = mergeImageRequestMetadata(state, params.requestId, {
    requestId: params.requestId,
    url: response.url || '',
    resourceType: params.type || '',
    status: response.status,
    mimeType: response.mimeType || '',
    fromDiskCache: response.fromDiskCache === true,
    fromServiceWorker: response.fromServiceWorker === true,
    encodedDataLength: response.encodedDataLength,
    headers: response.headers || {},
    timestamp: params.timestamp
  });

  addOrUpdateImage(state, metadata);
}

function handleLoadingFinished(state, params) {
  const metadata = mergeImageRequestMetadata(state, params.requestId, {
    requestId: params.requestId,
    encodedDataLength: params.encodedDataLength
  });

  addOrUpdateImage(state, metadata);
  enqueueImageBodyComparison(state, params.requestId, metadata.url, params.encodedDataLength);
  state.imageRequests.delete(params.requestId);
  state.scriptRequests.delete(params.requestId);
}

function handleLoadingFailed(state, params) {
  const metadata = mergeImageRequestMetadata(state, params.requestId, {
    requestId: params.requestId
  });

  const previousScriptMetadata = state.scriptRequests.get(params.requestId) || {};
  const scriptMetadata = mergeScriptRequestMetadata(state, params.requestId, {
    requestId: params.requestId,
    url: previousScriptMetadata.url || '',
    resourceType: params.type || previousScriptMetadata.resourceType || '',
    errorText: params.errorText || '',
    blockedReason: params.blockedReason || '',
    timestamp: params.timestamp
  });

  addOrUpdateImage(state, metadata);
  addBlockedThirdPartyScript(state, scriptMetadata);
  state.imageRequests.delete(params.requestId);
  state.scriptRequests.delete(params.requestId);
}

function handleRequestServedFromCache(state, params) {
  const metadata = mergeImageRequestMetadata(state, params.requestId, {
    requestId: params.requestId,
    fromDiskCache: true
  });

  addOrUpdateImage(state, metadata);
}

function getScriptType(params) {
  const url = params.url || '';

  if (!url) {
    return params.hasSourceURL || params.embedderName ? 'eval' : 'inline';
  }

  if (/^blob:/i.test(url)) {
    return 'blob';
  }

  if (/^data:/i.test(url)) {
    return 'data';
  }

  if (/^(chrome-extension:|extensions::)/i.test(url)) {
    return 'extension';
  }

  const parsed = parseUrl(url);
  if (INTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return 'chrome-internal';
  }

  if (/^(https?:|file:|ftp:)/i.test(parsed.protocol)) {
    return 'external';
  }

  if (/VM\d+|eval/i.test(url)) {
    return 'eval';
  }

  return 'unknown';
}

function getScriptFilename(parsed, type, url) {
  if (parsed.filename) {
    return parsed.filename;
  }

  if (type === 'inline') {
    return '(inline script)';
  }

  if (type === 'eval') {
    return '(eval script)';
  }

  if (type === 'blob') {
    return '(blob script)';
  }

  if (type === 'data') {
    return '(data script)';
  }

  return url ? url.slice(0, 80) : '(anonymous script)';
}

function classifyScript(script, state) {
  if (script.type === 'chrome-internal' || script.type === 'extension') {
    return 'browser/internal';
  }

  if (script.type === 'inline' || script.type === 'eval' || script.type === 'blob' || script.type === 'data') {
    return 'inline/eval/blob';
  }

  if (!script.origin || !script.hostname) {
    return 'inline/eval/blob';
  }

  if (state.pageOrigin && script.origin === state.pageOrigin) {
    return 'first-party-origin';
  }

  const scriptRegistrableDomain = getRegistrableDomain(script.hostname);
  if (scriptRegistrableDomain && state.pageRegistrableDomain && scriptRegistrableDomain === state.pageRegistrableDomain) {
    return 'same-site';
  }

  return 'third-party';
}

function makeDisplayName(script) {
  if (script.filename && script.query) {
    return `${script.filename}${script.query}`;
  }

  return script.filename || script.url || '(anonymous script)';
}

function normalizeScript(state, params) {
  const url = params.url || '';
  const parsed = parseUrl(url);
  const type = getScriptType(params);
  const script = {
    scriptId: params.scriptId || '',
    url,
    sourceMapURL: params.sourceMapURL || '',
    executionContextId: typeof params.executionContextId === 'number' ? params.executionContextId : null,
    startLine: typeof params.startLine === 'number' ? params.startLine : null,
    endLine: typeof params.endLine === 'number' ? params.endLine : null,
    isModule: params.isModule === true,
    hash: params.hash || '',
    embedderName: params.embedderName || '',
    type,
    origin: parsed.origin,
    hostname: parsed.hostname,
    protocol: parsed.protocol,
    pathname: parsed.pathname,
    filename: getScriptFilename(parsed, type, url),
    query: parsed.query,
    registrableDomain: getRegistrableDomain(parsed.hostname),
    timestamp: new Date().toISOString()
  };

  script.displayName = makeDisplayName(script);
  script.classification = classifyScript(script, state);

  return script;
}

function handleScriptParsed(state, params) {
  const script = normalizeScript(state, params);

  if (script.scriptId && state.scriptsById.has(script.scriptId)) {
    const existing = state.scriptsById.get(script.scriptId);
    Object.assign(existing, script);
    return;
  }

  state.scripts.push(script);

  if (script.scriptId) {
    state.scriptsById.set(script.scriptId, script);
  }
}

function handleExecutionContextCreated(state, params) {
  const context = params.context;
  if (!context || typeof context.id !== 'number') {
    return;
  }

  state.contexts.set(context.id, {
    id: context.id,
    origin: context.origin || '',
    name: context.name || '',
    frameId: context.auxData && context.auxData.frameId ? context.auxData.frameId : '',
    isDefault: context.auxData && context.auxData.isDefault === true
  });
}

function handleFrameNavigated(state, params) {
  const frame = params.frame;
  if (!frame || frame.parentId) {
    return;
  }

  state.mainFrameId = frame.id || '';
  setPageInfo(state, frame.url || '');
  scheduleRobotsChecks(state);
}

function summarizeScript(script) {
  return {
    scriptId: script.scriptId,
    url: script.url,
    sourceMapURL: script.sourceMapURL,
    executionContextId: script.executionContextId,
    startLine: script.startLine,
    endLine: script.endLine,
    isModule: script.isModule,
    hash: script.hash,
    embedderName: script.embedderName,
    type: script.type,
    origin: script.origin,
    hostname: script.hostname,
    protocol: script.protocol,
    pathname: script.pathname,
    filename: script.filename,
    displayName: script.displayName,
    query: script.query,
    registrableDomain: script.registrableDomain,
    classification: script.classification,
    blockedByClient: script.blockedByClient === true,
    blockedReason: script.blockedReason || '',
    errorText: script.errorText || '',
    requestId: script.requestId || '',
    networkResourceType: script.networkResourceType || '',
    timestamp: script.timestamp
  };
}

function getSourceTypeFromUrl(url) {
  if (!url) {
    return 'inline';
  }

  if (/^blob:/i.test(url)) {
    return 'blob';
  }

  if (/^data:/i.test(url)) {
    return 'data';
  }

  if (/^(chrome-extension:|extensions::)/i.test(url)) {
    return 'extension';
  }

  const parsed = parseUrl(url);
  if (INTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return 'chrome-internal';
  }

  if (/^(https?:|file:|ftp:)/i.test(parsed.protocol)) {
    return 'external';
  }

  return 'unknown';
}

function classifySourceUrl(url, state) {
  const parsed = parseUrl(url);
  const type = getSourceTypeFromUrl(url);
  const classification = classifyScript({
    type,
    origin: parsed.origin,
    hostname: parsed.hostname
  }, state);

  return {
    parsed,
    type,
    classification,
    registrableDomain: getRegistrableDomain(parsed.hostname),
    filename: getScriptFilename(parsed, type, url)
  };
}

function parsePasswordStack(stack) {
  if (!stack || typeof stack !== 'string') {
    return [];
  }

  return stack
    .split('\n')
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/\(?((?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/)[^()]*?):(\d+):(\d+)\)?$/);
      if (!match) {
        return null;
      }

      const functionMatch = line.match(/^at\s+([^\s(]+(?:\s+[^\s(]+)*)/);
      return {
        functionName: functionMatch ? functionMatch[1] : '',
        url: match[1],
        lineNumber: Number(match[2]),
        columnNumber: Number(match[3])
      };
    })
    .filter(Boolean);
}

function findPasswordSourceFrame(frames) {
  return frames.find((frame) => (
    frame.url && !frame.url.includes('__network_asset_inspector_password_monitor.js')
  )) || null;
}

function shouldExposePasswordScript(item) {
  return item.classification !== 'inline/eval/blob'
    && item.classification !== 'browser/internal'
    && item.classification !== 'first-party-origin'
    && item.classification !== 'same-site';
}

function shouldExposePasswordAccess(access) {
  return shouldExposePasswordScript(access);
}

function handlePasswordBindingCalled(state, params) {
  if (!params || params.name !== PASSWORD_ACCESS_BINDING) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(params.payload || '{}');
  } catch (error) {
    return;
  }

  const frames = parsePasswordStack(payload.stack || '');
  const sourceFrame = findPasswordSourceFrame(frames);
  const scriptUrl = sourceFrame ? sourceFrame.url : '';
  const source = classifySourceUrl(scriptUrl, state);
  const scriptKey = scriptUrl || '(unknown script)';
  const target = payload.target && typeof payload.target === 'object' ? payload.target : {};
  const key = [
    payload.kind || '',
    scriptKey,
    sourceFrame ? sourceFrame.lineNumber : '',
    sourceFrame ? sourceFrame.columnNumber : '',
    payload.detail || '',
    target.id || '',
    target.name || ''
  ].join('\u0000');

  const existing = state.passwordAccessesByKey.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = new Date().toISOString();
    return;
  }

  const access = {
    id: key,
    kind: payload.kind || 'password.access',
    detail: payload.detail || '',
    target,
    pageUrl: payload.pageUrl || state.pageUrl,
    scriptUrl,
    scriptOrigin: source.parsed.origin,
    scriptHostname: source.parsed.hostname,
    scriptProtocol: source.parsed.protocol,
    scriptPathname: source.parsed.pathname,
    scriptFilename: source.filename,
    scriptType: source.type,
    classification: source.classification,
    registrableDomain: source.registrableDomain,
    functionName: sourceFrame ? sourceFrame.functionName : '',
    lineNumber: sourceFrame ? sourceFrame.lineNumber : null,
    columnNumber: sourceFrame ? sourceFrame.columnNumber : null,
    executionContextId: typeof params.executionContextId === 'number' ? params.executionContextId : null,
    stackFrames: frames.slice(0, 20),
    count: 1,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  state.passwordAccessesByKey.set(key, access);
  state.passwordAccesses.push(access);
}

function getVisiblePasswordAccesses(state) {
  return state.passwordAccesses.filter(shouldExposePasswordAccess);
}

function isPasswordValueAccess(access) {
  return access
    && (access.kind === 'password.value.get' || access.kind === 'password.value.set');
}

function makePotentialPasswordAccess(script, state) {
  const blockedByClient = script.blockedByClient === true;

  return {
    id: `potential:${script.scriptId || script.url || script.displayName}`,
    kind: blockedByClient ? 'blocked-by-client.third-party-script' : 'potential.password-value-capability',
    detail: blockedByClient
      ? 'Script request was blocked by client before execution; it would be a critical DOM access capability if it ran.'
      : 'Page contains input[type=password]; this script has a critical capability to read input.value through DOM if its code does so.',
    target: state.passwordInputInfo.inputs[0] || {},
    pageUrl: state.pageUrl,
    scriptUrl: script.url,
    scriptOrigin: script.origin,
    scriptHostname: script.hostname,
    scriptProtocol: script.protocol,
    scriptPathname: script.pathname,
    scriptFilename: script.displayName || script.filename,
    scriptType: script.type,
    classification: script.classification,
    registrableDomain: script.registrableDomain,
    functionName: '',
    lineNumber: null,
    columnNumber: null,
    executionContextId: script.executionContextId,
    stackFrames: [],
    count: 0,
    observed: false,
    blockedByClient,
    blockedReason: script.blockedReason || '',
    errorText: script.errorText || '',
    firstSeen: script.timestamp,
    lastSeen: script.timestamp
  };
}

function addPasswordAccessToGroup(groupsByKey, access) {
  const mainDomain = access.registrableDomain || getRegistrableDomain(access.scriptHostname || '') || access.scriptHostname || access.scriptOrigin || 'unknown';
  const key = `${access.classification}:${mainDomain}`;

  if (!groupsByKey.has(key)) {
    groupsByKey.set(key, {
      key,
      label: mainDomain,
      hostname: mainDomain,
      origin: access.scriptOrigin || '',
      registrableDomain: mainDomain,
      classification: access.classification,
      accesses: [],
      eventCount: 0,
      valueAccessCount: 0,
      domSignalCount: 0,
      potentialCount: 0,
      blockedCount: 0
    });
  }

  const group = groupsByKey.get(key);
  group.accesses.push({ ...access });
  if (access.blockedByClient === true) {
    group.blockedCount += 1;
  } else if (access.observed === false) {
    group.potentialCount += 1;
  } else {
    group.eventCount += access.count;
    if (isPasswordValueAccess(access)) {
      group.valueAccessCount += access.count;
    } else {
      group.domSignalCount += access.count;
    }
  }
}

function buildPasswordAccessTree(state) {
  const groupsByKey = new Map();
  const visibleAccesses = getVisiblePasswordAccesses(state);
  const observedScriptKeys = new Set(visibleAccesses.map((access) => access.scriptUrl || access.scriptFilename));
  const hasPasswordInputSignal = state.passwordInputInfo.hasPasswordInputs || state.passwordInputInfo.hasEverPasswordInputs;
  const potentialScripts = hasPasswordInputSignal
    ? getVisibleScripts(state).filter((script) => shouldExposePasswordScript(script) && !observedScriptKeys.has(script.url || script.displayName || script.filename))
    : [];

  potentialScripts.forEach((script) => {
    addPasswordAccessToGroup(groupsByKey, makePotentialPasswordAccess(script, state));
  });

  visibleAccesses.forEach((access) => {
    addPasswordAccessToGroup(groupsByKey, { ...access, observed: true });
  });

  const groups = Array.from(groupsByKey.values()).map((group) => {
    group.accesses.sort((a, b) => {
      const byObserved = Number(a.observed === false) - Number(b.observed === false);
      if (byObserved !== 0) {
        return byObserved;
      }
      const byName = a.scriptFilename.localeCompare(b.scriptFilename);
      if (byName !== 0) {
        return byName;
      }
      return a.kind.localeCompare(b.kind);
    });
    group.scriptCount = new Set(group.accesses.map((access) => access.scriptUrl || access.scriptFilename)).size;
    return group;
  });

  groups.sort((a, b) => {
    const byRank = getGroupSortRank(a.classification) - getGroupSortRank(b.classification);
    if (byRank !== 0) {
      return byRank;
    }
    return a.label.localeCompare(b.label);
  });

  const allScriptKeys = new Set();
  groups.forEach((group) => {
    group.accesses.forEach((access) => allScriptKeys.add(access.scriptUrl || access.scriptFilename));
  });
  const totalValueAccesses = visibleAccesses
    .filter(isPasswordValueAccess)
    .reduce((sum, access) => sum + access.count, 0);

  return {
    hasPasswordInputs: state.passwordInputInfo.hasPasswordInputs,
    hasEverPasswordInputs: state.passwordInputInfo.hasEverPasswordInputs === true,
    passwordInputCount: state.passwordInputInfo.count,
    passwordInputs: state.passwordInputInfo.inputs,
    totalAccesses: visibleAccesses.reduce((sum, access) => sum + access.count, 0),
    totalValueAccesses,
    valueAccessDomainsCount: groups.filter((group) => group.valueAccessCount > 0).length,
    domSignalDomainsCount: groups.filter((group) => group.domSignalCount > 0).length,
    uniqueScripts: allScriptKeys.size,
    potentialScripts: potentialScripts.length,
    lastChecked: state.passwordInputInfo.lastChecked || '',
    polling: state.passwordPollTimerId !== null,
    pollIntervalMs: PASSWORD_INPUT_POLL_INTERVAL_MS,
    groups
  };
}
function shouldExposeScript(script) {
  return script.classification !== 'inline/eval/blob'
    && script.classification !== 'browser/internal'
    && script.classification !== 'first-party-origin'
    && script.classification !== 'same-site';
}

function getVisibleScripts(state) {
  return state.scripts.filter(shouldExposeScript);
}
function getGroupSortRank(classification) {
  if (classification === 'first-party-origin') {
    return 1;
  }
  if (classification === 'same-site') {
    return 2;
  }
  if (classification === 'third-party') {
    return 3;
  }
  if (classification === 'inline/eval/blob') {
    return 4;
  }
  if (classification === 'browser/internal') {
    return 5;
  }

  return 9;
}

function buildScriptTree(state) {
  const groupsByKey = new Map();
  const corsPixelAccess = summarizeCorsPixelReadableImages(getCorsPixelReadableImproperAuthorizationImages(state));

  getVisibleScripts(state).forEach((script) => {
    const classification = script.classification || classifyScript(script, state);
    const mainDomain = script.registrableDomain || getRegistrableDomain(script.hostname || '') || script.hostname || script.origin || 'unknown';
    const hostname = mainDomain;
    const label = mainDomain;

    const key = `${classification}:${mainDomain}`;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        label,
        hostname,
        origin: script.origin || '',
        registrableDomain: mainDomain,
        classification,
        scripts: [],
        corsPixelAccess: classification === 'third-party'
          ? corsPixelAccess
          : { possible: false, imageCount: 0, imageDomains: [], modes: [], accessControlAllowOrigins: [] }
      });
    }

    groupsByKey.get(key).scripts.push(summarizeScript(script));
  });

  const groups = Array.from(groupsByKey.values()).map((group) => {
    group.scripts.sort((a, b) => {
      const byName = a.displayName.localeCompare(b.displayName);
      if (byName !== 0) {
        return byName;
      }

      return a.url.localeCompare(b.url);
    });

    group.count = group.scripts.length;
    group.blockedCount = group.scripts.filter((script) => script.blockedByClient === true).length;
    group.corsPixelAccessImageCount = group.corsPixelAccess && group.corsPixelAccess.possible ? group.corsPixelAccess.imageCount : 0;
    return group;
  });

  groups.sort((a, b) => {
    const byRank = getGroupSortRank(a.classification) - getGroupSortRank(b.classification);
    if (byRank !== 0) {
      return byRank;
    }

    return a.label.localeCompare(b.label);
  });

  const thirdPartyGroups = groups.filter((group) => group.classification === 'third-party');
  const thirdPartyScriptsCount = thirdPartyGroups.reduce((sum, group) => sum + group.count, 0);
  const thirdPartyDomainsCount = new Set(thirdPartyGroups.map((group) => group.registrableDomain || group.hostname || group.origin)).size;
  const thirdPartyCorsPixelAccessDomainsCount = thirdPartyGroups.filter((group) => group.corsPixelAccess && group.corsPixelAccess.possible).length;

  return {
    label: 'top',
    pageUrl: state.pageUrl,
    pageOrigin: state.pageOrigin,
    pageHostname: state.pageHostname,
    pageRegistrableDomain: state.pageRegistrableDomain,
    totalScripts: getVisibleScripts(state).length,
    thirdPartyScriptsCount,
    thirdPartyDomainsCount,
    thirdPartyCorsPixelAccessDomainsCount,
    corsPixelAccess,
    groups,
    thirdPartyGroups
  };
}

function serializeImage(image, state) {
  const audit = getImageAuditInfo(image, state);
  const corsPixelAccess = getCorsPixelAccessInfo(image, state);

  return {
    ...image,
    cache: audit.cache,
    cacheControl: audit.cache.cacheControl,
    hasCacheNoStore: audit.cache.hasNoStore,
    missingCacheNoStore: audit.cache.missingNoStore,
    indexing: audit.indexing,
    googleIndexingBlocked: audit.indexing.googleBlocked,
    googleIndexingNotBlocked: audit.indexing.googleNotBlocked,
    googleIndexingOpen: audit.indexing.googleIndexingOpen,
    corsPixelAccess,
    jsPixelAccessPossible: corsPixelAccess.possible,
    bodyExactMatchNoCredentials: image.bodyComparison && image.bodyComparison.exactMatch === true,
    improperImageAuthorization: image.bodyComparison && image.bodyComparison.improperAuthorization === true
  };
}

function emptyTree() {
  return {
    label: 'top',
    pageUrl: '',
    pageOrigin: '',
    pageHostname: '',
    pageRegistrableDomain: '',
    totalScripts: 0,
    thirdPartyScriptsCount: 0,
    thirdPartyDomainsCount: 0,
    thirdPartyCorsPixelAccessDomainsCount: 0,
    corsPixelAccess: { possible: false, imageCount: 0, imageDomains: [], modes: [], accessControlAllowOrigins: [] },
    groups: [],
    thirdPartyGroups: []
  };
}

function serializeState(state, tabId = null) {
  if (!state) {
    return {
      tabId,
      attached: false,
      scanning: false,
      status: 'idle',
      statusMessage: 'No scan has been started for this tab.',
      scanStartedAt: '',
      scanStoppedAt: '',
      debuggerDetachedAt: '',
      pageUrl: '',
      pageOrigin: '',
      images: [],
      imageCount: 0,
      scripts: [],
      scriptTree: emptyTree(),
      passwordAccesses: [],
      passwordInputPolling: false,
      passwordInputPollIntervalMs: PASSWORD_INPUT_POLL_INTERVAL_MS,
      passwordAccessTree: {
        hasPasswordInputs: false,
        hasEverPasswordInputs: false,
        passwordInputCount: 0,
        passwordInputs: [],
        totalAccesses: 0,
        uniqueScripts: 0,
        potentialScripts: 0,
        lastChecked: '',
        polling: false,
        pollIntervalMs: PASSWORD_INPUT_POLL_INTERVAL_MS,
        groups: []
      }
    };
  }

  return {
    tabId: state.tabId,
    attached: state.attached,
    scanning: state.scanning,
    status: state.status,
    statusMessage: state.statusMessage,
    scanStartedAt: state.scanStartedAt || '',
    scanStoppedAt: state.scanStoppedAt || '',
    debuggerDetachedAt: state.debuggerDetachedAt || '',
    pageUrl: state.pageUrl,
    pageOrigin: state.pageOrigin,
    images: state.images.map((image) => serializeImage(image, state)),
    imageCount: state.images.length,
    scripts: getVisibleScripts(state).map(summarizeScript),
    scriptTree: buildScriptTree(state),
    passwordAccesses: getVisiblePasswordAccesses(state),
    passwordInputPolling: state.passwordPollTimerId !== null,
    passwordInputPollIntervalMs: PASSWORD_INPUT_POLL_INTERVAL_MS,
    passwordAccessTree: buildPasswordAccessTree(state)
  };
}

async function updatePageInfoFromRuntime(state) {
  try {
    const result = await sendDebuggerCommand(state.tabId, 'Runtime.evaluate', {
      expression: 'location.href',
      returnByValue: true
    });

    if (result.result && typeof result.result.value === 'string') {
      setPageInfo(state, result.result.value);
    }
  } catch (error) {
    if (!state.pageUrl) {
      state.statusMessage = `${state.statusMessage} Could not read location.href: ${error.message}`;
    }
  }
}

async function updatePasswordInputInfo(state) {
  if (!state || !state.attached) {
    return;
  }

  try {
    const result = await sendDebuggerCommand(state.tabId, 'Runtime.evaluate', {
      expression: `(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        return {
          hasPasswordInputs: inputs.length > 0,
          count: inputs.length,
          inputs: inputs.slice(0, 20).map((input) => ({
            tagName: 'input',
            id: String(input.id || '').slice(0, 250),
            name: String(input.name || '').slice(0, 250),
            autocomplete: String(input.autocomplete || '').slice(0, 250),
            placeholder: String(input.placeholder || '').slice(0, 250),
            inputType: 'password'
          }))
        };
      })()`,
      returnByValue: true
    });

    if (result.result && result.result.value && typeof result.result.value === 'object') {
      const hasPasswordInputs = result.result.value.hasPasswordInputs === true;
      state.passwordInputInfo = {
        hasPasswordInputs,
        hasEverPasswordInputs: state.passwordInputInfo.hasEverPasswordInputs === true || hasPasswordInputs,
        count: typeof result.result.value.count === 'number' ? result.result.value.count : 0,
        inputs: Array.isArray(result.result.value.inputs) ? result.result.value.inputs : [],
        lastChecked: new Date().toISOString()
      };
    }
  } catch (error) {
    state.passwordInputInfo = {
      ...state.passwordInputInfo,
      lastChecked: new Date().toISOString(),
      error: error.message
    };
  }
}
async function pollPasswordInputInfo(state) {
  if (!state || !state.attached || state.passwordPollInFlight) {
    return;
  }

  state.passwordPollInFlight = true;
  try {
    await updatePasswordInputInfo(state);
  } finally {
    state.passwordPollInFlight = false;
  }
}

function startPasswordInputPolling(state) {
  if (!state || !state.attached) {
    return;
  }

  stopPasswordInputPolling(state);
  pollPasswordInputInfo(state);
  state.passwordPollTimerId = setInterval(() => {
    pollPasswordInputInfo(state);
  }, PASSWORD_INPUT_POLL_INTERVAL_MS);
}

function stopPasswordInputPolling(state) {
  if (!state) {
    return;
  }

  if (state.passwordPollTimerId !== null) {
    clearInterval(state.passwordPollTimerId);
    state.passwordPollTimerId = null;
  }

  state.passwordPollInFlight = false;
}

async function startScanWithReload() {
  const tab = await getActiveTab();
  const tabId = tab.id;
  const state = ensureState(tabId);

  resetScanData(state);
  setPageInfo(state, tab.url || '');
  state.status = 'attaching';
  state.statusMessage = 'Attaching debugger to the active tab...';
  state.scanStartedAt = new Date().toISOString();
  state.scanStoppedAt = '';
  state.debuggerDetachedAt = '';

  try {
    if (!state.attached) {
      await attachDebugger(tabId);
      state.attached = true;
    }

    state.scanning = true;
    state.status = 'scanning';
    state.statusMessage = 'Debugger attached. Enabling Network, Debugger, Runtime, and Page domains...';

    await sendDebuggerCommand(tabId, 'Network.enable');
    await sendDebuggerCommand(tabId, 'Debugger.enable');
    await sendDebuggerCommand(tabId, 'Runtime.enable');
    await sendDebuggerCommand(tabId, 'Page.enable');

    try {
      await sendDebuggerCommand(tabId, 'Runtime.addBinding', { name: PASSWORD_ACCESS_BINDING });
    } catch (error) {
      if (!/already exists|duplicate/i.test(error.message)) {
        state.statusMessage = `${state.statusMessage} Password binding failed: ${error.message}`;
      }
    }

    await sendDebuggerCommand(tabId, 'Page.addScriptToEvaluateOnNewDocument', {
      source: PASSWORD_ACCESS_MONITOR_SOURCE
    });

    await sendDebuggerCommand(tabId, 'Network.setCacheDisabled', { cacheDisabled: true });

    try {
      await sendDebuggerCommand(tabId, 'Network.setBypassServiceWorker', { bypass: true });
    } catch (error) {
      state.statusMessage = `${state.statusMessage} Service worker bypass failed: ${error.message}`;
    }

    await updatePageInfoFromRuntime(state);

    /*
     * chrome.debugger only receives Network request events and
     * Debugger.scriptParsed events after the debugger is attached and the CDP
     * domains are enabled. Reloading here makes the page load and parse again,
     * so images and scripts parsed before attachment are not silently missed.
     */
    await sendDebuggerCommand(tabId, 'Page.reload', { ignoreCache: true });
    startPasswordInputPolling(state);

    state.status = 'scanning';
    state.statusMessage = 'Scanning images and parsed scripts from the active tab. Password input polling runs every ' + PASSWORD_INPUT_POLL_INTERVAL_MS + ' ms.';

    return serializeState(state);
  } catch (error) {
    state.scanning = false;
    state.status = 'error';
    state.statusMessage = error.message;
    state.scanStoppedAt = new Date().toISOString();

    stopPasswordInputPolling(state);

    if (state.attached) {
      try {
        state.stopRequested = true;
        await detachDebugger(tabId);
      } catch (detachError) {
        state.statusMessage = `${error.message} Also failed to detach debugger: ${detachError.message}`;
      } finally {
        state.attached = false;
        state.stopRequested = false;
      }
    }

    return serializeState(state);
  }
}

function findAttachedState(preferredTabId) {
  const preferred = tabStates.get(preferredTabId);
  if (preferred && preferred.attached) {
    return preferred;
  }

  for (const state of tabStates.values()) {
    if (state.attached) {
      return state;
    }
  }

  return preferred || null;
}

async function stopScan() {
  const tab = await getActiveTab();
  const state = findAttachedState(tab.id) || ensureState(tab.id);

  if (!state.attached) {
    stopPasswordInputPolling(state);
    state.scanning = false;
    state.status = 'stopped';
    state.statusMessage = 'No debugger is attached.';
    state.scanStoppedAt = state.scanStoppedAt || new Date().toISOString();
    return serializeState(state);
  }

  state.stopRequested = true;
  state.status = 'stopping';
  state.statusMessage = 'Detaching debugger...';

  stopPasswordInputPolling(state);

  try {
    await detachDebugger(state.tabId);
    state.attached = false;
    state.scanning = false;
    state.stopRequested = false;
    state.status = 'stopped';
    state.statusMessage = 'Scan stopped. Existing image and script results were kept.';
    state.scanStoppedAt = new Date().toISOString();
  } catch (error) {
    state.stopRequested = false;
    state.status = 'error';
    state.statusMessage = error.message;
    state.scanStoppedAt = new Date().toISOString();
  }

  return serializeState(state);
}

async function getActiveTabState() {
  const tab = await getActiveTab();
  const state = tabStates.get(tab.id);

  if (!state) {
    const attachedElsewhere = Array.from(tabStates.values()).find((candidate) => candidate.attached);
    if (attachedElsewhere) {
      const serialized = serializeState(null, tab.id);
      serialized.statusMessage = `Active tab is not the scanned tab. A scan is still attached to tab ${attachedElsewhere.tabId}.`;
      return serialized;
    }
  }

  if (state && state.attached) {
    await pollPasswordInputInfo(state);
    scheduleRobotsChecks(state);
  }

  return serializeState(state, tab.id);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
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
  })()
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (typeof source.tabId !== 'number') {
    return;
  }

  const state = tabStates.get(source.tabId);
  if (!state || !state.attached) {
    return;
  }

  if (method === 'Network.requestWillBeSent') {
    handleRequestWillBeSent(state, params);
  } else if (method === 'Network.responseReceived') {
    handleResponseReceived(state, params);
  } else if (method === 'Network.loadingFinished') {
    handleLoadingFinished(state, params);
  } else if (method === 'Network.loadingFailed') {
    handleLoadingFailed(state, params);
  } else if (method === 'Network.requestServedFromCache') {
    handleRequestServedFromCache(state, params);
  } else if (method === 'Debugger.scriptParsed') {
    handleScriptParsed(state, params);
  } else if (method === 'Runtime.bindingCalled') {
    handlePasswordBindingCalled(state, params);
  } else if (method === 'Runtime.executionContextCreated') {
    handleExecutionContextCreated(state, params);
  } else if (method === 'Page.frameNavigated') {
    handleFrameNavigated(state, params);
  } else if (method === 'Page.domContentEventFired' || method === 'Page.loadEventFired') {
    pollPasswordInputInfo(state).catch((error) => {
      state.passwordInputInfo = {
        ...state.passwordInputInfo,
        lastChecked: new Date().toISOString(),
        error: error.message
      };
    });
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (typeof source.tabId !== 'number') {
    return;
  }

  const state = tabStates.get(source.tabId);
  if (!state) {
    return;
  }

  stopPasswordInputPolling(state);
  state.attached = false;
  state.scanning = false;
  state.robotsChecksInFlight = new Set();
  state.imageBodyCompareQueue = [];
  state.imageBodyCompareQueuedUrls = new Set();
  state.imageBodyCompareActiveCount = 0;
  state.debuggerDetachedAt = new Date().toISOString();
  state.scanStoppedAt = state.scanStoppedAt || state.debuggerDetachedAt;
  if (state.stopRequested) {
    state.stopRequested = false;
    state.status = 'stopped';
    state.statusMessage = 'Scan stopped. Existing image and script results were kept.';
    return;
  }

  if (reason === 'target_closed') {
    state.status = 'closed';
    state.statusMessage = 'The scanned tab was closed.';
    return;
  }

  state.status = 'detached';
  state.statusMessage = `Debugger detached by Chrome (${reason}). DevTools may have been opened, another debugger attached, or the target changed.`;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const state = tabStates.get(tabId);
  if (!state) {
    return;
  }

  stopPasswordInputPolling(state);
  state.attached = false;
  state.scanning = false;
  state.robotsChecksInFlight = new Set();
  state.imageBodyCompareQueue = [];
  state.imageBodyCompareQueuedUrls = new Set();
  state.imageBodyCompareActiveCount = 0;
  state.debuggerDetachedAt = new Date().toISOString();
  state.scanStoppedAt = state.scanStoppedAt || state.debuggerDetachedAt;
  state.status = 'closed';
  state.statusMessage = 'The scanned tab was closed.';
});













