/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').BodyComparison} BodyComparison */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ImageComparisonJob} ImageComparisonJob */
/** @typedef {import('../../../types/scanning.js').NetworkMetadata} NetworkMetadata */
/** @typedef {import('../../../types/scanning.js').ResourcePorts} ResourcePorts */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */

/**
 * @typedef {object} ImageComparisonPorts
 * @property {ResourcePorts['readCapturedImageBody']} readCapturedImageBody
 * @property {ResourcePorts['loadWithoutCredentials']} loadWithoutCredentials
 * @property {ResourcePorts['readResourceBytes']} readResourceBytes
 * @property {(state:ScanState,metadata:NetworkMetadata)=>void} addOrUpdateImage
 * @property {(bytes:Uint8Array<ArrayBuffer>)=>Promise<string>} hashBody
 * @property {Clock} clock
 */

// Każda zakończona odpowiedź przechodzi rozpoznanie bajtów; tylko obrazy trafiają do porównania bez sesji.
import { IMAGE_BODY_COMPARE_MAX_BYTES, IMAGE_BODY_COMPARE_CONCURRENCY } from './config.js';
import { isRobotsCheckableUrl } from './robots-rules.js';
import { assessImageBodyComparison } from './image-comparison-rules.js';
import { detectImageMimeType } from './image-signatures.js';
import { normalizeHeaders } from './headers.js';

