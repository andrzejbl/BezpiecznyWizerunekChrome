/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').NetworkMetadata} NetworkMetadata */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} ImageRecorderPorts
 * @property {Clock} clock
 * @property {(state:ScanState,url:string)=>void} scheduleRobotsCheckForImage
 */

// Scal powtarzające się obserwacje zdjęć, a następnie zleć kontrolę ich źródeł.

import { IMAGE_EXTENSION_RE } from './config.js';
import { parseUrl } from './urls.js';
import { normalizeHeaders, mergeHeaders } from './headers.js';

/**
 * @param {ImageRecorderPorts} ports
 */
export function createImageRecorder({ clock, scheduleRobotsCheckForImage }) {
  // Rozpoznawaj żądania zdjęć i scalaj kolejne metadane sieciowe w jeden rekord dla danego URL.

  /**
   * @param {string|undefined} url
   */
  function isTypicalImageUrl(url) {
    if (!url) {
      return false;
    }

    if (/^data:image\//i.test(url)) {
      return true;
    }

    try {
      return IMAGE_EXTENSION_RE.test(new URL(url).pathname);
    } catch (error) {
      return IMAGE_EXTENSION_RE.test(url.split(/[?#]/, 1)[0]);
    }
  }

  /**
   * @param {NetworkMetadata} metadata
   */
  function isImageLike(metadata) {
    return (
      metadata.resourceType === 'Image' ||
      (typeof metadata.mimeType === 'string' && metadata.mimeType.toLowerCase().startsWith('image/')) ||
      isTypicalImageUrl(metadata.url)
    );
  }

  /**
   * @param {number|null|undefined} status
   */
  function normalizeStatus(status) {
    return typeof status === 'number' ? status : null;
  }

  /**
   * @param {number|null|undefined} encodedDataLength
   */
  function normalizeEncodedDataLength(encodedDataLength) {
    return typeof encodedDataLength === 'number' ? encodedDataLength : null;
  }

  /**
   * @param {ScanState} state
   * @param {NetworkMetadata} metadata
   */
  function addOrUpdateImage(state, metadata) {
    if (!metadata.url || !isImageLike(metadata)) {
      return;
    }

    const normalizedHeaders = normalizeHeaders(metadata.headers);

    const existing = state.imagesByUrl.get(metadata.url);
    if (existing) {
      if (metadata.status !== undefined) {
        existing.status = normalizeStatus(metadata.status);
      }
      if (metadata.mimeType) {
        existing.mimeType = metadata.mimeType;
      }
      if (metadata.resourceType) {
        existing.resourceType = metadata.resourceType;
      }
      if (!existing.requestId && metadata.requestId) {
        existing.requestId = metadata.requestId;
      }
      if (metadata.fromDiskCache === true) {
        existing.fromDiskCache = true;
      }
      if (metadata.fromServiceWorker === true) {
        existing.fromServiceWorker = true;
      }
      if (typeof metadata.encodedDataLength === 'number') {
        existing.encodedDataLength = metadata.encodedDataLength;
      }
      if (Object.keys(normalizedHeaders).length > 0) {
        existing.headers = mergeHeaders(existing.headers, normalizedHeaders);
      }
      scheduleRobotsCheckForImage(state, existing.url);
      return;
    }

    const parsed = parseUrl(metadata.url);
    const image = {
      url: metadata.url,
      domain: parsed.hostname,
      status: normalizeStatus(metadata.status),
      mimeType: metadata.mimeType || '',
      resourceType: metadata.resourceType || '',
      requestId: metadata.requestId || '',
      fromDiskCache: metadata.fromDiskCache === true,
      fromServiceWorker: metadata.fromServiceWorker === true,
      encodedDataLength: normalizeEncodedDataLength(metadata.encodedDataLength),
      headers: normalizedHeaders,
      timestamp: clock.nowIso()
    };

    // Mapa i tablica przechowują ten sam obiekt: późniejszy zapis bodyComparison widać w obu.
    // Mapa służy do wyszukania po pełnym URL, tablica zachowuje kolejność w zwracanym wyniku.
    state.imagesByUrl.set(image.url, image);
    state.images.push(image);
    scheduleRobotsCheckForImage(state, image.url);
  }

  /**
   * @param {ScanState} state
   * @param {string} requestId
   * @param {NetworkMetadata} metadata
   * @returns {NetworkMetadata}
   */
  function mergeImageRequestMetadata(state, requestId, metadata) {
    if (!requestId) {
      return metadata;
    }

    // requestId łączy częściowe dane z kolejnych zdarzeń; to inny klucz niż URL rekordu zdjęcia.
    // Obsługa loadingFinished/loadingFailed usuwa te tymczasowe metadane po ich wykorzystaniu.
    const previous = state.imageRequests.get(requestId) || {};
    const merged = {
      ...previous,
      ...metadata,
      requestId
    };

    state.imageRequests.set(requestId, merged);
    return merged;
  }

  return { addOrUpdateImage, mergeImageRequestMetadata };
}
