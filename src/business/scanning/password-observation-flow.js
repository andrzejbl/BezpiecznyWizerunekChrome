/** @typedef {import('../../../types/scanning.js').ScanBrowser} ScanBrowser */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {import('../../../types/scanning.js').Scheduler} Scheduler */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} PasswordObservationPorts
 * @property {ScanBrowser['readPasswordInputs']} readPasswordInputs
 * @property {ScanBrowser['readPasswordContextAccess']} readPasswordContextAccess
 * @property {(state:ScanState)=>Promise<void>} [updateImageContextAccess]
 * @property {Clock} clock
 * @property {Scheduler} scheduler
 */

// Odczytuj metadane pól od razu i cyklicznie; na jednej karcie może trwać jeden odczyt naraz.

import { PASSWORD_INPUT_POLL_INTERVAL_MS } from './config.js';
import { getVisibleScripts } from './script-classification.js';

/**
 * @param {PasswordObservationPorts} ports
 */
export function createPasswordObservationFlow({
  readPasswordInputs,
  readPasswordContextAccess,
  updateImageContextAccess = async () => {},
  clock,
  scheduler
}) {
  // Odpytuj tylko o metadane pól hasła i zapobiegaj nakładaniu się odczytów przez CDP.

  /**
   * @param {ScanState} state
   */
  async function updatePasswordInputInfo(state) {
    if (!state || !state.attached) {
      return;
    }

    const contexts = state.contexts;
    const revision = state.passwordDocumentRevision;
    const frameId = state.mainFrameId;
    const isCurrent = () => state.attached && state.contexts === contexts && state.passwordDocumentRevision === revision;
    try {
      const fieldInfo = await readPasswordInputs(state.tabId);
      if (!isCurrent()) return;

      if (fieldInfo && typeof fieldInfo === 'object') {
        const hasPasswordInputs = fieldInfo.hasPasswordInputs === true;
        state.passwordInputInfo = {
          hasPasswordInputs,
          hasEverPasswordInputs: state.passwordInputInfo.hasEverPasswordInputs === true || hasPasswordInputs,
          count: typeof fieldInfo.count === 'number' ? fieldInfo.count : 0,
          inputs: Array.isArray(fieldInfo.inputs) ? fieldInfo.inputs : [],
          lastChecked: clock.nowIso(),
          frameId,
          documentRevision: revision
        };
      } else {
        throw new Error('Nie udało się ustalić pól hasła w bieżącym dokumencie.');
      }
    } catch (error) {
      if (!isCurrent()) return;
      state.passwordInputInfo = {
        ...state.passwordInputInfo,
        lastChecked: clock.nowIso(),
        error: /** @type {Error} */ (error).message
      };
      return;
    }

    if (!state.passwordInputInfo.hasPasswordInputs && !state.passwordInputInfo.hasEverPasswordInputs) return;
    const contextIds = new Set(getVisibleScripts(state)
      .filter((script) => !script.executionContextDestroyed)
      .map((script) => script.executionContextId));
    await Promise.all(Array.from(contextIds, async (contextId) => {
      if (typeof contextId !== 'number') return;
      const context = contexts.get(contextId);
      if (!context?.frameId || (context.frameId === frameId && context.isDefault)) return;
      delete context.passwordAccess;
      try {
        const accessible = await readPasswordContextAccess(state.tabId, contextId);
        if (isCurrent() && contexts.get(contextId) === context && typeof accessible === 'boolean') {
          context.passwordAccess = {
            scope: accessible ? 'accessible' : 'isolated',
            documentRevision: revision
          };
        }
      } catch (error) {
        // Brak wyniku lub zniknięcie kontekstu pozostawia dostęp nieustalony.
      }
    }));
  }

  /**
   * @param {ScanState} state
   */
  async function pollPasswordInputInfo(state) {
    if (!state || !state.attached || state.passwordPollInFlight) {
      return;
    }

    state.passwordPollInFlight = true;
    const contexts = state.contexts;
    try {
      // Obserwacja zdjęć działa także bez pól hasła i przy błędzie ich odczytu.
      await Promise.all([updatePasswordInputInfo(state), updateImageContextAccess(state)]);
    } finally {
      if (state.contexts === contexts) state.passwordPollInFlight = false;
    }
  }

  /**
   * @param {ScanState} state
   */
  function startPasswordInputPolling(state) {
    if (!state || !state.attached) {
      return;
    }

    stopPasswordInputPolling(state);
    pollPasswordInputInfo(state);
    state.passwordPollTimerId = scheduler.repeat(() => {
      pollPasswordInputInfo(state);
    }, PASSWORD_INPUT_POLL_INTERVAL_MS);
  }

  /**
   * @param {ScanState} state
   */
  function stopPasswordInputPolling(state) {
    if (!state) {
      return;
    }

    if (state.passwordPollTimerId !== null) {
      scheduler.cancel(state.passwordPollTimerId);
      state.passwordPollTimerId = null;
    }

    state.passwordPollInFlight = false;
  }

  return { pollPasswordInputInfo, startPasswordInputPolling, stopPasswordInputPolling };
}
