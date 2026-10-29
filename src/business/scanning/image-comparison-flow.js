/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').BodyComparison} BodyComparison */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ImageComparisonJob} ImageComparisonJob */

/** @typedef {import('../../../types/scanning.js').ResourcePorts} ResourcePorts */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */

/**
 * @typedef {object} ImageComparisonPorts
 * @property {ResourcePorts['readCapturedImageBody']} readCapturedImageBody
 * @property {ResourcePorts['loadWithoutCredentials']} loadWithoutCredentials
 * @property {ResourcePorts['readResourceBytes']} readResourceBytes
 * @property {(bytes:Uint8Array<ArrayBuffer>)=>Promise<string>} hashBody
 * @property {Clock} clock
 */

// Dodaj zakwalifikowane zdjęcia do kolejki, porównaj oryginalną treść z pobraną bez sesji, zapisz dowody.
// Przesyłanie danych, dekodowanie, skróty, kodowanie podglądu i czas zapewniają jawnie przekazane porty.

import { IMAGE_BODY_COMPARE_MAX_BYTES, IMAGE_BODY_COMPARE_CONCURRENCY } from './config.js';
import { isRobotsCheckableUrl } from './robots-rules.js';
import { assessImageBodyComparison } from './image-comparison-rules.js';

/**
 * @param {ImageComparisonPorts} ports
 */
