// Decyzje raportowania, niezależne od interfejsu i formatu pliku.

/**
 * Sprawdza, czy eksport wymaga zatrzymania skanu.
 * @param {import("../../../types/scanning.js").ScanSnapshot | null} state
 */
export function scanIsInProgress(state) {
  return Boolean(state && (state.scanning === true || state.status === 'scanning'));
}

/**
 * Określa, czy istnieje kontekst możliwy do opisania w raporcie.
 * @param {import("../../../types/scanning.js").ScanSnapshot | null} state
 */
export function hasReportData(state) {
  return Boolean(
    state && (state.pageUrl || state.scanStartedAt ||
      state.status === 'stopped' || state.status === 'detached' || state.status === 'error')
  );
}

/**
 * Nieobecne i nieprawidłowe liczniki prezentuje jako zero.
 * @param {unknown} value
 */
export function reportCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Najsilniejszy sygnał ustala pilność całego raportu.
 * @param {import("../../../types/popup.js").SecuritySummary} summary
 * @returns {import("../../../types/report.js").ReportPriority}
 */
export function reportPriority(summary) {
  if (summary.passwordDomains > 0) {
    return { level: 'critical', label: 'KRYTYCZNY' };
  }
  if (summary.improperAuthorizationImages > 0) {
    return {
      level: 'high', label: 'WYSOKI', detail: 'WYMAGA WERYFIKACJI TREŚCI ZDJĘĆ'
    };
  }
  if (summary.corsPixelDomains > 0) {
    return { level: 'elevated', label: 'PODWYŻSZONY' };
  }
  if (summary.passwordUnknownDomains > 0) {
    return { level: 'elevated', label: 'DOSTĘP DO HASŁA NIEUSTALONY' };
  }
  if (summary.thirdPartyDomains > 0) {
    return { level: 'informational', label: 'INFORMACYJNY' };
  }
  return { level: 'clear', label: 'BRAK ALARMÓW DLA PRZEANALIZOWANYCH ZAPYTAŃ SIECIOWYCH' };
}

/**
 * Rozróżnia obserwację, możliwość dostępu i lokalną blokadę.
 * @param {import("../../../types/scanning.js").PasswordAccess} access
 */
export function getPasswordEvidenceLabel(access) {
  if (access.accessScope === 'unknown') {
    return access.blockedByClient === true
      ? 'ZABLOKOWANY LOKALNIE - DOSTĘP NIEUSTALONY'
      : 'DOSTĘP NIEUSTALONY';
  }
  if (access.blockedByClient === true) {
    return 'ZABLOKOWANY LOKALNIE - POTENCJALNA MOŻLIWOŚĆ';
  }
  if (access.observed === false) {
    return 'MOŻLIWOŚĆ DOSTĘPU';
  }
  if (access.kind === 'password.value.get') {
    return 'POTWIERDZONY ODCZYT WARTOŚCI';
  }
  if (access.kind === 'password.value.set') {
    return 'POTWIERDZONY ZAPIS WARTOŚCI';
  }
  return 'POTWIERDZONY DOSTĘP DO ELEMENTU DOM';
}
