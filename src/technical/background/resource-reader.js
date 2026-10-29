/** @typedef {import('../../../types/scanning.js').CapturedImageBody} CapturedImageBody */
/** @typedef {import('../../../types/scanning.js').LoadedResource} LoadedResource */
/** @typedef {import('../../../types/cdp.js').ResponseBody} ResponseBody */
/** @typedef {import('../../../types/cdp.js').ResourceBody} ResourceBody */

// Przekształcaj zasoby CDP na granicy przesyłania danych. Scenariusze biznesowe nie interpretują uchwytu treści.
import { sendDebuggerCommand } from './chrome-api.js';
import { normalizeHeaders } from '../../business/scanning/headers.js';
import { decodeCdpBodyToBytes, readCdpStream, readCdpStreamBytes } from './cdp-streams.js';
import { makeImagePreviewDataUrl } from './image-previews.js';

/**
 * @param {number} tabId
 * @param {string} requestId
 * @returns {Promise<CapturedImageBody>}
 */
export function readCapturedImageBody(tabId, requestId) {
  return sendDebuggerCommand(tabId, 'Network.getResponseBody', { requestId }, /** @param {ResponseBody} body */ (body) => {
    const bytes = decodeCdpBodyToBytes(body.body || '', body.base64Encoded === true);
    return { bytes, createPreview: (image) => makeImagePreviewDataUrl(image, body, bytes) };
  });
}

/**
 * @param {number} tabId
 * @param {string} frameId
 * @param {string} url
 * @returns {Promise<LoadedResource>}
 */
export function loadWithoutCredentials(tabId, frameId, url) {
  return sendDebuggerCommand(tabId, 'Network.loadNetworkResource', {
    frameId,
    url,
    options: { disableCache: true, includeCredentials: false }
  }, /** @param {{resource?:ResourceBody}} response */ (response) => {
    const resource = response.resource || {};
    return {
      status: typeof resource.httpStatusCode === 'number' ? resource.httpStatusCode : null,
      headers: normalizeHeaders(resource.headers),
      succeeded: resource.success !== false,
      error: resource.netErrorName || resource.netError || '',
      mimeType: resource.mimeType || '',
      body: resource
    };
  });
}

/**
 * @param {number} tabId
 * @param {ResourceBody} body
 */
export function readResourceText(tabId, body) {
  return body.stream ? readCdpStream(tabId, body.stream) : String(body.content || '');
}

/**
 * @param {number} tabId
 * @param {ResourceBody} body
 * @param {number} maxBytes
 */
export function readResourceBytes(tabId, body, maxBytes) {
  return body.stream
    ? readCdpStreamBytes(tabId, body.stream, maxBytes)
    : decodeCdpBodyToBytes(body.content || '', body.base64Encoded === true);
}
