/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ImageFinding} ImageFinding */
/** @typedef {import('../../../types/scanning.js').ScanSnapshot} ScanSnapshot */

// Przygotuj bieżący wynik dla wiadomości do okna rozszerzenia: tablice i rekordy bez wewnętrznych map.
// Odczyt wyniku nie czeka na kolejkę porównań; pola audytu są wyliczane przy każdym odczycie.

import { PASSWORD_INPUT_POLL_INTERVAL_MS } from './config.js';
import { getCorsPixelAccessInfo } from './image-cors.js';
import { getImageAuditInfo } from './image-audits.js';
import { getVisibleScripts } from './script-classification.js';
import { getVisiblePasswordAccesses } from './password-rules.js';
import { buildPasswordAccessTree } from './password-report.js';
import { summarizeScript, buildScriptTree, emptyTree } from './script-report.js';

/**
 * @param {ImageRecord} image
 * @param {ScanState} state
 * @returns {ImageFinding}
 */
function serializeImage(image, state) {
  const audit = getImageAuditInfo(image, state);
  const corsPixelAccess = getCorsPixelAccessInfo(image, state);

  // Nowy obiekt ma pola rekordu i audytu; operator ... kopiuje tylko pierwszy poziom, nie cały stan.
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

/**
 * @param {ScanState|null|undefined} state
 * @param {number|null} tabId
 * @returns {ScanSnapshot}
 */
export function serializeState(state, tabId = null) {
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
