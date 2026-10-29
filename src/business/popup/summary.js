// Czyste reguły podsumowania: dane wejściowe pochodzą z bieżącej sesji okna rozszerzenia.
/** @param {import('../../../types/popup.js').PopupSession} session */
function getAllImproperAuthorizationFindings(session) {
  return session.visibleImages.map((image) => ({ ...image }));
}

/** @param {import('../../../types/popup.js').PopupSession} session @returns {import('../../../types/popup.js').ReportStats} */
export function getReportStats(session) {
  const scriptTree = session.latestState && session.latestState.scriptTree ? session.latestState.scriptTree : null;
  const passwordTree = session.latestState && session.latestState.passwordAccessTree ? session.latestState.passwordAccessTree : null;

  return {
    imageFindings: getAllImproperAuthorizationFindings(session),
    scriptGroups: scriptTree && Array.isArray(scriptTree.thirdPartyGroups) ? scriptTree.thirdPartyGroups : [],
    passwordGroups: passwordTree && Array.isArray(passwordTree.groups) ? passwordTree.groups : [],
    scriptTree,
    passwordTree
  };
}

/** @param {import('../../../types/popup.js').PopupSession} session @returns {import('../../../types/popup.js').SecuritySummary} */
export function getSecuritySummary(session) {
  const reportStats = getReportStats(session);
  const imageFindings = reportStats.imageFindings;
  const scriptTree = reportStats.scriptTree;
  const passwordTree = reportStats.passwordTree;

  const cacheIssues = imageFindings.filter((image) => {
    /** @type {Partial<import('../../../types/scanning.js').CacheAudit>} */
    const cache = image.cache || {};
    return image.missingCacheNoStore === true || cache.missingNoStore === true;
  }).length;

  const googleIssues = imageFindings.filter((image) => {
    /** @type {Partial<import('../../../types/scanning.js').IndexingAudit>} */
    const indexing = image.indexing || {};
    return image.googleIndexingOpen === true || image.googleIndexingNotBlocked === true || indexing.googleIndexingOpen === true || indexing.googleNotBlocked === true;
  }).length;

  const corsPixelDomains = scriptTree ? (scriptTree.thirdPartyCorsPixelAccessDomainsCount || 0) : 0;
  const corsPixelUnknownDomains = scriptTree ? (scriptTree.thirdPartyCorsPixelAccessUnknownDomainsCount || 0) : 0;
  const corsPixelImages = scriptTree
    ? (scriptTree.thirdPartyCorsPixelAccessImageCount ?? scriptTree.corsPixelAccess?.imageCount ?? 0)
    : 0;
  const thirdPartyDomains = scriptTree ? (scriptTree.thirdPartyDomainsCount || 0) : 0;
  const thirdPartyScripts = scriptTree ? (scriptTree.thirdPartyScriptsCount || 0) : 0;
  const passwordDomains = reportStats.passwordGroups.filter((group) => group.accessScope !== 'unknown').length;
  const passwordUnknownDomains = reportStats.passwordGroups.filter((group) => group.accessScope === 'unknown').length;
  const passwordInputs = passwordTree ? (passwordTree.passwordInputCount || 0) : 0;
  const passwordEvents = passwordTree ? (passwordTree.totalAccesses || 0) : 0;
  const passwordValueEvents = passwordTree ? (passwordTree.totalValueAccesses || 0) : 0;
  const passwordValueDomains = passwordTree ? (passwordTree.valueAccessDomainsCount || 0) : 0;
  // Liczba rekordów i liczba kategorii problemów są różnymi licznikami.
  const totalIssues = imageFindings.length + thirdPartyDomains + passwordDomains;
  const problemTypes = [
    imageFindings.length > 0,
    cacheIssues > 0,
    googleIssues > 0,
    thirdPartyDomains > 0,
    corsPixelDomains > 0,
    passwordDomains > 0
  ].filter(Boolean).length;
  const hasAnyProblem = problemTypes > 0;
  const hasAnyData = Boolean(session.latestState && (
    session.latestState.scanStartedAt ||
    (session.latestState.status && session.latestState.status !== 'idle') ||
    session.latestState.imageCount > 0 ||
    (scriptTree && scriptTree.totalScripts > 0) ||
    passwordInputs > 0 ||
    session.latestState.attached ||
    session.latestState.scanning
  ));

  return {
    totalIssues,
    problemTypes,
    hasAnyProblem,
    hasAnyData,
    improperAuthorizationImages: imageFindings.length,
    cacheIssues,
    googleIssues,
    corsPixelDomains,
    corsPixelUnknownDomains,
    corsPixelImages,
    thirdPartyDomains,
    thirdPartyScripts,
    passwordDomains,
    passwordUnknownDomains,
    passwordInputs,
    passwordEvents,
    passwordValueEvents,
    passwordValueDomains
  };
}

