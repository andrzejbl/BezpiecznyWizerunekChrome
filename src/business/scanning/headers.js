/** @typedef {import('../../../types/scanning.js').ResponseHeaders} ResponseHeaders */
/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').RobotsHeaderDirective} RobotsHeaderDirective */

// Ujednolicaj nagłówki odpowiedzi, zanim reguły kontroli zdjęć zaczną je interpretować.

/**
 * @param {unknown} headers
 * @returns {ResponseHeaders}
 */
export function normalizeHeaders(headers) {
  /** @type {ResponseHeaders} */
  const normalized = {};
  if (!headers || typeof headers !== 'object') {
    return normalized;
  }

  Object.entries(headers).forEach(([name, value]) => {
    const key = String(name || '').toLowerCase();
    if (!key) {
      return;
    }

    const stringValue = Array.isArray(value)
      ? value.join(', ')
      : String(value === undefined || value === null ? '' : value);

    if (!stringValue) {
      return;
    }

    normalized[key] = normalized[key] ? `${normalized[key]}, ${stringValue}` : stringValue;
  });

  return normalized;
}

/**
 * @param {unknown} existingHeaders
 * @param {unknown} incomingHeaders
 */
export function mergeHeaders(existingHeaders, incomingHeaders) {
  return {
    ...normalizeHeaders(existingHeaders),
    ...normalizeHeaders(incomingHeaders)
  };
}

/**
 * @param {unknown} headers
 * @param {string} name
 */
export function getHeaderValue(headers, name) {
  const normalized = normalizeHeaders(headers);
  return normalized[String(name || '').toLowerCase()] || '';
}

/**
 * @param {unknown} headers
 */
export function parseAccessControlAllowOrigin(headers) {
  const value = getHeaderValue(headers, 'access-control-allow-origin');
  // ACAO dopuszcza jedną wartość. Listy i powtórzone nagłówki nie udzielają dostępu.
  // Usuwamy wyłącznie brzegowe spacje i tabulatory HTTP, zachowując surowy dowód.
  const origin = value.replace(/^[\t ]+|[\t ]+$/g, '');

  return {
    header: value,
    values: origin && !/[,\r\n]/.test(origin) ? [origin] : []
  };
}

/**
 * @param {ImageRecord} image
 */
export function getImageResponseHeaderEvidence(image) {
  const comparison = image && image.bodyComparison ? image.bodyComparison : null;
  if (comparison && Object.prototype.hasOwnProperty.call(comparison, 'noCredentialsHeaders')) {
    return {
      headers: normalizeHeaders(comparison.noCredentialsHeaders),
      source: 'no-credentials-request'
    };
  }

  return {
    headers: normalizeHeaders(image && image.headers),
    source: 'session-response'
  };
}

/**
 * @param {unknown} headers
 */
export function hasCacheNoStore(headers) {
  return /(?:^|[,\s])no-store(?:$|[,\s=;])/i.test(getHeaderValue(headers, 'cache-control'));
}

/**
 * @param {ImageRecord} image
 */
export function hasMeaningfulResponseMetadata(image) {
  return (
    typeof image.status === 'number' ||
    Boolean(image.mimeType) ||
    Object.keys(normalizeHeaders(image.headers)).length > 0
  );
}

/**
 * @param {unknown} headers
 */
export function getGoogleRobotsHeaderBlock(headers) {
  const header = getHeaderValue(headers, 'x-robots-tag');
  if (!header) {
    return { header: '', blocked: false, directives: [] };
  }

  /** @type {RobotsHeaderDirective[]} */
  const directives = [];
  const blocked = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const scopedMatch = part.match(/^([a-z0-9_-]+)\s*:\s*(.+)$/i);
      const agent = scopedMatch ? scopedMatch[1].toLowerCase() : '';
      const directiveText = (scopedMatch ? scopedMatch[2] : part).toLowerCase();
      const isGoogleScope = !agent || agent === 'googlebot' || agent === 'googlebot-image';
      const blocks = /\b(?:noindex|none|noimageindex)\b/i.test(directiveText);

      directives.push({ agent, value: directiveText, blocksGoogle: isGoogleScope && blocks });
      return isGoogleScope && blocks;
    });

  return { header, blocked, directives };
}
