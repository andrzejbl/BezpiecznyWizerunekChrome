/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ScanBrowser} ScanBrowser */

import { getVisibleScripts } from './script-classification.js';
import { getMainWorldImageOrigin, normalizeImageExecutionOrigin } from './image-script-access.js';

// Próba kontekstu nie pobiera zdjęć i nie odczytuje zawartości dokumentu.
/** @param {{readImageContextAccess:ScanBrowser['readImageContextAccess']}} ports */
export function createImageContextObservation({ readImageContextAccess }) {
  /** @param {ScanState} state */
  async function updateImageContextAccess(state) {
    if (!state.attached || !state.images.some((image) => image.bodyComparison?.improperAuthorization === true)) return;
    const contexts = state.contexts;
    const revision = state.passwordDocumentRevision;
    const ids = new Set(getVisibleScripts(state)
      .filter((script) => !script.executionContextDestroyed && !script.blockedByClient)
      .map((script) => script.executionContextId));

    await Promise.all(Array.from(ids, async (id) => {
      if (typeof id !== 'number') return;
      const context = contexts.get(id);
      if (!context?.frameId || getMainWorldImageOrigin(context, state)) return;
      delete context.imageAccess;
      try {
        const result = await readImageContextAccess(state.tabId, id);
        if (!state.attached || state.contexts !== contexts || state.passwordDocumentRevision !== revision ||
            contexts.get(id) !== context || !result) return;
        const origin = normalizeImageExecutionOrigin(result.origin);
        if (!origin) return;
        context.imageAccess = {
          origin,
          topAccessible: typeof result.topAccessible === 'boolean' ? result.topAccessible : null,
          documentRevision: revision
        };
      } catch (error) {
        // Zniknięcie ramki, błąd lub brak wyniku pozostawia dostęp nieustalony.
      }
    }));
  }

  return { updateImageContextAccess };
}
