/** @typedef {import('../../../types/scanning.js').ScanBrowser} ScanBrowser */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/cdp.js').ExecutionContextCreated} ExecutionContextCreated */
/** @typedef {import('../../../types/cdp.js').FrameNavigated} FrameNavigated */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} PageObservationPorts
 * @property {ScanBrowser['readPageAddress']} readPageAddress
 * @property {(state:ScanState)=>void} scheduleRobotsChecks
 */

// Nawigacja głównej ramy aktualizuje dane strony przed zleceniem kontroli źródeł zasobów.

import { parseUrl, getRegistrableDomain } from './urls.js';
import { retirePasswordContext, retireAllPasswordContexts } from './password-context.js';

/**
 * @param {PageObservationPorts} ports
 */
export function createPageObservationHandlers({ readPageAddress, scheduleRobotsChecks }) {
  // Aktualizuj adres badanej strony, główną ramę i konteksty wykonania zgodnie z danymi CDP.

  /**
   * @param {ScanState} state
   * @param {string} pageUrl
   */
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

  /**
   * @param {ScanState} state
   */
  async function updatePageInfoFromRuntime(state) {
    try {
      const pageUrl = await readPageAddress(state.tabId);

      if (typeof pageUrl === 'string') {
        setPageInfo(state, pageUrl);
      }
    } catch (error) {
      if (!state.pageUrl) {
        state.statusMessage = `${state.statusMessage} Could not read location.href: ${/** @type {Error} */ (error).message}`;
      }
    }
  }

  /**
   * @param {ScanState} state
   * @param {ExecutionContextCreated} params
   */
  function handleExecutionContextCreated(state, params) {
    const context = params.context;
    if (!context || typeof context.id !== 'number') {
      return;
    }

    if (state.contexts.has(context.id)) retirePasswordContext(state, context.id);
    state.contexts.set(context.id, {
      id: context.id,
      origin: context.origin || '',
      name: context.name || '',
      frameId: context.auxData && context.auxData.frameId ? context.auxData.frameId : '',
      isDefault: context.auxData && context.auxData.isDefault === true
    });
  }

  /**
   * @param {ScanState} state
   * @param {FrameNavigated} params
   */
  function handleFrameNavigated(state, params) {
    const frame = params.frame;
    if (!frame) return;
    if (frame.parentId) {
      handleFrameDetached(state, { frameId: frame.id });
      return;
    }

    retireAllPasswordContexts(state);
    state.mainFrameId = frame.id || '';
    setPageInfo(state, frame.url || '');
    scheduleRobotsChecks(state);
  }

  /** @param {ScanState} state @param {{executionContextId?:number}} params */
  function handleExecutionContextDestroyed(state, params) {
    if (typeof params.executionContextId === 'number') retirePasswordContext(state, params.executionContextId);
  }

  /** @param {ScanState} state */
  function handleExecutionContextsCleared(state) {
    retireAllPasswordContexts(state);
  }

  /** @param {ScanState} state @param {{frameId?:string}} params */
  function handleFrameDetached(state, params) {
    if (!params.frameId) return;
    for (const context of state.contexts.values()) {
      if (context.frameId === params.frameId) retirePasswordContext(state, context.id);
    }
  }

  return {
    setPageInfo, updatePageInfoFromRuntime, handleExecutionContextCreated, handleFrameNavigated,
    handleExecutionContextDestroyed, handleExecutionContextsCleared, handleFrameDetached
  };
}
