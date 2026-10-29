// Referencje do elementów istniejącego interfejsu i wspólne operacje DOM.

/** Elementy wymagane przez popup.html są dostępne po załadowaniu modułu; dawne liczniki pozostają opcjonalne. */
export function getPopupElements() {
  return /** @type {import('../../../types/popup.js').PopupElements} */ ({
    statusText: document.getElementById('statusText'),
    resultCount: document.getElementById('resultCount'),
    counterLabel: document.getElementById('counterLabel'),
    scanControls: document.getElementById('scanControls'),
    scanStateTitle: document.getElementById('scanStateTitle'),
    scanStateDescription: document.getElementById('scanStateDescription'),
    startButton: document.getElementById('startButton'),
    stopButton: document.getElementById('stopButton'),
    imagesTab: document.getElementById('imagesTab'),
    scriptsTab: document.getElementById('scriptsTab'),
    passwordTab: document.getElementById('passwordTab'),
    imagesView: document.getElementById('imagesView'),
    scriptsView: document.getElementById('scriptsView'),
    passwordView: document.getElementById('passwordView'),
    resultsGrid: document.getElementById('resultsGrid'),
    copyImageLinksButton: document.getElementById('copyImageLinksButton'),
    exportImagesButton: document.getElementById('exportImagesButton'),
    exportPdfButton: document.getElementById('exportPdfButton'),
    exportReportZipButton: document.getElementById('exportReportZipButton'),
    copyThirdPartyButton: document.getElementById('copyThirdPartyButton'),
    exportScriptsJsonButton: document.getElementById('exportScriptsJsonButton'),
    exportScriptsCsvButton: document.getElementById('exportScriptsCsvButton'),
    pageUrlValue: document.getElementById('pageUrlValue'),
    pageOriginValue: document.getElementById('pageOriginValue'),
    totalScriptsValue: document.getElementById('totalScriptsValue'),
    thirdPartyScriptsValue: document.getElementById('thirdPartyScriptsValue'),
    thirdPartyDomainsValue: document.getElementById('thirdPartyDomainsValue'),
    scriptTree: document.getElementById('scriptTree'),
    passwordInputsValue: document.getElementById('passwordInputsValue'),
    passwordScriptsValue: document.getElementById('passwordScriptsValue'),
    passwordAccessesValue: document.getElementById('passwordAccessesValue'),
    passwordTree: document.getElementById('passwordTree'),
    riskLevelValue: document.getElementById('riskLevelValue'),
    securityWheel: document.getElementById('securityWheel'),
    securityWheelText: document.getElementById('securityWheelText'),
    securityWheelBadge: document.getElementById('securityWheelBadge'),
    riskSummaryText: document.getElementById('riskSummaryText'),
    riskMeaningText: document.getElementById('riskMeaningText'),
    nextStepsPanel: document.getElementById('nextStepsPanel'),
    nextStepTitle: document.getElementById('nextStepTitle'),
    nextStepText: document.getElementById('nextStepText'),
    totalIssuesValue: document.getElementById('totalIssuesValue'),
    summaryAuthorizationImages: document.getElementById('summaryAuthorizationImages'),
    summaryImageDetails: document.getElementById('summaryImageDetails'),
    summaryScriptDomains: document.getElementById('summaryScriptDomains'),
    summaryScriptDetails: document.getElementById('summaryScriptDetails'),
    summaryPasswordDomains: document.getElementById('summaryPasswordDomains'),
    summaryPasswordDetails: document.getElementById('summaryPasswordDetails'),
    metricCards: Array.from(document.querySelectorAll('.metric-card'))
  });
}

/** @param {HTMLElement} element */
export function clearElement(element) {
  element.textContent = '';
}

/** @param {HTMLElement} parent @param {string} message */
export function appendEmptyState(parent, message) {
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = message;
  parent.appendChild(empty);
}
