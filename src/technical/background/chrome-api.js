// Funkcje zwracające Promise obsługują błędy funkcji zwrotnych Chrome na granicy z przeglądarką.

const DEBUGGER_PROTOCOL_VERSION = '1.3';

/**
 * @param {string} messagePrefix
 */
function chromeError(messagePrefix) {
  const error = chrome.runtime.lastError;
  if (!error) {
    return null;
  }

  return new Error(`${messagePrefix}: ${error.message}`);
}

/**
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export function attachDebugger(tabId) {
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

/**
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export function detachDebugger(tabId) {
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

// Przekształć odpowiedź przed rozstrzygnięciem Promise, zachowując kolejność zdarzeń z jednym await.
/**
 * @template {object} [R=object]
 * @template [T=R]
 * @param {number} tabId
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 * @param {(result:R)=>T} [readResult]
 * @returns {Promise<T>}
 */
export function sendDebuggerCommand(
  tabId,
  method,
  params = {},
  readResult = (result) => /** @type {R & T} */ (result)
) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const error = chromeError(`CDP command failed (${method})`);
      if (error) {
        reject(error);
        return;
      }

      try {
        resolve(readResult(/** @type {R} */ (result || {})));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * @returns {Promise<chrome.tabs.Tab & {id:number}>}
 */
export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab || typeof activeTab.id !== 'number') {
    throw new Error('No active tab was found.');
  }

  return /** @type {chrome.tabs.Tab & {id:number}} */ (activeTab);
}
