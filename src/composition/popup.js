// Składanie okna rozszerzenia: tutaj jawnie wybieramy implementacje portów warstwy biznesowej.
import { exportImagesPdf, exportReportZip } from '../../report.js';
import { createPopupSession } from '../business/popup/session.js';
import { createPopupFlow } from '../business/popup/popup-flow.js';
import { createResultExports } from '../business/popup/result-exports.js';
import { createReportActions } from '../business/popup/report-actions.js';
import { MIN_IMAGE_LONG_SIDE } from '../business/popup/image-rules.js';
import { getReportStats, getSecuritySummary, riskCopy } from '../business/popup/summary.js';
import { getReportPageDomain, getFilenameTimestamp, getPdfReportFilename } from '../business/popup/filenames.js';
import { getPopupElements } from '../technical/popup/dom.js';
import { createRenderCache } from '../technical/popup/render-cache.js';
import { createImageDimensions } from '../technical/popup/image-dimensions.js';
import { createImagesView } from '../technical/popup/images-view.js';
import { createScriptsView } from '../technical/popup/scripts-view.js';
import { createPasswordView } from '../technical/popup/password-view.js';
import { createOverviewView } from '../technical/popup/overview.js';
import { createScanControls } from '../technical/popup/scan-controls.js';
import { createTabsView } from '../technical/popup/tabs.js';
import { sendMessage, clipboard, confirmation, beginStatePolling, currentTime } from '../technical/popup/browser.js';
import { downloadJson, downloadCsv, downloadBlob } from '../technical/popup/downloads.js';
import { bindPopupEvents } from '../technical/popup/events.js';

/** Łączy typowane porty i uruchamia obserwację stanu skanera. @returns {void} */
export function startPopup() {
  const session = createPopupSession();
  const elements = getPopupElements();
  const rendering = createRenderCache();
  const renderCache = rendering.cache;
  const dimensions = createImageDimensions({
    onDimensionsChanged: () => flow.refreshImageDimensions()
  });

  const display = {
    ...createImagesView({ elements, renderCache, dimensions }),
    ...createScriptsView({ elements, renderCache }),
    ...createPasswordView({ elements, renderCache }),
    ...createOverviewView({ elements, getSecuritySummary: () => getSecuritySummary(session) }),
    ...createScanControls({ elements, session }),
    ...createTabsView({ elements }),
    resetRenderSignatures: rendering.resetRenderSignatures,
    resetImageRenderSignature: rendering.resetImageRenderSignature
  };
  const flow = createPopupFlow({
    session,
    scanner: { sendMessage },
    display,
    confirmation,
    dimensions
  });
  const resultExports = createResultExports({
    session,
    clipboard,
    files: { downloadJson, downloadCsv },
    display
  });

  // Funkcje odczytu stanu pobierają aktualne wyniki także po asynchronicznym zatrzymaniu skanu.
  /** @type {import('../../types/report.js').ReportDependencies} */
  const reportDependencies = {
    getLatestState: () => session.latestState,
    getReportStats: () => getReportStats(session),
    getSecuritySummary: () => getSecuritySummary(session),
    getReportPageDomain: () => getReportPageDomain(session.latestState),
    getFilenameTimestamp: (date = currentTime()) => getFilenameTimestamp(date),
    getPdfReportFilename: (date = currentTime()) => getPdfReportFilename(session.latestState, date),
    setBusy: flow.setBusy,
    setStatusText: display.setStatusText,
    sendMessage,
    render: flow.render,
    downloadBlob,
    riskCopy,
    minImageLongSide: MIN_IMAGE_LONG_SIDE
  };
  const reportActions = createReportActions({
    reports: {
      exportImagesPdf: () => exportImagesPdf(reportDependencies),
      exportReportZip: () => exportReportZip(reportDependencies)
    },
    display: { setStatusText: display.setStatusText, setBusy: flow.setBusy }
  });

  bindPopupEvents(elements, {
    ...flow,
    ...resultExports,
    ...reportActions,
    setStatusText: display.setStatusText
  });
  beginStatePolling(flow.refreshState);
}
