// Jedyne miejsce łączące reguły skanowania z implementacjami operacji przeglądarki.
// Czytanie scenariuszy startu, zatrzymania i odczytu zacznij od business/scanning/scan-flow.js.
import { createScanFlow } from '../business/scanning/scan-flow.js';
import { createScanStateStore } from '../business/scanning/scan-state.js';
import { createScanLifecycle } from '../business/scanning/scan-lifecycle.js';
import { createPageObservationHandlers } from '../business/scanning/page-observations.js';
import { createPasswordObservationFlow } from '../business/scanning/password-observation-flow.js';
import { createImageContextObservation } from '../business/scanning/image-context-observation.js';
import { createPasswordAccessRecorder } from '../business/scanning/password-access.js';
import { createScriptRecorder } from '../business/scanning/script-records.js';
import { createImageRecorder } from '../business/scanning/image-records.js';
import { createImageComparisonFlow } from '../business/scanning/image-comparison-flow.js';
import { createRobotsFlow } from '../business/scanning/robots-flow.js';
import { createNetworkObservationHandlers } from '../technical/background/network-events.js';
import { registerExtensionListeners } from '../technical/background/extension-events.js';
import { attachDebugger, detachDebugger, getActiveTab } from '../technical/background/chrome-api.js';
import { scanBrowser } from '../technical/background/scan-browser.js';
import { clock, scheduler } from '../technical/background/runtime-services.js';
import { readCapturedImageBody, loadWithoutCredentials, readResourceText, readResourceBytes } from '../technical/background/resource-reader.js';
import { sha256Hex } from '../technical/background/cdp-streams.js';

/** Połącz opisane typami porty biznesowe z adapterami Chrome, potem zarejestruj obsługę zdarzeń.
 * @returns {void}
 */
export function startBackgroundApplication() {
  const imageContexts = createImageContextObservation({ readImageContextAccess: scanBrowser.readImageContextAccess });
  const passwordObservation = createPasswordObservationFlow({
    readPasswordInputs: scanBrowser.readPasswordInputs,
    readPasswordContextAccess: scanBrowser.readPasswordContextAccess,
    updateImageContextAccess: imageContexts.updateImageContextAccess,
    clock,
    scheduler
  });
  const scans = createScanStateStore({
    stopPasswordInputPolling: passwordObservation.stopPasswordInputPolling
  });
  const robots = createRobotsFlow({ loadWithoutCredentials, readResourceText, clock });
  const images = createImageRecorder({ clock, scheduleRobotsCheckForImage: robots.scheduleRobotsCheckForImage });
  const imageComparison = createImageComparisonFlow({
    readCapturedImageBody,
    loadWithoutCredentials,
    readResourceBytes,
    hashBody: sha256Hex,
    clock
  });
  const scripts = createScriptRecorder({ clock });
  const passwordAccess = createPasswordAccessRecorder({ clock });
  const page = createPageObservationHandlers({
    readPageAddress: scanBrowser.readPageAddress,
    scheduleRobotsChecks: robots.scheduleRobotsChecks
  });
  const network = createNetworkObservationHandlers({
    enqueueImageBodyComparison: imageComparison.enqueueImageBodyComparison,
    addOrUpdateImage: images.addOrUpdateImage,
    mergeImageRequestMetadata: images.mergeImageRequestMetadata,
    mergeScriptRequestMetadata: scripts.mergeScriptRequestMetadata,
    addBlockedThirdPartyScript: scripts.addBlockedThirdPartyScript
  });
  const scan = createScanFlow({
    browser: scanBrowser,
    getActiveTab,
    attachDebugger,
    detachDebugger,
    tabStates: scans.tabStates,
    ensureState: scans.ensureState,
    resetScanData: scans.resetScanData,
    setPageInfo: page.setPageInfo,
    updatePageInfoFromRuntime: page.updatePageInfoFromRuntime,
    scheduleRobotsChecks: robots.scheduleRobotsChecks,
    pollPasswordInputInfo: passwordObservation.pollPasswordInputInfo,
    startPasswordInputPolling: passwordObservation.startPasswordInputPolling,
    stopPasswordInputPolling: passwordObservation.stopPasswordInputPolling,
    clock
  });
  const lifecycle = createScanLifecycle({
    tabStates: scans.tabStates,
    stopPasswordInputPolling: passwordObservation.stopPasswordInputPolling,
    clock
  });

  // Rejestracja kończy przygotowania: każda funkcja ma zależności, zanim Chrome wywoła ją dla zdarzenia.
  registerExtensionListeners({
    tabStates: scans.tabStates,
    handleExecutionContextCreated: page.handleExecutionContextCreated,
    handleExecutionContextDestroyed: page.handleExecutionContextDestroyed,
    handleExecutionContextsCleared: page.handleExecutionContextsCleared,
    handleFrameDetached: page.handleFrameDetached,
    handleFrameNavigated: page.handleFrameNavigated,
    handleScriptParsed: scripts.handleScriptParsed,
    handleRequestWillBeSent: network.handleRequestWillBeSent,
    handleResponseReceived: network.handleResponseReceived,
    handleLoadingFinished: network.handleLoadingFinished,
    handleLoadingFailed: network.handleLoadingFailed,
    handleRequestServedFromCache: network.handleRequestServedFromCache,
    recordPasswordAccess: passwordAccess.recordPasswordAccess,
    pollPasswordInputInfo: passwordObservation.pollPasswordInputInfo,
    startScanWithReload: scan.startScanWithReload,
    stopScan: scan.stopScan,
    getActiveTabState: scan.getActiveTabState,
    handleDebuggerDetached: lifecycle.handleDebuggerDetached,
    handleTabRemoved: lifecycle.handleTabRemoved,
    clock
  });
}
