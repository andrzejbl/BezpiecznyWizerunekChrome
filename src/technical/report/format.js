// Formatowanie wartości przedstawianych w raporcie bez zmiany danych źródłowych.

/**
 * Dzieli skrót na grupy znaków czytelne w raporcie.
 * @param {unknown} value
 */
export function formatHashForPdf(value) {
  const hash = String(value || '-');
  return hash === '-' ? hash : (hash.match(/.{1,8}/g) || [hash]).join(' ');
}

/**
 * Przedstawia liczbę bajtów wraz z jednostką pomocniczą.
 * @param {unknown} value
 */
export function formatBytes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  if (value >= 1024 * 1024) {
    return value + ' B (' + (value / 1024 / 1024).toFixed(2) + ' MB)';
  }

  if (value >= 1024) {
    return value + ' B (' + (value / 1024).toFixed(1) + ' KB)';
  }

  return value + ' B';
}

/**
 * Rozróżnia potwierdzone tak, nie i brak ustalenia.
 * @param {unknown} value
 */
export function formatFlag(value) {
  if (value === true) {
    return 'TAK';
  }
  if (value === false) {
    return 'NIE';
  }
  return 'NIE USTALONO';
}

/**
 * Normalizuje brak licznika tylko na potrzeby prezentacji.
 * @param {unknown} value
 */
export function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Formatuje czas w lokalnym formacie polskim.
 * @param {Date | string | number | null | undefined} value
 */
export function formatReportDate(value) {
  if (!value) {
    return '-';
  }

  try {
    return new Date(value).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch (error) {
    return String(value);
  }
}

/**
 * Wybiera najbardziej czytelną nazwę grupy domenowej.
 * @param {{registrableDomain?: string, hostname?: string, label?: string, origin?: string} | null | undefined} group
 */
export function groupDomain(group) {
  const value = group && (group.registrableDomain || group.hostname || group.label || group.origin);
  return value ? String(value) : 'nieznana domena';
}

/**
 * Tłumaczy klasyfikację pochodzenia skryptu.
 * @param {string | undefined} classification
 */
export function reportClassificationLabel(classification) {
  if (classification === 'third-party') {
    return 'domena zewnętrzna';
  }
  if (classification === 'same-site') {
    return 'ta sama główna domena';
  }
  if (classification === 'first-party-origin') {
    return 'domena strony';
  }
  return classification || '-';
}
