/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} ScanLifecyclePorts
 * @property {Map<number,ScanState>} tabStates
 * @property {(state:ScanState)=>void} stopPasswordInputPolling
 * @property {Clock} clock
 */

// Zdarzenia cyklu życia przeglądarki zatrzymują obserwację i zachowują wcześniej zebrane wyniki.


/**
 * @param {ScanLifecyclePorts} ports
 */
export function createScanLifecycle({
  tabStates,
  stopPasswordInputPolling,
  clock
}) {
  /**
   * @param {{tabId?:number}} source
   * @param {string} reason
   */
  function handleDebuggerDetached(source, reason) {
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
    state.debuggerDetachedAt = clock.nowIso();
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
  }

  /**
   * @param {number} tabId
   */
  function handleTabRemoved(tabId) {
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
    state.debuggerDetachedAt = clock.nowIso();
    state.scanStoppedAt = state.scanStoppedAt || state.debuggerDetachedAt;
    state.status = 'closed';
    state.statusMessage = 'The scanned tab was closed.';
  }

  return { handleDebuggerDetached, handleTabRemoved };
}