/** @param {ImageComparisonPorts} ports */
export function createImageComparisonFlow({
  readCapturedImageBody, loadWithoutCredentials, readResourceBytes, addOrUpdateImage, hashBody, clock
}) {
  /** @param {ImageRecord} image @param {BodyComparison} patch */
  function setImageBodyComparison(image, patch) {
    image.bodyComparison = { ...(image.bodyComparison || {}), ...patch, updatedAt: clock.nowIso() };
  }

  /** @param {ImageRecord} image @param {string} reason */
  function markSkipped(image, reason) {
    delete image.previewDataUrl;
    setImageBodyComparison(image, { status: 'skipped', exactMatch: false, improperAuthorization: false, reason });
  }

  /**
   * Tożsamość kolekcji rozróżnia skany nawet wtedy, gdy współdzielą mutowalny obiekt state.
   * @param {ScanState} state
   * @param {ImageComparisonJob[]} queue
   * @param {Map<string,ImageRecord>} images
   */
  function hasCurrentGeneration(state, queue, images) {
    return state.attached && !state.stopRequested && state.imageBodyCompareQueue === queue && state.imagesByUrl === images;
  }

  /** @param {ScanState} state @param {ImageComparisonJob} item @param {ImageComparisonJob[]} queue @param {Map<string,ImageRecord>} images */
  function isCurrent(state, item, queue, images) {
    return hasCurrentGeneration(state, queue, images) &&
      (!item.url || state.imageBodyCompareLatestByUrl.get(item.url) === item.requestId);
  }

  /**
   * @param {ScanState} state
   * @param {string} requestId
   * @param {string|undefined} url
   * @param {number|undefined} encodedDataLength
   * @param {NetworkMetadata} [metadata]
   */
  function enqueueImageBodyComparison(state, requestId, url, encodedDataLength, metadata) {
    if (!state || !state.attached || state.stopRequested || !requestId || state.imageBodyCompareSeenRequestIds.has(requestId)) return;
    const requestUrl = url || (metadata && metadata.url) || '';
    const source = metadata || state.imagesByUrl.get(requestUrl) || {};
    // Osobne nagłówki chronią dowody zadania przed kolejną odpowiedzią z tego samego URL.
    const snapshot = {
      url: requestUrl, requestId,
      status: source.status, mimeType: source.mimeType || '', resourceType: source.resourceType || '',
      headers: normalizeHeaders(source.headers),
      fromDiskCache: source.fromDiskCache === true, fromServiceWorker: source.fromServiceWorker === true,
      encodedDataLength: encodedDataLength === undefined ? source.encodedDataLength : encodedDataLength
    };
    state.imageBodyCompareSeenRequestIds.add(requestId);
    if (requestUrl) state.imageBodyCompareLatestByUrl.set(requestUrl, requestId);
    const image = state.imagesByUrl.get(requestUrl);
    if (image) {
      delete image.previewDataUrl;
      delete image.detectedMimeType;
      image.bodyComparison = {};
      setImageBodyComparison(image, { status: 'queued', exactMatch: false, improperAuthorization: false, mode: 'fetch-omit-cdp' });
    }
    state.imageBodyCompareQueue.push({ requestId, url: requestUrl, metadata: snapshot });
    runQueue(state);
  }

  /** @param {ScanState} state */
  function runQueue(state) {
    const queue = state.imageBodyCompareQueue;
    const images = state.imagesByUrl;
    if (!hasCurrentGeneration(state, queue, images)) return;
    while (state.imageBodyCompareActiveCount < IMAGE_BODY_COMPARE_CONCURRENCY && queue.length > 0) {
      const item = /** @type {ImageComparisonJob} */ (queue.shift());
      state.imageBodyCompareActiveCount += 1;
      compareResponse(state, item, queue, images)
        .catch(/** @param {unknown} error */ (error) => {
          if (!isCurrent(state, item, queue, images)) return;
          const image = images.get(item.url);
          if (image) {
            delete image.previewDataUrl;
            setImageBodyComparison(image, {
              status: 'error', exactMatch: false, improperAuthorization: false,
              error: /** @type {Error} */ (error).message
            });
          }
        })
        .finally(() => {
          // Stare finally nie zwalnia miejsca w kolejce nowego skanu.
          if (state.imageBodyCompareQueue !== queue || state.imagesByUrl !== images) return;
          state.imageBodyCompareActiveCount = Math.max(0, state.imageBodyCompareActiveCount - 1);
          runQueue(state);
        });
    }
  }

  /** @param {ScanState} state @param {ImageComparisonJob} item @param {ImageComparisonJob[]} queue @param {Map<string,ImageRecord>} images */
  async function compareResponse(state, item, queue, images) {
    if (!hasCurrentGeneration(state, queue, images)) return;
    const existing = images.get(item.url);
    if (existing && isCurrent(state, item, queue, images)) {
      setImageBodyComparison(existing, { status: 'checking', exactMatch: false, improperAuthorization: false });
    }
    // Odczytaj raz także odpowiedź bez rozszerzenia, MIME obrazu lub wcześniejszego rekordu.
    const originalBody = await readCapturedImageBody(state.tabId, item.requestId);
    if (!isCurrent(state, item, queue, images)) return;
    const originalBytes = originalBody.bytes;
    const detectedMimeType = detectImageMimeType(originalBytes);
    if (!item.url || (!detectedMimeType && !images.has(item.url))) return;
    addOrUpdateImage(state, { ...item.metadata, detectedMimeType });
    const image = images.get(item.url);
    if (!image) return;
    image.bodyComparison = {};
    setImageBodyComparison(image, { status: 'checking', exactMatch: false, improperAuthorization: false, mode: 'fetch-omit-cdp' });
    if (!detectedMimeType) {
      markSkipped(image, 'Response body has no supported JPEG, PNG or WebP signature.');
      return;
    }
    const originalLength = originalBody.byteLength === undefined ? originalBytes.length : originalBody.byteLength;
    if (originalBody.truncated || originalLength > IMAGE_BODY_COMPARE_MAX_BYTES || originalLength !== originalBytes.length) {
      markSkipped(image, `Original body is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes or incomplete.`);
      return;
    }
    if (!isRobotsCheckableUrl(item.url)) {
      markSkipped(image, 'Only HTTP(S) image URLs can be compared without credentials.');
      return;
    }
    const originalSha256 = await hashBody(originalBytes);
    if (!isCurrent(state, item, queue, images)) return;
    const resource = await loadWithoutCredentials(state.tabId, state.mainFrameId, item.url);
    if (!isCurrent(state, item, queue, images)) return;
    const publicStatus = resource.status;
    const noCredentialsHeaders = resource.headers;
    if (!resource.succeeded) {
      setImageBodyComparison(image, {
        status: 'error', exactMatch: false, improperAuthorization: false,
        originalBodySha256: originalSha256, originalBodyLength: originalLength,
        noCredentialsStatus: publicStatus, noCredentialsHeaders,
        error: resource.error || 'No-credentials image load failed.'
      });
      return;
    }
    const publicBody = readResourceBytes(state.tabId, resource.body, IMAGE_BODY_COMPARE_MAX_BYTES);
    const publicBytes = publicBody instanceof Uint8Array ? publicBody : await publicBody;
    if (!isCurrent(state, item, queue, images)) return;
    if (publicBytes.length > IMAGE_BODY_COMPARE_MAX_BYTES) {
      markSkipped(image, `No-credentials body is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
      return;
    }
    const publicSha256 = await hashBody(publicBytes);
    if (!isCurrent(state, item, queue, images)) return;
    const { exactMatch, improperAuthorization } = assessImageBodyComparison({
      originalLength, publicLength: publicBytes.length, originalSha256, publicSha256,
      originalStatus: item.metadata.status ?? null, publicStatus
    });
    if (improperAuthorization) {
      const previewDataUrl = originalBody.createPreview(image);
      if (previewDataUrl) image.previewDataUrl = previewDataUrl;
      else delete image.previewDataUrl;
    } else delete image.previewDataUrl;
    setImageBodyComparison(image, {
      status: exactMatch ? 'same' : 'different', exactMatch, improperAuthorization,
      originalBodySha256: originalSha256, originalBodyLength: originalLength,
      noCredentialsBodySha256: publicSha256, noCredentialsBodyLength: publicBytes.length,
      noCredentialsStatus: publicStatus, noCredentialsHeaders,
      noCredentialsMimeType: resource.mimeType || '', mode: 'fetch-omit-cdp', comparedAt: clock.nowIso()
    });
  }
  return { enqueueImageBodyComparison };
}
