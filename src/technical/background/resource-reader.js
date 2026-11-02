/** @typedef {import('../../../types/scanning.js').CapturedImageBody} CapturedImageBody */
/** @typedef {import('../../../types/scanning.js').LoadedResource} LoadedResource */
/** @typedef {import('../../../types/cdp.js').ResponseBody} ResponseBody */
/** @typedef {import('../../../types/cdp.js').ResourceBody} ResourceBody */

// Przekształcaj zasoby CDP na granicy przesyłania danych. Scenariusze biznesowe nie interpretują uchwytu treści.
import { sendDebuggerCommand } from './chrome-api.js';
import { bytesToBase64, decodeCdpBodyToBytes, readCdpStream, readCdpStreamBytes } from './cdp-streams.js';
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
export async function loadWithoutCredentials(tabId, frameId, url) {
  // Omit pomija cookies również dla tego samego originu; nie kopiuj nagłówków żądania strony.
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
    referrerPolicy: 'no-referrer'
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  /** @type {Record<string,string>} */
  const headers = {};
  response.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });
  return {
    status: response.status,
    headers,
    succeeded: true,
    error: '',
    mimeType: response.headers.get('content-type') || '',
    body: { content: bytesToBase64(bytes), base64Encoded: true }
  };
}

/**
 * @param {number} tabId
 * @param {ResourceBody} body
 */
export function readResourceText(tabId, body) {
  if (body.stream) return readCdpStream(tabId, body.stream);
  return body.base64Encoded
    ? new TextDecoder().decode(decodeCdpBodyToBytes(body.content || '', true))
    : String(body.content || '');
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
