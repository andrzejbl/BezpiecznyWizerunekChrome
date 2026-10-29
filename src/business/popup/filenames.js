// Reguły nazw plików; czas i bieżące dane strony podaje wywołujący.
/** @param {unknown} value @param {string} fallback */
function sanitizeFilenamePart(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return cleaned || fallback;
}

/** @param {import('../../../types/scanning.js').ScanSnapshot|null} latestState */
export function getReportPageDomain(latestState) {
  const candidates = [
    latestState && latestState.pageUrl,
    latestState && latestState.pageOrigin,
    latestState && latestState.scriptTree && latestState.scriptTree.pageUrl,
    latestState && latestState.scriptTree && latestState.scriptTree.pageOrigin
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.hostname) {
        return sanitizeFilenamePart(parsed.hostname, 'nieznana-strona');
      }
    } catch (error) {
      const cleaned = sanitizeFilenamePart(candidate, '');
      if (cleaned) {
        return cleaned;
      }
    }
  }

  return 'nieznana-strona';
}

/** @param {Date} date */
export function getFilenameTimestamp(date) {
  /** @param {number} value */
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('-');
}

/** @param {import('../../../types/scanning.js').ScanSnapshot|null} latestState @param {Date} date */
export function getPdfReportFilename(latestState, date) {
  return 'raport-rodo-' + getReportPageDomain(latestState) + '-' + getFilenameTimestamp(date) + '.pdf';
}
