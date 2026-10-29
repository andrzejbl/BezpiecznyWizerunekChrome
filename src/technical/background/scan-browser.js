/** @typedef {import('../../../types/scanning.js').ScanBrowser} ScanBrowser */
/** @typedef {import('../../../types/scanning.js').PasswordFieldObservation} PasswordFieldObservation */
/** @typedef {import('../../../types/cdp.js').RuntimeEvaluation} RuntimeEvaluation */

// Nazwy poleceń CDP, ich dane i kod wykonywany na stronie pozostają na tej granicy z przeglądarką.
import { sendDebuggerCommand } from './chrome-api.js';
import { PASSWORD_ACCESS_BINDING } from './protocol.js';
import { PASSWORD_ACCESS_MONITOR_SOURCE } from './password-monitor.js';

/** @type {ScanBrowser} */
export const scanBrowser = {
  enableNetwork: (tabId) => sendDebuggerCommand(tabId, 'Network.enable'),
  enableScriptCapture: (tabId) => sendDebuggerCommand(tabId, 'Debugger.enable'),
  enableRuntime: (tabId) => sendDebuggerCommand(tabId, 'Runtime.enable'),
  enablePageEvents: (tabId) => sendDebuggerCommand(tabId, 'Page.enable'),
  installPasswordBinding: (tabId) => sendDebuggerCommand(tabId, 'Runtime.addBinding', { name: PASSWORD_ACCESS_BINDING }),
  installPasswordMonitor: (tabId) => sendDebuggerCommand(tabId, 'Page.addScriptToEvaluateOnNewDocument', { source: PASSWORD_ACCESS_MONITOR_SOURCE }),
  disableCache: (tabId) => sendDebuggerCommand(tabId, 'Network.setCacheDisabled', { cacheDisabled: true }),
  bypassServiceWorker: (tabId) => sendDebuggerCommand(tabId, 'Network.setBypassServiceWorker', { bypass: true }),
  reloadPage: (tabId) => sendDebuggerCommand(tabId, 'Page.reload', { ignoreCache: true }),
  readPageAddress: (tabId) => sendDebuggerCommand(tabId, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true }, /** @param {RuntimeEvaluation} result */ (result) => /** @type {string|undefined} */ (result.result && result.result.value)),
  // window.origin uwzględnia origin nieprzezroczysty (np. sandbox). location.origin opisuje URL.
  // Próba nie pobiera zasobów, nie odczytuje pikseli ani zawartości dokumentu.
  readImageContextAccess: (tabId, contextId) => sendDebuggerCommand(tabId, 'Runtime.evaluate', {
    contextId,
    expression: `(() => {
      if (typeof window === 'undefined') return null;
      let origin;
      try { origin = window.origin; } catch (error) { return null; }
      if (typeof origin !== 'string') return null;
      let topAccessible = null;
      try {
        if (window.top) { void window.top.document; topAccessible = true; }
      } catch (error) {
        if (error && error.name === 'SecurityError') topAccessible = false;
      }
      return { origin, topAccessible };
    })()`,
    returnByValue: true,
    silent: true,
    timeout: 1000
  }, /** @param {RuntimeEvaluation} result */ (result) => {
    const value = /** @type {import('../../../types/scanning.js').ImageContextAccess|undefined} */ (result.result && result.result.value);
    return value && typeof value.origin === 'string' ? value : undefined;
  }),
  // Próba dotyczy wyłącznie dostępu do dokumentu. Nigdy nie odczytuje wartości pól.
  readPasswordContextAccess: (tabId, contextId) => sendDebuggerCommand(tabId, 'Runtime.evaluate', {
    contextId,
    expression: `(() => {
      if (typeof window === 'undefined' || !window.top) return null;
      try {
        void window.top.document;
        return true;
      } catch (error) {
        return error && error.name === 'SecurityError' ? false : null;
      }
    })()`,
    returnByValue: true,
    silent: true,
    timeout: 1000
  }, /** @param {RuntimeEvaluation} result */ (result) => {
    const value = result.result && result.result.value;
    return typeof value === 'boolean' ? value : undefined;
  }),
  readPasswordInputs: (tabId) => sendDebuggerCommand(tabId, 'Runtime.evaluate', {
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
    }, /** @param {RuntimeEvaluation} result */ (result) => /** @type {PasswordFieldObservation|undefined} */ (result.result && result.result.value))
};
