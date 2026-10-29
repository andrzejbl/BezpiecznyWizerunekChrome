/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} ScanStateStorePorts
 * @property {(state:ScanState)=>void} stopPasswordInputPolling
 */

// Jeden skan na kartę. Wyzerowanie skanu zatrzymuje odpytywanie pól hasła przed usunięciem obserwacji.


/**
 * @param {ScanStateStorePorts} ports
 */
export function createScanStateStore({ stopPasswordInputPolling }) {
  // Jeden mutowalny rekord skanu na kartę; w trakcie skanu te same mapy zbierają kolejne wpisy.

  /** @type {Map<number, ScanState>} */
  const tabStates = new Map();

  /**
   * @param {number} tabId
   * @returns {ScanState}
   */
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
      passwordDocumentRevision: 0,
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

  /**
   * @param {number} tabId
   * @returns {ScanState}
   */
  function ensureState(tabId) {
    if (!tabStates.has(tabId)) {
      tabStates.set(tabId, createState(tabId));
    }

    return /** @type {ScanState} */ (tabStates.get(tabId));
  }

  /**
   * @param {ScanState} state
   */
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
    state.passwordDocumentRevision += 1;
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

  return { tabStates, ensureState, resetScanData };
}
