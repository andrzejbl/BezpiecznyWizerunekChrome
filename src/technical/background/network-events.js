/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/cdp.js').NetworkEvent} NetworkEvent */

/**
 * @typedef {object} NetworkObservationPorts
 * @property {ReturnType<typeof import("../../business/scanning/image-comparison-flow.js").createImageComparisonFlow>["enqueueImageBodyComparison"]} enqueueImageBodyComparison
 * @property {ReturnType<typeof import("../../business/scanning/image-records.js").createImageRecorder>["addOrUpdateImage"]} addOrUpdateImage
 * @property {ReturnType<typeof import("../../business/scanning/image-records.js").createImageRecorder>["mergeImageRequestMetadata"]} mergeImageRequestMetadata
 * @property {ReturnType<typeof import("../../business/scanning/script-records.js").createScriptRecorder>["mergeScriptRequestMetadata"]} mergeScriptRequestMetadata
 * @property {ReturnType<typeof import("../../business/scanning/script-records.js").createScriptRecorder>["addBlockedThirdPartyScript"]} addBlockedThirdPartyScript
 */

// Przekształcaj dane zdarzeń CDP w obserwacje dla modułów biznesowych, zachowując kolejność zdarzeń.


/**
 * @param {NetworkObservationPorts} ports
 */
export function createNetworkObservationHandlers({
  enqueueImageBodyComparison,
  addOrUpdateImage,
  mergeImageRequestMetadata,
  mergeScriptRequestMetadata,
  addBlockedThirdPartyScript
}) {
  // Przekształcaj zdarzenia sieciowe CDP w rekordy zdjęć, skryptów i zadania porównania w kolejce.

  /**
   * @param {ScanState} state
   * @param {NetworkEvent} params
   */
  function handleRequestWillBeSent(state, params) {
    const requestUrl = params.request && params.request.url;
    const metadata = mergeImageRequestMetadata(state, params.requestId, {
      requestId: params.requestId,
      url: requestUrl,
      resourceType: params.type || '',
      mimeType: '',
      timestamp: params.timestamp
    });

    if (params.type === 'Script') {
      mergeScriptRequestMetadata(state, params.requestId, {
        requestId: params.requestId,
        url: requestUrl,
        resourceType: params.type || '',
        timestamp: params.timestamp
      });
    }

    addOrUpdateImage(state, metadata);

    if (params.redirectResponse && params.redirectResponse.url) {
      addOrUpdateImage(state, {
        requestId: params.requestId,
        url: params.redirectResponse.url,
        resourceType: params.type || metadata.resourceType || '',
        status: params.redirectResponse.status,
        mimeType: params.redirectResponse.mimeType || '',
        fromDiskCache: params.redirectResponse.fromDiskCache === true,
        fromServiceWorker: params.redirectResponse.fromServiceWorker === true,
        encodedDataLength: params.redirectResponse.encodedDataLength,
        headers: params.redirectResponse.headers || {}
      });
    }
  }

  /**
   * @param {ScanState} state
   * @param {NetworkEvent} params
   */
  function handleResponseReceived(state, params) {
    const response = params.response || {};
    const metadata = mergeImageRequestMetadata(state, params.requestId, {
      requestId: params.requestId,
      url: response.url || '',
      resourceType: params.type || '',
      status: response.status,
      mimeType: response.mimeType || '',
      fromDiskCache: response.fromDiskCache === true,
      fromServiceWorker: response.fromServiceWorker === true,
      encodedDataLength: response.encodedDataLength,
      headers: response.headers || {},
      timestamp: params.timestamp
    });

    addOrUpdateImage(state, metadata);
  }

  /**
   * @param {ScanState} state
   * @param {NetworkEvent} params
   */
  function handleLoadingFinished(state, params) {
    const metadata = mergeImageRequestMetadata(state, params.requestId, {
      requestId: params.requestId,
      encodedDataLength: params.encodedDataLength
    });

    addOrUpdateImage(state, metadata);
    enqueueImageBodyComparison(state, params.requestId, metadata.url, params.encodedDataLength);
    state.imageRequests.delete(params.requestId);
    state.scriptRequests.delete(params.requestId);
  }

  /**
   * @param {ScanState} state
   * @param {NetworkEvent} params
   */
  function handleLoadingFailed(state, params) {
    const metadata = mergeImageRequestMetadata(state, params.requestId, {
      requestId: params.requestId
    });

    const previousScriptMetadata = state.scriptRequests.get(params.requestId) || {};
    const scriptMetadata = mergeScriptRequestMetadata(state, params.requestId, {
      requestId: params.requestId,
      url: previousScriptMetadata.url || '',
      resourceType: params.type || previousScriptMetadata.resourceType || '',
      errorText: params.errorText || '',
      blockedReason: params.blockedReason || '',
      timestamp: params.timestamp
    });

    addOrUpdateImage(state, metadata);
    addBlockedThirdPartyScript(state, scriptMetadata);
    state.imageRequests.delete(params.requestId);
    state.scriptRequests.delete(params.requestId);
  }

  /**
   * @param {ScanState} state
   * @param {NetworkEvent} params
   */
  function handleRequestServedFromCache(state, params) {
    const metadata = mergeImageRequestMetadata(state, params.requestId, {
      requestId: params.requestId,
      fromDiskCache: true
    });

    addOrUpdateImage(state, metadata);
  }

  return { handleRequestWillBeSent, handleResponseReceived, handleLoadingFinished, handleLoadingFailed, handleRequestServedFromCache };
}
