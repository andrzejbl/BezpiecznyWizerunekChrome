/** @typedef {import('../../../types/scanning.js').CapturedImageBody} CapturedImageBody */
/** @typedef {import('../../../types/scanning.js').LoadedResource} LoadedResource */
/** @typedef {import('../../../types/cdp.js').ResponseBody} ResponseBody */
/** @typedef {import('../../../types/cdp.js').ResourceBody} ResourceBody */

// Przekształcaj zasoby CDP na granicy przesyłania danych. Scenariusze biznesowe nie interpretują uchwytu treści.
import { sendDebuggerCommand } from './chrome-api.js';
import { decodeCdpBodyToBytes, readCdpStream, readCdpStreamBytes } from './cdp-streams.js';
import { makeImagePreviewDataUrl } from './image-previews.js';
import { loadBackgroundResource } from './background-resource-loader.js';
import { normalizeHeaders } from '../../business/scanning/headers.js';
import { IMAGE_BODY_COMPARE_MAX_BYTES } from '../../business/scanning/config.js';
import { takeResponseBodyCapture } from './response-body-capture.js';

/** Policz UTF-8 bez tworzenia drugiego dużego bufora. @param {string} text */
function utf8ByteLength(text) {
  let length = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

/** @param {{bytes:Uint8Array<ArrayBuffer>,byteLength:number,truncated?:boolean}} capture @returns {CapturedImageBody} */
function capturedBody(capture) {
  const { bytes, byteLength, truncated } = capture;
  return {
    bytes, byteLength, truncated,
    createPreview: (image) => truncated ? '' : makeImagePreviewDataUrl(image, { body: '', base64Encoded: false }, bytes)
  };
}

/**
 * @param {number} tabId
 * @param {string} requestId
 * @returns {Promise<CapturedImageBody>}
 */
export async function readCapturedImageBody(tabId, requestId) {
  // Strumień CDP zachowuje bajty także wtedy, gdy serwer błędnie opisuje obraz jako tekst.
  const capture = await takeResponseBodyCapture(tabId, requestId);
  if (capture) return capturedBody(capture);
  return sendDebuggerCommand(tabId, 'Network.getResponseBody', { requestId }, /** @param {ResponseBody} body */ (body) => {
    const text = body.body || '';
    const base64 = body.base64Encoded === true;
    const byteLength = base64
      ? Math.floor(text.length * 3 / 4) - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0)
      : utf8ByteLength(text);
    const truncated = byteLength > IMAGE_BODY_COMPARE_MAX_BYTES;
    // Dla dużej odpowiedzi wystarczy nagłówek do wykrycia formatu; nie dekoduj całego base64.
    const bytes = decodeCdpBodyToBytes(truncated ? text.slice(0, base64 ? 44 : 32) : text, base64);
    return capturedBody({ bytes, byteLength, truncated });
  });
}

/**
 * @param {number} tabId
 * @param {string} frameId
 * @param {string} url
 * @param {number} [maxBytes]
 * @param {{skipHttpErrorBody?:boolean}} [options]
 * @returns {Promise<LoadedResource>}
 */
export async function loadWithoutCredentials(tabId, frameId, url, maxBytes = IMAGE_BODY_COMPARE_MAX_BYTES, options) {
  // Parametry karty zachowują kontrakt portu; pobranie zawsze należy do własnego workera.
  const resource = await loadBackgroundResource(url, maxBytes, options);
  const headers = normalizeHeaders(resource.headers);
  return {
    status: typeof resource.httpStatusCode === 'number' ? resource.httpStatusCode : null,
    headers,
    succeeded: resource.success !== false,
    error: resource.netErrorName || resource.netError || '',
    mimeType: resource.mimeType || headers['content-type'] || '',
    body: resource
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
