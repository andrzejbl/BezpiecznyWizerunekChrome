/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').CorsPixelAccess} CorsPixelAccess */
/** @typedef {import('../../../types/scanning.js').CorsPixelSummary} CorsPixelSummary */

// Określ, które zdjęcia z wykrytym problemem pozwalają odczytać piksele z poziomu badanej strony.

import { parseUrl, getRegistrableDomain, normalizeOrigin } from './urls.js';
import { parseAccessControlAllowOrigin, getImageResponseHeaderEvidence } from './headers.js';

/**
 * @param {ImageRecord} image
 * @param {Pick<ScanState, 'pageOrigin'>} state
 * @returns {CorsPixelAccess}
 */
export function getCorsPixelAccessInfo(image, state) {
  const pageOrigin = normalizeOrigin(state && state.pageOrigin);
  const imageOrigin = normalizeOrigin(parseUrl(image && image.url ? image.url : '').origin);
  const headerEvidence = getImageResponseHeaderEvidence(image);
  const allowOrigin = parseAccessControlAllowOrigin(headerEvidence.headers);
  // Fetch porównuje cały nagłówek z serializowanym originem, bez normalizacji URL.
  // Ścieżka, końcowy ukośnik lub inna wielkość liter nie mogą dać zgodności.
  const allowedOrigin = allowOrigin.values[0] || '';
  const modes = [];

  if (pageOrigin && pageOrigin !== 'null' && imageOrigin && pageOrigin === imageOrigin) {
    modes.push('same-origin');
  }

  if (allowedOrigin === '*') {
    modes.push('cors-wildcard');
  }

  if (pageOrigin && allowedOrigin === pageOrigin) {
    modes.push('cors-page-origin');
  }

  if (pageOrigin === 'null' && allowedOrigin === 'null') {
    modes.push('cors-null-origin');
  }

  return {
    possible: modes.length > 0,
    modes,
    accessControlAllowOrigin: allowOrigin.header,
    responseHeaderSource: headerEvidence.source,
    pageOrigin: state && state.pageOrigin ? state.pageOrigin : '',
    imageOrigin: parseUrl(image && image.url ? image.url : '').origin,
    reason: modes.join(', ')
  };
}

/**
 * @param {ImageRecord} image
 */
function isImageBodyComparisonImproperAuthorization(image) {
  return image && image.bodyComparison && image.bodyComparison.improperAuthorization === true;
}

/**
 * @param {ScanState} state
 */
export function getCorsPixelReadableImproperAuthorizationImages(state) {
  if (!state || !Array.isArray(state.images)) {
    return [];
  }

  return state.images
    .filter(isImageBodyComparisonImproperAuthorization)
    .map((image) => ({ image, cors: getCorsPixelAccessInfo(image, state) }))
    .filter((item) => item.cors.possible);
}

/**
 * @param {{image:ImageRecord, cors:CorsPixelAccess}[]} items
 * @returns {CorsPixelSummary}
 */
export function summarizeCorsPixelReadableImages(items) {
  /** @type {Set<string>} */
  const domains = new Set();
  /** @type {Set<string>} */
  const modes = new Set();
  /** @type {Set<string>} */
  const allowOrigins = new Set();

  items.forEach((item) => {
    const parsed = parseUrl(item.image.url || '');
    if (parsed.hostname) {
      domains.add(getRegistrableDomain(parsed.hostname) || parsed.hostname);
    }
    (item.cors.modes || []).forEach((mode) => modes.add(mode));
    if (item.cors.accessControlAllowOrigin) {
      allowOrigins.add(item.cors.accessControlAllowOrigin);
    }
  });

  return {
    possible: items.length > 0,
    imageCount: items.length,
    imageDomains: Array.from(domains).sort(),
    modes: Array.from(modes).sort(),
    accessControlAllowOrigins: Array.from(allowOrigins).sort().slice(0, 20)
  };
}