export function createImageComparisonFlow({
  readCapturedImageBody,
  loadWithoutCredentials,
  readResourceBytes,
  hashBody,
  clock
}) {
  // Porównaj treść każdej zarejestrowanej odpowiedzi ze zdjęciem pobranym bez danych uwierzytelniających.


  /**
   * @param {ImageRecord} image
   * @param {BodyComparison} patch
   */
  function setImageBodyComparison(image, patch) {
    image.bodyComparison = {
      ...(image.bodyComparison || {}),
      ...patch,
      updatedAt: clock.nowIso()
    };
  }

  /**
   * @param {ImageRecord} image
   * @param {string} reason
   */
  function markImageBodyComparisonSkipped(image, reason) {
    setImageBodyComparison(image, {
      status: 'skipped',
      exactMatch: false,
      improperAuthorization: false,
      reason
    });
  }

  /**
   * @param {ScanState} state
   * @param {string} requestId
   * @param {string|undefined} url
   * @param {number|undefined} encodedDataLength
   */
  function enqueueImageBodyComparison(state, requestId, url, encodedDataLength) {
    if (!state || !state.attached || !requestId || !url || !isRobotsCheckableUrl(url)) {
      return;
    }

    const image = state.imagesByUrl.get(url);
    if (!image) {
      return;
    }

    if (typeof encodedDataLength === 'number' && encodedDataLength > IMAGE_BODY_COMPARE_MAX_BYTES) {
      markImageBodyComparisonSkipped(image, `Encoded data length is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
      return;
    }

    const existingStatus = image.bodyComparison && image.bodyComparison.status;
    if (existingStatus === 'queued' || existingStatus === 'checking' || existingStatus === 'same' || existingStatus === 'different') {
      return;
    }

    if (state.imageBodyCompareQueuedUrls.has(url)) {
      return;
    }

    setImageBodyComparison(image, {
      status: 'queued',
      exactMatch: false,
      improperAuthorization: false,
      mode: 'cdp-no-credentials'
    });
    // Zapisz URL przed rozpoczęciem pracy, aby powtarzające się zdarzenia CDP korzystały z jednego porównania.
    state.imageBodyCompareQueuedUrls.add(url);
    state.imageBodyCompareQueue.push({ requestId, url });
    runImageBodyCompareQueue(state);
  }

  /**
   * @param {ScanState} state
   */
  function runImageBodyCompareQueue(state) {
    if (!state || !state.attached) {
      return;
    }

    // Uruchamiaj zadania w kolejności dodania, zachowując limit równoczesnych porównań na kartę.
    while (state.imageBodyCompareActiveCount < IMAGE_BODY_COMPARE_CONCURRENCY && state.imageBodyCompareQueue.length > 0) {
      const item = /** @type {ImageComparisonJob} */ (state.imageBodyCompareQueue.shift());
      state.imageBodyCompareQueuedUrls.delete(item.url);
      state.imageBodyCompareActiveCount += 1;

      compareImageBodyWithoutCredentials(state, item)
        .catch(/** @param {unknown} error */ (error) => {
          const image = state.imagesByUrl.get(item.url);
          if (image) {
            setImageBodyComparison(image, {
              status: 'error',
              exactMatch: false,
              improperAuthorization: false,
              error: /** @type {Error} */ (error).message
            });
          }
        })
        .finally(() => {
          state.imageBodyCompareActiveCount = Math.max(0, state.imageBodyCompareActiveCount - 1);
          runImageBodyCompareQueue(state);
        });
    }
  }

  /**
   * @param {ScanState} state
   * @param {ImageComparisonJob} item
   */
  async function compareImageBodyWithoutCredentials(state, item) {
    if (!state.attached || !state.mainFrameId) {
      throw new Error('Debugger is not attached to a loaded frame.');
    }

    const image = state.imagesByUrl.get(item.url);
    if (!image) {
      return;
    }

    setImageBodyComparison(image, {
      status: 'checking',
      exactMatch: false,
      improperAuthorization: false,
      mode: 'cdp-no-credentials'
    });

    // Zachowaj treść zarejestrowanej odpowiedzi przed niezależnym pobraniem bez sesji.
    const originalBody = await readCapturedImageBody(state.tabId, item.requestId);
    const originalBytes = originalBody.bytes;

    if (originalBytes.length > IMAGE_BODY_COMPARE_MAX_BYTES) {
      markImageBodyComparisonSkipped(image, `Original body is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
      return;
    }

    const originalSha256 = await hashBody(originalBytes);

    // Drugie żądanie celowo pomija dane uwierzytelniające i pamięć podręczną.
    const resource = await loadWithoutCredentials(state.tabId, state.mainFrameId, item.url);
    const publicStatus = resource.status;
    const noCredentialsHeaders = resource.headers;

    if (!resource.succeeded) {
      setImageBodyComparison(image, {
        status: 'error',
        exactMatch: false,
        improperAuthorization: false,
        originalBodySha256: originalSha256,
        originalBodyLength: originalBytes.length,
        noCredentialsStatus: publicStatus,
        noCredentialsHeaders,
        error: resource.error || 'No-credentials image load failed.'
      });
      return;
    }

    const publicBody = readResourceBytes(state.tabId, resource.body, IMAGE_BODY_COMPARE_MAX_BYTES);
    // Treść zwrócona bezpośrednio jest już dostępna; tylko odczyt strumienia oddaje czas innym zadaniom.
    const publicBytes = publicBody instanceof Uint8Array ? publicBody : await publicBody;

    if (publicBytes.length > IMAGE_BODY_COMPARE_MAX_BYTES) {
      markImageBodyComparisonSkipped(image, `No-credentials body is larger than ${IMAGE_BODY_COMPARE_MAX_BYTES} bytes.`);
      return;
    }

    const publicSha256 = await hashBody(publicBytes);
    // Wykrycie problemu wymaga zgodnych bajtów i statusów powodzenia obu odpowiedzi.
    const { exactMatch, improperAuthorization } = assessImageBodyComparison({
      originalLength: originalBytes.length,
      publicLength: publicBytes.length,
      originalSha256,
      publicSha256,
      originalStatus: image.status,
      publicStatus
    });

    if (improperAuthorization) {
      const previewDataUrl = originalBody.createPreview(image);
      if (previewDataUrl) {
        image.previewDataUrl = previewDataUrl;
      } else {
        delete image.previewDataUrl;
      }
    } else {
      delete image.previewDataUrl;
    }

    setImageBodyComparison(image, {
      status: exactMatch ? 'same' : 'different',
      exactMatch,
      improperAuthorization,
      originalBodySha256: originalSha256,
      originalBodyLength: originalBytes.length,
      noCredentialsBodySha256: publicSha256,
      noCredentialsBodyLength: publicBytes.length,
      noCredentialsStatus: publicStatus,
      noCredentialsHeaders,
      noCredentialsMimeType: resource.mimeType || '',
      mode: 'cdp-no-credentials',
      comparedAt: clock.nowIso()
    });
  }

  return { enqueueImageBodyComparison };
}