/** @param {import('../../../types/popup.js').SecuritySummary} summary @returns {import('../../../types/popup.js').RiskCopy} */
export function riskCopy(summary) {
  if (!summary.hasAnyData) {
    return {
      level: 'Jeszcze tego nie wiemy',
      text: 'Sprawdź stronę, aby zobaczyć, kto może uzyskać dostęp do zdjęć i pól hasła.',
      meaning: 'Wynik dotyczy wyłącznie aktualnie otwartej strony.',
      actionTitle: '',
      action: ''
    };
  }

  if (summary.passwordDomains > 0) {
    if (summary.passwordValueEvents > 0) {
      return {
        level: 'Krytyczne zagrożenie hasła',
        text: 'Zewnętrzne skrypty wykonały ' + summary.passwordValueEvents + ' odczytów lub zapisów wartości pola hasła.',
        meaning: 'To najmocniejszy wykryty dowód dostępu do danych wpisywanych w polu hasła.',
        actionTitle: 'Nie wpisuj tu hasła',
        action: 'Zachowaj raport RODO, zmień użyte hasło z zaufanego urządzenia i przekaż dowód właścicielowi strony lub inspektorowi ochrony danych.'
      };
    }

    return {
      level: 'Krytyczna możliwość dostępu do hasła',
      text: summary.passwordDomains + ' domen zewnętrznych działa przy polach hasła i ma techniczną możliwość odczytania ich wartości.',
      meaning: 'Nie zaobserwowano odczytu wartości, ale dostęp skryptu zewnętrznego do pola hasła traktujemy jako problem krytyczny.',
      actionTitle: 'Wstrzymaj wpisywanie hasła',
      action: 'Pobierz raport RODO i poproś właściciela strony o wyjaśnienie, dlaczego domeny zewnętrzne działają przy polu hasła.'
    };
  }

  if (summary.improperAuthorizationImages > 0) {
    return {
      level: 'Możliwe naruszenie poufności',
      text: summary.improperAuthorizationImages + ' zdjęć serwer wydał bez poprawnej autoryzacji użytkownika, a ich treść jest identyczna z wersją widzianą podczas sesji.',
      meaning: 'Serwer mógł sprawdzić token zawarty w URL-u, ale nie wymagał potwierdzenia tożsamości i uprawnienia użytkownika. Dla danych osobowych oznacza to ryzyko ujawnienia osobom nieuprawnionym.',
      actionTitle: 'Sprawdź, kogo widać na zdjęciach',
      action: 'Pobierz raport RODO. Zawiera adresy, statusy HTTP, daty oraz zgodne skróty SHA-256 potwierdzające identyczność plików.'
    };
  }

  if (summary.corsPixelDomains > 0) {
    return {
      level: 'Dane mogą trafić do domen zewnętrznych',
      text: summary.corsPixelDomains + ' domen zewnętrznych może odczytać treść zdjęć znalezionych na stronie.',
      meaning: 'Oznacza to techniczną możliwość przetwarzania pikseli zdjęć poza domeną odwiedzanej strony.',
      actionTitle: 'Sprawdź, komu udostępniono dane',
      action: 'Otwórz dowody domen zewnętrznych i pobierz raport RODO z listą skryptów oraz podstawą techniczną oceny.'
    };
  }

  if (summary.passwordUnknownDomains > 0) {
    return {
      level: 'Dostęp do hasła nieustalony',
      text: 'Dla ' + summary.passwordUnknownDomains + ' domen zewnętrznych nie ustalono, czy ich skrypty mogą dotrzeć do wykrytych pól hasła.',
      meaning: 'Brakuje danych o kontekście wykonania lub dokumencie pola hasła. Sama obecność skryptu nie potwierdza możliwości dostępu.',
      actionTitle: 'Sprawdź nieustalone konteksty',
      action: 'Przejrzyj domeny oznaczone „Dostęp nieustalony” i szczegóły w raporcie. Ten wynik wymaga weryfikacji.'
    };
  }

  if (summary.thirdPartyDomains > 0) {
    return {
      level: 'Strona korzysta z domen zewnętrznych',
      text: summary.thirdPartyDomains + ' domen zewnętrznych wykryto na stronie lub w jej ramkach.',
      meaning: 'Sama obecność domeny nie potwierdza dostępu do głównego dokumentu ani naruszenia. Szczegóły rozróżniają możliwość dostępu do zdjęć i wynik nieustalony.',
      actionTitle: 'Sprawdź listę odbiorców',
      action: 'Przejrzyj domeny zewnętrzne. Raport rozróżnia skrypty uruchomione od zablokowanych lokalnie.'
    };
  }

  return {
    level: 'Nie znaleziono oznak ujawnienia',
    text: 'Dla przeanalizowanych zapytań sieciowych nie wykryto zdjęć bez poprawnej autoryzacji użytkownika ani domen zewnętrznych przy polach hasła.',
    meaning: 'Wynik nie gwarantuje pełnego bezpieczeństwa. Dotyczy jednego ładowania aktualnej strony i mechanizmów sprawdzanych przez rozszerzenie.',
    actionTitle: 'Wynik jest spokojny',
    action: 'Możesz pobrać raport RODO dokumentujący zakres, czas i wynik sprawdzenia.'
  };
}

// Kolejność ma znaczenie: silniejszy sygnał wyznacza kolor całego widoku.
/** @param {import('../../../types/popup.js').SecuritySummary} summary */
export function getRiskLevel(summary) {
  if (!summary.hasAnyData) return 'empty';
  if (summary.passwordDomains > 0) return 'critical';
  if (summary.improperAuthorizationImages > 0) return 'high';
  if (summary.corsPixelDomains > 0) return 'medium';
  if (summary.passwordUnknownDomains > 0) return 'unknown';
  if (summary.thirdPartyDomains > 0) return 'low';
  return 'none';
}
