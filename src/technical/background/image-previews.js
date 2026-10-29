/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/cdp.js').ResponseBody} ResponseBody */

// Twórz rastrowe podglądy z limitem rozmiaru, tylko w formatach już obsługiwanych przez raport.

import { IMAGE_PREVIEW_MAX_BYTES } from '../../business/scanning/config.js';
import { parseUrl } from '../../business/scanning/urls.js';
import { bytesToBase64 } from './cdp-streams.js';

/**
 * @param {ImageRecord} image
 */
function getImagePreviewMimeType(image) {
  const mimeType = String(image && image.mimeType ? image.mimeType : '').split(';')[0].trim().toLowerCase();
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml' && mimeType !== 'image/gif') {
    return mimeType;
  }

  const pathname = parseUrl(image && image.url ? image.url : '').pathname.toLowerCase();
  if (/\.jpe?g$/i.test(pathname)) {
    return 'image/jpeg';
  }
  if (/\.png$/i.test(pathname)) {
    return 'image/png';
  }
  if (/\.webp$/i.test(pathname)) {
    return 'image/webp';
  }
  if (/\.avif$/i.test(pathname)) {
    return 'image/avif';
  }
  if (/\.bmp$/i.test(pathname)) {
    return 'image/bmp';
  }
  if (/\.ico$/i.test(pathname)) {
    return 'image/x-icon';
  }

  return '';
}

/**
 * @param {ImageRecord} image
 * @param {ResponseBody} originalBody
 * @param {Uint8Array<ArrayBuffer>} originalBytes
 */
export function makeImagePreviewDataUrl(image, originalBody, originalBytes) {
  if (!originalBytes || originalBytes.length === 0 || originalBytes.length > IMAGE_PREVIEW_MAX_BYTES) {
    return '';
  }

  const mimeType = getImagePreviewMimeType(image);
  if (!mimeType) {
    return '';
  }

  const base64 = originalBody && originalBody.base64Encoded === true
    ? String(originalBody.body || '')
    : bytesToBase64(originalBytes);

  return `data:${mimeType};base64,${base64}`;
}
