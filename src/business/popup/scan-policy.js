// Warunki rozpoczęcia skanu oraz komunikaty i dostępność akcji. Bez zależności od interfejsu.
/** @param {import('../../../types/scanning.js').ScanSnapshot|null} state */
export function isScanActive(state) {
  return Boolean(state && state.attached === true && state.scanning === true);
}

/** @param {import('../../../types/popup.js').PopupSession} session @param {boolean} hasReportData */
export function getScanControlsModel(session, hasReportData) {
  const scanActive = isScanActive(session.latestState);
  const status = session.latestState && session.latestState.status ? session.latestState.status : 'idle';
  let stateName = 'idle';
  let title = 'Skanowanie nieaktywne';
  let description = 'Kliknij „Sprawdź stronę”, aby rozpocząć.';

  if (session.pendingAction === 'startScanWithReload') {
    stateName = 'starting';
    title = 'Uruchamiam skanowanie';
    description = 'Podłączam analizę i przeładowuję stronę.';
  } else if (session.pendingAction === 'stopScan') {
    stateName = 'stopping';
    title = 'Kończę skanowanie';
    description = 'Zebrane wyniki pozostaną dostępne.';
  } else if (scanActive) {
    stateName = 'scanning';
    title = 'Skanowanie trwa';
    description = 'Nowe żądania są nadal zbierane. Możesz zakończyć skan bez kasowania wyników.';
  } else if (status === 'error') {
    stateName = 'error';
    title = 'Skanowanie zakończone błędem';
    description = 'Dotychczas zebrane wyniki pozostają dostępne.';
  } else if (status === 'detached' || status === 'closed') {
    stateName = 'interrupted';
    title = 'Skanowanie przerwane';
    description = 'Debugger został odłączony. Dotychczasowe wyniki zostały zachowane.';
  } else if (hasReportData) {
    stateName = 'stopped';
    title = 'Skanowanie zakończone';
    description = 'Wyniki są zachowane. Możesz sprawdzić stronę ponownie od początku.';
  }

  return { scanActive, stateName, title, description };
}

/** @param {import('../../../types/popup.js').PopupSession} session */
export function getButtonAvailability(session) {
  const hasVisibleImages = session.visibleImages.length > 0;
  const hasReportData = Boolean(session.latestState && (
    session.latestState.pageUrl ||
    session.latestState.scanStartedAt ||
    session.latestState.status === 'stopped' ||
    session.latestState.status === 'detached' ||
    session.latestState.status === 'error'
  ));
  const tree = session.latestState && session.latestState.scriptTree ? session.latestState.scriptTree : null;
  const hasScripts = tree && tree.totalScripts > 0;
  const hasThirdParty = tree && tree.thirdPartyScriptsCount > 0;
  const attached = session.latestState && session.latestState.attached;

  return { hasVisibleImages, hasReportData, hasScripts, hasThirdParty, attached };
}

/** @param {string} message */
function translateStatusMessage(message) {
  const text = String(message || '');
  const replacements = [
    ['No scan has been started for this tab.', 'Nie uruchomiono jeszcze skanowania tej karty.'],
    ['No status available.', 'Brak statusu.'],
    ['Scanning images and parsed scripts from the active tab.', 'Skanuję obrazki i skrypty aktywnej karty.'],
    ['Password input polling runs every 1000 ms.', 'Sprawdzam pola hasła co 1000 ms.'],
    ['Debugger attached. Enabling Network, Debugger, Runtime, and Page domains...', 'Debugger podłączony. Włączam Network, Debugger, Runtime i Page...'],
    ['No debugger is attached.', 'Debugger nie jest podłączony.'],
    ['Scan stopped. Collected results were kept.', 'Skanowanie zatrzymane. Wyniki zostały zachowane.'],
    ['Active tab is not the scanned tab.', 'Aktywna karta nie jest skanowaną kartą.'],
    ['Could not read location.href:', 'Nie udało się odczytać location.href:'],
    ['Could not attach debugger', 'Nie udało się podłączyć debuggera'],
    ['CDP command failed', 'Polecenie CDP nie powiodło się'],
    ['Debugger detached by Chrome', 'Chrome odłączył debugger'],
    ['DevTools may have been opened, another debugger attached, or the target changed.', 'Prawdopodobnie otwarto DevTools, podłączono inny debugger albo zmienił się cel skanowania.'],
    ['Password binding failed:', 'Nie udało się podłączyć obserwacji pól hasła:'],
    ['Checking image dimensions.', 'Sprawdzam wymiary zdjęć.']
  ];

  return replacements.reduce((current, pair) => current.replaceAll(pair[0], pair[1]), text);
}

/** @param {import('../../../types/scanning.js').ScanSnapshot|null} state @param {boolean} busy */
export function getStatusMessage(state, busy) {
  if (!state || state.status === 'idle') {
    return 'Nie sprawdzano jeszcze tej strony.';
  }

  if (busy || state.status === 'attaching') {
    return 'Przygotowuję bezpieczne sprawdzenie i przeładowanie strony...';
  }

  if (state.scanning || state.status === 'scanning') {
    return 'Sprawdzanie trwa. Wyniki poniżej aktualizują się automatycznie.';
  }

  if (state.status === 'error' || state.status === 'detached') {
    return translateStatusMessage(state.statusMessage || 'Sprawdzanie zostało przerwane.');
  }

  return 'Sprawdzanie zakończone. Zebrane dowody pozostają dostępne poniżej.';
}
