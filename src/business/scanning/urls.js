/** @typedef {import('../../../types/scanning.js').ParsedUrl} ParsedUrl */

// Odczyt części URL i dotychczasowe uproszczone rozpoznawanie sufiksów przy grupowaniu domen.

export const INTERNAL_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'chromewebdata:',
  'devtools:',
  'edge:',
  'about:'
]);

const KNOWN_MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'com.cn',
  'com.hk',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.in',
  'com.pl',
  'net.pl',
  'org.pl'
]);

/**
 * @param {unknown} url
 * @returns {ParsedUrl}
 */
export function parseUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      origin: '',
      hostname: '',
      protocol: '',
      pathname: '',
      filename: '',
      query: ''
    };
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const parts = pathname.split('/').filter(Boolean);
    const filename = parts.length > 0 ? parts[parts.length - 1] : '';

    return {
      origin: parsed.origin === 'null' ? '' : parsed.origin,
      hostname: parsed.hostname || '',
      protocol: parsed.protocol || '',
      pathname,
      filename: filename || '(index)',
      query: parsed.search || ''
    };
  } catch (error) {
    return {
      origin: '',
      hostname: '',
      protocol: '',
      pathname: '',
      filename: url.slice(0, 80) || '(anonymous)',
      query: ''
    };
  }
}

/**
 * @param {string} hostname
 */
function isLikelyIpAddress(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

/**
 * @param {string} hostname
 */
export function getRegistrableDomain(hostname) {
  if (!hostname) {
    return '';
  }

  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'localhost' || isLikelyIpAddress(normalized)) {
    return normalized;
  }

  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }

  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  /*
   * To uproszczone rozwiązanie zastępcze, bez pełnej obsługi Public Suffix List.
   * Obsługuje typowe przypadki używane przez rozszerzenie, na przykład:
   * creator.empikfoto.pl -> empikfoto.pl,
   * www.googletagmanager.com -> googletagmanager.com,
   * d2w4x5cd12tf59.cloudfront.net -> cloudfront.net.
   * W kodzie produkcyjnym lepiej użyć biblioteki takiej jak tldts.
   */
  if (KNOWN_MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }

  return lastTwo;
}

/**
 * @param {unknown} value
 */
export function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.toLowerCase() === 'null') {
    return 'null';
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin === 'null' ? '' : parsed.origin.toLowerCase();
  } catch (error) {
    return raw.toLowerCase();
  }
}
