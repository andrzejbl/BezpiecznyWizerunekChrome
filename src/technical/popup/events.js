// Przypięcie istniejących kontrolek do nazwanych scenariuszy.
/** @param {import('../../../types/popup.js').PopupElements} elements @param {import('../../../types/popup.js').PopupActions} actions */
export function bindPopupEvents(elements, actions) {
  elements.startButton.addEventListener('click', actions.startOrRestartScan);
  if (elements.stopButton) {
    elements.stopButton.addEventListener('click', () => actions.runAction('stopScan'));
  }
  elements.imagesTab.addEventListener('click', () => actions.setActiveView('images'));
  elements.scriptsTab.addEventListener('click', () => actions.setActiveView('scripts'));
  elements.passwordTab.addEventListener('click', () => actions.setActiveView('password'));
  elements.copyImageLinksButton.addEventListener('click', () => {
    actions.copyImageLinks().catch((error) => actions.setStatusText(error.message));
  });
  elements.exportImagesButton.addEventListener('click', actions.exportImagesJson);
  if (elements.exportPdfButton) {
    elements.exportPdfButton.addEventListener('click', actions.exportImagesPdf);
  }
  if (elements.exportReportZipButton) {
    elements.exportReportZipButton.addEventListener('click', actions.exportReportZip);
  }
  elements.copyThirdPartyButton.addEventListener('click', () => {
    actions.copyThirdPartyList().catch((error) => actions.setStatusText(error.message));
  });
  elements.exportScriptsJsonButton.addEventListener('click', actions.exportScriptsJson);
  elements.exportScriptsCsvButton.addEventListener('click', actions.exportScriptsCsv);
  elements.metricCards.forEach((card) => {
    card.addEventListener('click', () => actions.setActiveView(card.dataset.view));
  });
}
