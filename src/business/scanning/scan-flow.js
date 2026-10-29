/** @typedef {import('../../../types/scanning.js').ScanBrowser} ScanBrowser */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {{id:number, url?:string}} ActiveTab */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} ScanFlowPorts
 * @property {ScanBrowser} browser
 * @property {()=>Promise<ActiveTab>} getActiveTab
 * @property {(tabId:number)=>Promise<void>} attachDebugger
 * @property {(tabId:number)=>Promise<void>} detachDebugger
 * @property {Map<number,ScanState>} tabStates
 * @property {(tabId:number)=>ScanState} ensureState
 * @property {(state:ScanState)=>void} resetScanData
 * @property {(state:ScanState,pageUrl:string)=>void} setPageInfo
 * @property {(state:ScanState)=>Promise<void>} updatePageInfoFromRuntime
 * @property {(state:ScanState)=>void} scheduleRobotsChecks
 * @property {(state:ScanState)=>Promise<void>} pollPasswordInputInfo
 * @property {(state:ScanState)=>void} startPasswordInputPolling
 * @property {(state:ScanState)=>void} stopPasswordInputPolling
 * @property {Clock} clock
 */

// Scenariusze użytkownika: rozpocznij pełne zbieranie danych, zatrzymaj je z zachowaniem wyników, odczytaj stan.
// Nazwane etapy opisują przebieg; dane poleceń przeglądarki i skrypty strony znajdują się w adapterach technicznych.

import { PASSWORD_INPUT_POLL_INTERVAL_MS } from './config.js';
import { serializeState } from './state-snapshot.js';

/**
 * @param {ScanFlowPorts} ports
 */
export function createScanFlow({
  browser,
  getActiveTab,
  attachDebugger,
  detachDebugger,
  tabStates,
  ensureState,
  resetScanData,
  setPageInfo,
  updatePageInfoFromRuntime,
  scheduleRobotsChecks,
  pollPasswordInputInfo,
  startPasswordInputPolling,
  stopPasswordInputPolling,
  clock
}) {
  // Uruchamia obserwację; zdjęcia i porównania dopisują później zdarzenia CDP.
  // Pełna ścieżka jednego zdjęcia: docs/flows/scanning.md.
  async function startScanWithReload() {
    const tab = await getActiveTab();
    const state = ensureState(tab.id);
    beginNewScan(state, tab);

    try {
      await attachObservation(state);
      await prepareCompleteCapture(state);
      // Przeładuj stronę po przygotowaniu obserwacji, aby zbierać zasoby od początku nowego ładowania.
      await browser.reloadPage(state.tabId);
      startPasswordInputPolling(state);
      markScanReady(state);
      // To bieżący wynik po uruchomieniu, nie oczekiwanie na wszystkie porównania.
      return serializeState(state);
    } catch (error) {
      await recoverFailedStart(state, error);
      return serializeState(state);
    }
  }

  /**
   * @param {ScanState} state
   * @param {ActiveTab} tab
   */
  function beginNewScan(state, tab) {
    // Wyzerowanie stanu wymienia kolekcje wyników, ale nie czeka na rozpoczęte operacje asynchroniczne.
    resetScanData(state);
    setPageInfo(state, tab.url || '');
    state.status = 'attaching';
    state.statusMessage = 'Attaching debugger to the active tab...';
    state.scanStartedAt = clock.nowIso();
    state.scanStoppedAt = '';
    state.debuggerDetachedAt = '';
  }

  /**
   * @param {ScanState} state
   */
  async function attachObservation(state) {
    if (!state.attached) {
      await attachDebugger(state.tabId);
      state.attached = true;
    }
    state.scanning = true;
    state.status = 'scanning';
    state.statusMessage = 'Debugger attached. Enabling Network, Debugger, Runtime, and Page domains...';
  }

  /**
   * @param {ScanState} state
   */
  async function prepareCompleteCapture(state) {
    const tabId = state.tabId;
    await browser.enableNetwork(tabId);
    await browser.enableScriptCapture(tabId);
    await browser.enableRuntime(tabId);
    await browser.enablePageEvents(tabId);

    try {
      await browser.installPasswordBinding(tabId);
    } catch (error) {
      if (!/already exists|duplicate/i.test(/** @type {Error} */ (error).message)) {
        state.statusMessage = `${state.statusMessage} Password binding failed: ${/** @type {Error} */ (error).message}`;
      }
    }
    await browser.installPasswordMonitor(tabId);
    await browser.disableCache(tabId);

    try {
      await browser.bypassServiceWorker(tabId);
    } catch (error) {
      state.statusMessage = `${state.statusMessage} Service worker bypass failed: ${/** @type {Error} */ (error).message}`;
    }
    await updatePageInfoFromRuntime(state);
  }

  /**
   * @param {ScanState} state
   */
  function markScanReady(state) {
    state.status = 'scanning';
    state.statusMessage = 'Scanning images and parsed scripts from the active tab. Password input polling runs every ' + PASSWORD_INPUT_POLL_INTERVAL_MS + ' ms.';
  }

  /**
   * @param {ScanState} state
   * @param {unknown} error
   */
  async function recoverFailedStart(state, error) {
    state.scanning = false;
    state.status = 'error';
    state.statusMessage = /** @type {Error} */ (error).message;
    state.scanStoppedAt = clock.nowIso();
    stopPasswordInputPolling(state);

    if (!state.attached) {
      return;
    }
    try {
      state.stopRequested = true;
      await detachDebugger(state.tabId);
    } catch (detachError) {
      state.statusMessage = `${/** @type {Error} */ (error).message} Also failed to detach debugger: ${/** @type {Error} */ (detachError).message}`;
    } finally {
      state.attached = false;
      state.stopRequested = false;
    }
  }

  /**
   * @param {number} preferredTabId
   */
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

  // Odłącza obserwację i zachowuje wyniki; nie czeka na rozpoczęte porównania zdjęć.
  async function stopScan() {
    const tab = await getActiveTab();
    const state = findAttachedState(tab.id) || ensureState(tab.id);

    if (!state.attached) {
      stopPasswordInputPolling(state);
      state.scanning = false;
      state.status = 'stopped';
      state.statusMessage = 'No debugger is attached.';
      state.scanStoppedAt = state.scanStoppedAt || clock.nowIso();
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
      state.scanStoppedAt = clock.nowIso();
    } catch (error) {
      state.stopRequested = false;
      state.status = 'error';
      state.statusMessage = /** @type {Error} */ (error).message;
      state.scanStoppedAt = clock.nowIso();
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
      // Odczyt stanu może też odświeżyć pola hasła i zlecić brakujące kontrole robots.txt.
      await pollPasswordInputInfo(state);
      scheduleRobotsChecks(state);
    }

    return serializeState(state, tab.id);
  }

  return { startScanWithReload, stopScan, getActiveTabState };
}
