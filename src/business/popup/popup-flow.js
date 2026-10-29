// Przeczytaj ten plik, aby prześledzić działanie okna rozszerzenia bez szczegółów DOM i komunikacji.
// Mapa komunikatów i asynchronicznych pomiarów: docs/flows/README.md.
import { isScanActive } from './scan-policy.js';
import { getFilteredImageRows, buildVisibleImages } from './image-rules.js';

/**
 * scanner wysyła polecenia do skanera, dimensions dostarcza wyniki pomiarów,
 * display pokazuje wyniki i komunikaty, confirmation pyta o ponowny start.
 * Każdy port jest przekazywany jawnie w composition/popup.js.
 * @param {import('../../../types/popup.js').PopupFlowPorts} ports
 */
export function createPopupFlow({ session, scanner, display, confirmation, dimensions }) {
  /** @param {import('../../../types/scanning.js').ScanSnapshot|null} state */
  function render(state) {
    session.latestState = state;

    // Pomiar może zwrócić pending. Jego zakończenie ponownie wywoła render przez funkcję zwrotną.
    const images = state && Array.isArray(state.images) ? state.images : [];
    dimensions.prune(images);
    const { rows, pendingCount } = getFilteredImageRows(images, dimensions.getRecord);
    session.visibleImages = buildVisibleImages(rows);

    display.renderImages({ images, rows, pendingCount });
    display.renderScripts(state);
    display.renderPasswordAccess(state);
    display.updateOverview();
    display.updateCounter();
    display.updateStatusMessage(state);
    display.updateButtons();
  }

  function refreshImageDimensions() {
    // Wymiary zmieniły się lokalnie; ponownie używamy ostatniej odpowiedzi modułu tła.
    if (session.latestState) {
      display.resetImageRenderSignature();
      render(session.latestState);
    }
  }

  /** @param {boolean} isBusy */
  function setBusy(isBusy) {
    session.busy = isBusy;
    display.updateButtons();
  }

  /** @param {import('../../../types/popup.js').PopupView} view */
  function setActiveView(view) {
    session.activeView = view;
    display.showActiveView(view);
    display.updateCounter();
    display.updateStatusMessage(session.latestState);
    display.updateButtons();
  }

  async function refreshState() {
    try {
      const state = await scanner.sendMessage('getState');
      render(state);
    } catch (error) {
      // Komunikat o błędzie pozostaje widoczny; odświeżamy tylko podsumowanie i akcje.
      display.setStatusText(/** @type {Error} */ (error).message);
      session.latestState = null;
      session.visibleImages = [];
      display.updateOverview();
      display.updateCounter();
      display.updateButtons();
    }
  }

  /** @param {import('../../../types/popup.js').ScannerCommand} type */
  async function runAction(type) {
    session.pendingAction = type;
    setBusy(true);
    try {
      const state = await scanner.sendMessage(type);
      display.resetRenderSignatures();
      render(state);
    } catch (error) {
      display.setStatusText(/** @type {Error} */ (error).message);
    } finally {
      session.pendingAction = '';
      setBusy(false);
    }
  }

  function startOrRestartScan() {
    if (isScanActive(session.latestState)) {
      const shouldRestart = confirmation.confirmRestart('Skanowanie nadal trwa. Rozpocząć je od nowa? Dotychczas zebrane wyniki zostaną usunięte.');
      if (!shouldRestart) {
        display.setStatusText('Skanowanie nadal trwa. Zachowano dotychczasowe wyniki.');
        return;
      }
    }

    runAction('startScanWithReload');
  }

  return { render, refreshImageDimensions, setBusy, setActiveView, refreshState, runAction, startOrRestartScan };
}
