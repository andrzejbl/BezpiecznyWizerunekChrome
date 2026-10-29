// Odczyt reguł biznesowych i aktualizacja przycisków oraz statusu DOM.
import { getScanControlsModel, getButtonAvailability, getStatusMessage } from '../../business/popup/scan-policy.js';

/** @param {{elements: import('../../../types/popup.js').PopupElements, session: import('../../../types/popup.js').PopupSession}} dependencies */
export function createScanControls({ elements, session }) {
  /** @param {boolean} hasReportData */
  function updateScanControls(hasReportData) {
    const { scanActive, stateName, title, description } = getScanControlsModel(session, hasReportData);

    if (elements.scanControls) {
      elements.scanControls.dataset.state = stateName;
    }
    if (elements.scanStateTitle) {
      elements.scanStateTitle.textContent = title;
    }
    if (elements.scanStateDescription) {
      elements.scanStateDescription.textContent = description;
    }

    elements.startButton.classList.toggle('primary', !scanActive);
    elements.startButton.textContent = session.pendingAction === 'startScanWithReload'
      ? 'Uruchamiam...'
      : (scanActive || hasReportData ? 'Sprawdź ponownie' : 'Sprawdź stronę');

    if (elements.stopButton) {
      elements.stopButton.hidden = !scanActive && session.pendingAction !== 'stopScan';
      elements.stopButton.textContent = session.pendingAction === 'stopScan' ? 'Kończę...' : 'Zakończ skan';
    }
  }

  function updateButtons() {
    const { hasVisibleImages, hasReportData, hasScripts, hasThirdParty, attached } = getButtonAvailability(session);

    updateScanControls(hasReportData);
    elements.startButton.disabled = session.busy;

    if (elements.stopButton) {
      elements.stopButton.disabled = session.busy || !attached;
    }
    elements.copyImageLinksButton.disabled = session.busy || !hasVisibleImages;
    elements.exportImagesButton.disabled = session.busy || !hasVisibleImages;
    if (elements.exportPdfButton) {
      elements.exportPdfButton.disabled = session.busy || !hasReportData;
    }
    if (elements.exportReportZipButton) {
      elements.exportReportZipButton.disabled = session.busy || !hasReportData;
    }
    elements.copyThirdPartyButton.disabled = session.busy || !hasThirdParty;
    elements.exportScriptsJsonButton.disabled = session.busy || !hasScripts;
    elements.exportScriptsCsvButton.disabled = session.busy || !hasScripts;
  }

  /** @param {import('../../../types/scanning.js').ScanSnapshot|null} state */
  function updateStatusMessage(state) {
    if (elements.statusText) {
      elements.statusText.textContent = getStatusMessage(state, session.busy);
    }
  }

  /** @param {string} text */
  function setStatusText(text) {
    elements.statusText.textContent = text;
  }

  return { updateButtons, updateStatusMessage, setStatusText };
}
