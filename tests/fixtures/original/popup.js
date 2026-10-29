'use strict';

const MIN_IMAGE_LONG_SIDE = 200;

const elements = {
  statusText: document.getElementById('statusText'),
  resultCount: document.getElementById('resultCount'),
  counterLabel: document.getElementById('counterLabel'),
  scanControls: document.getElementById('scanControls'),
  scanStateTitle: document.getElementById('scanStateTitle'),
  scanStateDescription: document.getElementById('scanStateDescription'),
  startButton: document.getElementById('startButton'),
  stopButton: document.getElementById('stopButton'),
  imagesTab: document.getElementById('imagesTab'),
  scriptsTab: document.getElementById('scriptsTab'),
  passwordTab: document.getElementById('passwordTab'),
  imagesView: document.getElementById('imagesView'),
  scriptsView: document.getElementById('scriptsView'),
  passwordView: document.getElementById('passwordView'),
  resultsGrid: document.getElementById('resultsGrid'),
  copyImageLinksButton: document.getElementById('copyImageLinksButton'),
  exportImagesButton: document.getElementById('exportImagesButton'),
  exportPdfButton: document.getElementById('exportPdfButton'),
  exportReportZipButton: document.getElementById('exportReportZipButton'),
  copyThirdPartyButton: document.getElementById('copyThirdPartyButton'),
  exportScriptsJsonButton: document.getElementById('exportScriptsJsonButton'),
  exportScriptsCsvButton: document.getElementById('exportScriptsCsvButton'),
  pageUrlValue: document.getElementById('pageUrlValue'),
  pageOriginValue: document.getElementById('pageOriginValue'),
  totalScriptsValue: document.getElementById('totalScriptsValue'),
  thirdPartyScriptsValue: document.getElementById('thirdPartyScriptsValue'),
  thirdPartyDomainsValue: document.getElementById('thirdPartyDomainsValue'),
  scriptTree: document.getElementById('scriptTree'),
  passwordInputsValue: document.getElementById('passwordInputsValue'),
  passwordScriptsValue: document.getElementById('passwordScriptsValue'),
  passwordAccessesValue: document.getElementById('passwordAccessesValue'),
  passwordTree: document.getElementById('passwordTree'),
  riskLevelValue: document.getElementById('riskLevelValue'),
  securityWheel: document.getElementById('securityWheel'),
  securityWheelText: document.getElementById('securityWheelText'),
  securityWheelBadge: document.getElementById('securityWheelBadge'),
  riskSummaryText: document.getElementById('riskSummaryText'),
  riskMeaningText: document.getElementById('riskMeaningText'),
  nextStepsPanel: document.getElementById('nextStepsPanel'),
  nextStepTitle: document.getElementById('nextStepTitle'),
  nextStepText: document.getElementById('nextStepText'),
  totalIssuesValue: document.getElementById('totalIssuesValue'),
  summaryAuthorizationImages: document.getElementById('summaryAuthorizationImages'),
  summaryImageDetails: document.getElementById('summaryImageDetails'),
  summaryScriptDomains: document.getElementById('summaryScriptDomains'),
  summaryScriptDetails: document.getElementById('summaryScriptDetails'),
  summaryPasswordDomains: document.getElementById('summaryPasswordDomains'),
  summaryPasswordDetails: document.getElementById('summaryPasswordDetails'),
  metricCards: Array.from(document.querySelectorAll('.metric-card'))
};

let latestState = null;
let visibleImages = [];
let activeView = 'images';
let busy = false;
let pendingAction = '';
let imageRenderSignature = '';
let scriptRenderSignature = '';
let passwordRenderSignature = '';
let dimensionRenderQueued = false;

const dimensionCache = new Map();

function getImageDisplaySource(image) {
  return image && image.previewDataUrl ? image.previewDataUrl : (image && image.url ? image.url : '');
}

function getImageDimensionKey(image) {
  const comparison = image && image.bodyComparison ? image.bodyComparison : {};
  const previewSignature = image && image.previewDataUrl
    ? `preview:${comparison.originalBodySha256 || image.previewDataUrl.length}`
    : 'url';

  return `${image && image.url ? image.url : ''}\u0000${previewSignature}`;
}

function sendMessage(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response || response.ok !== true) {
        reject(new Error((response && response.error) || 'Nieznany błąd rozszerzenia.'));
        return;
      }

      resolve(response.state);
    });
  });
}

function setBusy(isBusy) {
  busy = isBusy;
  updateButtons();
}

function isScanActive(state) {
  return Boolean(state && state.attached === true && state.scanning === true);
}

function updateScanControls(hasReportData) {
  const scanActive = isScanActive(latestState);
  const status = latestState && latestState.status ? latestState.status : 'idle';
  let stateName = 'idle';
  let title = 'Skanowanie nieaktywne';
  let description = 'Kliknij „Sprawdź stronę”, aby rozpocząć.';

  if (pendingAction === 'startScanWithReload') {
    stateName = 'starting';
    title = 'Uruchamiam skanowanie';
    description = 'Podłączam analizę i przeładowuję stronę.';
  } else if (pendingAction === 'stopScan') {
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

  if (elements.scanControls) {
    elements.scanControls.dataset.state = stateName;
  }
  if (elements.scanStateTitle) {
    elements.scanStateTitle.textContent = title;
  }
  if (elements.scanStateDescription) {
    elements.scanStateDescription.textContent = description;
  }

  elements.startButton.classList.toggle('primary', !scanActive);
  elements.startButton.textContent = pendingAction === 'startScanWithReload'
    ? 'Uruchamiam...'
    : (scanActive || hasReportData ? 'Sprawdź ponownie' : 'Sprawdź stronę');

  if (elements.stopButton) {
    elements.stopButton.hidden = !scanActive && pendingAction !== 'stopScan';
    elements.stopButton.textContent = pendingAction === 'stopScan' ? 'Kończę...' : 'Zakończ skan';
  }
}

function updateButtons() {
  const hasVisibleImages = visibleImages.length > 0;
  const hasReportData = Boolean(latestState && (
    latestState.pageUrl ||
    latestState.scanStartedAt ||
    latestState.status === 'stopped' ||
    latestState.status === 'detached' ||
    latestState.status === 'error'
  ));
  const tree = latestState && latestState.scriptTree ? latestState.scriptTree : null;
  const hasScripts = tree && tree.totalScripts > 0;
  const hasThirdParty = tree && tree.thirdPartyScriptsCount > 0;
  const attached = latestState && latestState.attached;

  updateScanControls(hasReportData);
  elements.startButton.disabled = busy;

  if (elements.stopButton) {
    elements.stopButton.disabled = busy || !attached;
  }
  elements.copyImageLinksButton.disabled = busy || !hasVisibleImages;
  elements.exportImagesButton.disabled = busy || !hasVisibleImages;
  if (elements.exportPdfButton) {
    elements.exportPdfButton.disabled = busy || !hasReportData;
  }
  if (elements.exportReportZipButton) {
    elements.exportReportZipButton.disabled = busy || !hasReportData;
  }
  elements.copyThirdPartyButton.disabled = busy || !hasThirdParty;
  elements.exportScriptsJsonButton.disabled = busy || !hasScripts;
  elements.exportScriptsCsvButton.disabled = busy || !hasScripts;
}

function setActiveView(view) {
  activeView = view;

  const imagesActive = view === 'images';
  const scriptsActive = view === 'scripts';
  const passwordActive = view === 'password';

  elements.imagesTab.classList.toggle('active', imagesActive);
  elements.scriptsTab.classList.toggle('active', scriptsActive);
  elements.passwordTab.classList.toggle('active', passwordActive);
  elements.imagesTab.setAttribute('aria-pressed', String(imagesActive));
  elements.scriptsTab.setAttribute('aria-pressed', String(scriptsActive));
  elements.passwordTab.setAttribute('aria-pressed', String(passwordActive));
  elements.imagesView.classList.toggle('active', imagesActive);
  elements.scriptsView.classList.toggle('active', scriptsActive);
  elements.passwordView.classList.toggle('active', passwordActive);

  updateCounter();
  updateStatusMessage(latestState);
  updateButtons();
}

function updateCounter() {
  const summary = getSecuritySummary();
  if (elements.resultCount) {
    elements.resultCount.textContent = String(summary.totalIssues);
  }
  if (elements.counterLabel) {
    elements.counterLabel.textContent = 'typów problemów';
  }
}
function scheduleDimensionRender() {
  if (dimensionRenderQueued) {
    return;
  }

  dimensionRenderQueued = true;
  setTimeout(() => {
    dimensionRenderQueued = false;

    if (latestState) {
      imageRenderSignature = '';
      render(latestState);
    }
  }, 0);
}

function getDimensionRecord(image) {
  const key = getImageDimensionKey(image);
  const cached = dimensionCache.get(key);
  if (cached) {
    return cached;
  }

  const record = {
    state: 'pending',
    width: null,
    height: null,
    longSide: null,
    passes: false,
    probe: null
  };

  const source = getImageDisplaySource(image);
  if (!source) {
    record.state = 'failed';
    dimensionCache.set(key, record);
    return record;
  }

  const probe = new Image();
  record.probe = probe;
  probe.decoding = 'async';
  probe.referrerPolicy = 'no-referrer';

  probe.addEventListener('load', () => {
    record.width = probe.naturalWidth || 0;
    record.height = probe.naturalHeight || 0;
    record.longSide = Math.max(record.width, record.height);
    record.passes = record.longSide >= MIN_IMAGE_LONG_SIDE;
    record.state = 'loaded';
    record.probe = null;
    scheduleDimensionRender();
  }, { once: true });

  probe.addEventListener('error', () => {
    record.state = 'failed';
    record.passes = false;
    record.probe = null;
    scheduleDimensionRender();
  }, { once: true });

  probe.src = source;
  dimensionCache.set(key, record);

  return record;
}

function pruneDimensionCache(images) {
  const currentKeys = new Set(images.map(getImageDimensionKey));

  for (const key of dimensionCache.keys()) {
    if (!currentKeys.has(key)) {
      dimensionCache.delete(key);
    }
  }
}

function isExcludedImageFormat(image) {
  const mimeType = String(image.mimeType || '').toLowerCase();
  if (mimeType) {
    return mimeType !== 'image/jpeg' && mimeType !== 'image/jpg' && mimeType !== 'image/pjpeg';
  }

  try {
    const pathname = new URL(image.url).pathname.toLowerCase();
    return !/\.jpe?g$/i.test(pathname);
  } catch (error) {
    return !/\.jpe?g(?:[?#]|$)/i.test(String(image.url || ''));
  }
}
function hasImproperImageAuthorization(image) {
  const bodyComparison = image && image.bodyComparison ? image.bodyComparison : {};
  return image && (image.improperImageAuthorization === true || bodyComparison.improperAuthorization === true);
}

function getImproperAuthorizationImageCount(images) {
  return images.filter((image) => hasImproperImageAuthorization(image) && !isExcludedImageFormat(image)).length;
}
function getAllImageRows() {
  return latestState && Array.isArray(latestState.images) ? latestState.images : [];
}

function withKnownDimensions(image) {
  const dimensions = dimensionCache.get(getImageDimensionKey(image));
  if (!dimensions || dimensions.state !== 'loaded') {
    return { ...image };
  }

  return {
    ...image,
    width: dimensions.width,
    height: dimensions.height,
    longSide: dimensions.longSide
  };
}

function getAllImproperAuthorizationFindings() {
  return visibleImages.map((image) => ({ ...image }));
}

function getReportStats() {
  const scriptTree = latestState && latestState.scriptTree ? latestState.scriptTree : null;
  const passwordTree = latestState && latestState.passwordAccessTree ? latestState.passwordAccessTree : null;

  return {
    imageFindings: getAllImproperAuthorizationFindings(),
    scriptGroups: scriptTree && Array.isArray(scriptTree.thirdPartyGroups) ? scriptTree.thirdPartyGroups : [],
    passwordGroups: passwordTree && Array.isArray(passwordTree.groups) ? passwordTree.groups : [],
    scriptTree,
    passwordTree
  };
}

function getSecuritySummary() {
  const reportStats = getReportStats();
  const imageFindings = reportStats.imageFindings;
  const scriptTree = reportStats.scriptTree;
  const passwordTree = reportStats.passwordTree;

  const cacheIssues = imageFindings.filter((image) => {
    const cache = image.cache || {};
    return image.missingCacheNoStore === true || cache.missingNoStore === true;
  }).length;

  const googleIssues = imageFindings.filter((image) => {
    const indexing = image.indexing || {};
    return image.googleIndexingOpen === true || image.googleIndexingNotBlocked === true || indexing.googleIndexingOpen === true || indexing.googleNotBlocked === true;
  }).length;

  const corsPixelDomains = scriptTree ? (scriptTree.thirdPartyCorsPixelAccessDomainsCount || 0) : 0;
  const corsPixelImages = scriptTree && scriptTree.corsPixelAccess ? (scriptTree.corsPixelAccess.imageCount || 0) : 0;
  const thirdPartyDomains = scriptTree ? (scriptTree.thirdPartyDomainsCount || 0) : 0;
  const thirdPartyScripts = scriptTree ? (scriptTree.thirdPartyScriptsCount || 0) : 0;
  const passwordDomains = reportStats.passwordGroups.length;
  const passwordInputs = passwordTree ? (passwordTree.passwordInputCount || 0) : 0;
  const passwordEvents = passwordTree ? (passwordTree.totalAccesses || 0) : 0;
  const passwordValueEvents = passwordTree ? (passwordTree.totalValueAccesses || 0) : 0;
  const passwordValueDomains = passwordTree ? (passwordTree.valueAccessDomainsCount || 0) : 0;
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
  const hasAnyData = Boolean(latestState && (
    latestState.scanStartedAt ||
    (latestState.status && latestState.status !== 'idle') ||
    latestState.imageCount > 0 ||
    (scriptTree && scriptTree.totalScripts > 0) ||
    passwordInputs > 0 ||
    latestState.attached ||
    latestState.scanning
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
    corsPixelImages,
    thirdPartyDomains,
    thirdPartyScripts,
    passwordDomains,
    passwordInputs,
    passwordEvents,
    passwordValueEvents,
    passwordValueDomains
  };
}

function riskCopy(summary) {
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

  if (summary.thirdPartyDomains > 0) {
    return {
      level: 'Strona korzysta z domen zewnętrznych',
      text: summary.thirdPartyDomains + ' domen zewnętrznych działa lub mogłoby działać w kontekście tej strony.',
      meaning: 'Sama obecność domeny nie przesądza o naruszeniu, ale pokazuje, komu strona przekazuje część swojego kontekstu.',
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

function formatProblemTypeCount(count) {
  if (count === 1) {
    return '1 typ problemu';
  }
  if (count > 1 && count < 5) {
    return `${count} typy problemów`;
  }
  return `${count} typów problemów`;
}

function updateSecurityWheel(summary) {
  if (!elements.securityWheel || !elements.securityWheelText || !elements.securityWheelBadge) {
    return;
  }

  let state = 'empty';
  let text = '?';
  let badge = 'brak danych';
  let label = 'Ocena prywatności: brak danych';

  if (summary.hasAnyData && !summary.hasAnyProblem) {
    state = 'ok';
    text = 'OK';
    badge = '0 typów problemów';
    label = 'Ocena prywatności: zielona, dla przeanalizowanych zapytań sieciowych brak wykrytych problemów';
  } else if (summary.hasAnyProblem) {
    state = 'problem';
    text = '!';
    badge = formatProblemTypeCount(summary.problemTypes);
    label = `Ocena prywatności: czerwona, ${badge}`;
  }

  elements.securityWheel.dataset.state = state;
  elements.securityWheelText.textContent = text;
  elements.securityWheelBadge.textContent = badge;
  elements.securityWheel.setAttribute('aria-label', label);
}

function updateOverview() {
  const summary = getSecuritySummary();
  const copy = riskCopy(summary);

  updateSecurityWheel(summary);
  elements.totalIssuesValue.textContent = String(summary.problemTypes);
  elements.riskLevelValue.textContent = copy.level;
  elements.riskSummaryText.textContent = copy.text;

  if (elements.riskMeaningText) {
    elements.riskMeaningText.textContent = copy.meaning;
  }
  if (elements.nextStepsPanel && elements.nextStepTitle && elements.nextStepText) {
    elements.nextStepsPanel.hidden = !summary.hasAnyData;
    elements.nextStepTitle.textContent = copy.actionTitle;
    elements.nextStepText.textContent = copy.action;
  }

  elements.summaryAuthorizationImages.textContent = String(summary.improperAuthorizationImages);
  elements.summaryImageDetails.textContent = 'W pamięci: ' + summary.cacheIssues + ' · dostępne dla Google: ' + summary.googleIssues;
  elements.summaryScriptDomains.textContent = String(summary.thirdPartyDomains);
  elements.summaryScriptDetails.textContent = 'Z dostępem do zdjęć: ' + summary.corsPixelDomains + ' · skrypty: ' + summary.thirdPartyScripts;
  elements.summaryPasswordDomains.textContent = String(summary.passwordDomains);
  elements.summaryPasswordDetails.textContent = summary.passwordDomains > 0
    ? 'KRYTYCZNE · domeny: ' + summary.passwordDomains + ' · odczyt wartości: ' + summary.passwordValueEvents
    : 'Pola hasła: ' + summary.passwordInputs + ' · odczyt wartości: ' + summary.passwordValueEvents;

  document.body.dataset.risk = !summary.hasAnyData
    ? 'empty'
    : (summary.passwordDomains > 0
      ? 'critical'
      : (summary.improperAuthorizationImages > 0
        ? 'high'
        : (summary.corsPixelDomains > 0
          ? 'medium'
          : (summary.thirdPartyDomains > 0 ? 'low' : 'none'))));
}

function getFilteredImageRows(images) {
  let pendingCount = 0;
  const rows = [];

  images.forEach((image) => {
    if (isExcludedImageFormat(image) || !hasImproperImageAuthorization(image)) {
      return;
    }

    const dimensions = getDimensionRecord(image);

    if (dimensions.state === 'pending') {
      pendingCount += 1;
      return;
    }

    if (!dimensions.passes) {
      return;
    }

    rows.push({ image, dimensions });
  });

  return { rows, pendingCount };
}

function buildVisibleImages(rows) {
  return rows.map(({ image, dimensions }) => ({
    ...image,
    width: dimensions.width,
    height: dimensions.height,
    longSide: dimensions.longSide
  }));
}

function clearElement(element) {
  element.textContent = '';
}

function appendEmptyState(parent, message) {
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = message;
  parent.appendChild(empty);
}

function getImageIssueBadges(image) {
  const badges = [];
  const cache = image.cache || {};
  const indexing = image.indexing || {};

  if (image.missingCacheNoStore === true || cache.missingNoStore === true) {
    const cacheControl = image.cacheControl || cache.cacheControl || '';
    badges.push({
      key: 'cache',
      label: 'Zostaje w pamięci',
      title: cacheControl
        ? `Zdjęcie może zostać w pamięci przeglądarki, proxy albo CDN. Dowód: Cache-Control nie zawiera no-store. Aktualna wartość: ${cacheControl}`
        : 'Zdjęcie może zostać w pamięci przeglądarki, proxy albo CDN. Dowód: nagłówek Cache-Control nie zawiera no-store.'
    });
  }

  const bodyComparison = image.bodyComparison || {};
  const improperAuthorization = image.improperImageAuthorization === true || bodyComparison.improperAuthorization === true;

  if (improperAuthorization) {
    badges.push({
      key: 'authorization',
      label: 'Brak poprawnej autoryzacji',
      title: 'Serwer zwrócił identyczne zdjęcie bez aktywnej sesji i nie uzależnił dostępu od potwierdzenia tożsamości oraz uprawnienia osoby pobierającej. Klasyfikacja: CWE-863.'
    });
  }

  const googleNotBlocked = (
    image.googleIndexingNotBlocked === true ||
    image.googleIndexingOpen === true ||
    indexing.googleNotBlocked === true ||
    indexing.googleIndexingOpen === true
  );

  if (googleNotBlocked) {
    const reasons = [];
    if (!indexing.xRobotsTag) {
      reasons.push('brak blokującego X-Robots-Tag');
    } else if (indexing.headerBlocksGoogle !== true) {
      reasons.push('X-Robots-Tag nie blokuje Google');
    }

    if (indexing.robotsTxtStatus === 'allowed') {
      reasons.push('robots.txt pozwala Google pobrać zdjęcie');
    } else if (indexing.robotsTxtStatus === 'not-found') {
      reasons.push('brak skutecznej blokady robots.txt');
    }

    badges.push({
      key: 'google',
      label: 'Może trafić do Google',
      title: reasons.length > 0
        ? `To zdjęcie może trafić do Google. Dowód: ${reasons.join('; ')}.`
        : 'To zdjęcie może trafić do Google, bo nie wykryto skutecznej blokady pobierania lub indeksowania.'
    });
  }

  return badges;
}

function appendImageIssueBar(link, image) {
  const badges = getImageIssueBadges(image);
  if (badges.length === 0) {
    return;
  }

  const issueBar = document.createElement('div');
  issueBar.className = 'image-issues';
  issueBar.setAttribute('aria-label', 'Sygnały ryzyka dla zdjęcia');

  badges.forEach((badge) => {
    const item = document.createElement('span');
    item.className = `image-issue image-issue-${badge.key}`;
    item.title = badge.title;
    item.setAttribute('aria-label', `${badge.label}: ${badge.title}`);

    const icon = document.createElement('span');
    icon.className = 'image-issue-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u{1F44E}';

    const label = document.createElement('span');
    label.textContent = badge.label;

    item.append(icon, label);
    issueBar.appendChild(item);
  });

  link.appendChild(issueBar);
}

function appendImageTile(rowData) {
  const { image } = rowData;

  const link = document.createElement('a');
  link.className = 'image-tile';
  link.href = image.url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.setAttribute('aria-label', 'Otwórz zdjęcie będące dowodem ryzyka');

  const imageElement = document.createElement('img');
  imageElement.src = getImageDisplaySource(image);
  imageElement.alt = '';
  imageElement.loading = 'lazy';
  imageElement.decoding = 'async';
  imageElement.referrerPolicy = 'no-referrer';

  imageElement.addEventListener('error', () => {
    link.remove();
  }, { once: true });

  link.appendChild(imageElement);
  appendImageIssueBar(link, image);
  elements.resultsGrid.appendChild(link);
}
function getImageRenderSignature(images, rows, pendingCount) {
  const imageSignature = images
    .map((image) => {
      const dimensions = dimensionCache.get(getImageDimensionKey(image));
      const dimensionSignature = dimensions
        ? [dimensions.state, dimensions.width, dimensions.height, dimensions.passes].join('\u0000')
        : 'unknown';

      const cache = image.cache || {};
      const indexing = image.indexing || {};
      const bodyComparison = image.bodyComparison || {};
      const matchedRule = indexing.robotsTxtMatchedRule || {};

      return [
        image.url,
        image.previewDataUrl ? image.previewDataUrl.length : 0,
        image.status,
        image.mimeType,
        image.encodedDataLength,
        image.cacheControl || cache.cacheControl || '',
        image.missingCacheNoStore === true || cache.missingNoStore === true,
        image.improperImageAuthorization === true || bodyComparison.improperAuthorization === true,
        bodyComparison.status || '',
        bodyComparison.exactMatch === true,
        bodyComparison.originalBodySha256 || '',
        bodyComparison.noCredentialsBodySha256 || '',
        image.googleIndexingNotBlocked === true || image.googleIndexingOpen === true || indexing.googleNotBlocked === true || indexing.googleIndexingOpen === true,
        image.googleIndexingBlocked === true || indexing.googleBlocked === true,
        indexing.headerBlocksGoogle === true,
        indexing.robotsTxtBlocksGoogle === true,
        indexing.robotsTxtStatus || '',
        indexing.xRobotsTag || '',
        matchedRule.directive || '',
        matchedRule.path || '',
        dimensionSignature
      ].join('\u0000');
    })
    .join('\u0001');

  return `${imageSignature}\u0002${rows.length}\u0002${pendingCount}`;
}

function renderImages(state) {
  const images = state && Array.isArray(state.images) ? state.images : [];
  pruneDimensionCache(images);

  const { rows, pendingCount } = getFilteredImageRows(images);
  visibleImages = buildVisibleImages(rows);

  const nextSignature = getImageRenderSignature(images, rows, pendingCount);
  if (nextSignature !== imageRenderSignature) {
    clearElement(elements.resultsGrid);

    if (images.length === 0) {
      appendEmptyState(elements.resultsGrid, 'Nie zebrano jeszcze zdjęć.');
    } else if (rows.length === 0 && pendingCount > 0) {
      appendEmptyState(elements.resultsGrid, `Sprawdzam wymiary. Pokazuję tylko zdjęcia JPEG/JPG z dłuższym bokiem co najmniej ${MIN_IMAGE_LONG_SIDE}px.`);
    } else if (rows.length === 0) {
      appendEmptyState(elements.resultsGrid, `Nie znaleziono zdjęć JPEG/JPG z dłuższym bokiem co najmniej ${MIN_IMAGE_LONG_SIDE}px.`);
    } else {
      rows.forEach(appendImageTile);
    }

    imageRenderSignature = nextSignature;
  }
}

function classificationLabel(classification) {
  if (classification === 'third-party') {
    return 'domena zewnętrzna';
  }
  if (classification === 'first-party-origin') {
    return 'własny';
  }
  if (classification === 'same-site') {
    return 'ta sama domena';
  }
  if (classification === 'inline/eval/blob') {
    return 'inline/eval/blob';
  }
  if (classification === 'browser/internal') {
    return 'wewnętrzny';
  }

  return classification || 'nieznany';
}

function appendScriptRow(list, script) {
  const item = document.createElement('li');
  item.className = script.blockedByClient ? 'script-file blocked-script' : 'script-file';

  const name = document.createElement('div');
  name.className = 'script-file-name';
  name.textContent = script.displayName || script.filename || '(anonimowy skrypt)';

  const meta = document.createElement('div');
  meta.className = 'script-file-meta';
  meta.textContent = script.blockedByClient
    ? `zablokowany lokalnie - ${script.errorText || 'ERR_BLOCKED_BY_CLIENT'}`
    : (script.type || 'nieznany');

  item.append(name, meta);

  if (script.url) {
    const url = document.createElement('div');
    url.className = 'script-file-url';
    url.textContent = script.url;
    item.appendChild(url);
  }

  if (script.sourceMapURL) {
    const sourceMap = document.createElement('div');
    sourceMap.className = 'script-file-url';
    sourceMap.textContent = `source map: ${script.sourceMapURL}`;
    item.appendChild(sourceMap);
  }

  list.appendChild(item);
}

function appendScriptGroup(group) {
  const item = document.createElement('div');
  item.className = `script-group script-domain ${group.classification.replace(/[^a-z0-9-]/gi, '-')}`;

  const row = document.createElement('div');
  row.className = 'script-domain-row';

  const title = document.createElement('span');
  title.className = 'script-group-title';
  title.textContent = group.label;

  const badge = document.createElement('span');
  badge.className = 'script-badge';
  const blockedSuffix = group.blockedCount ? ` · zablokowane lokalnie: ${group.blockedCount}` : '';
  badge.textContent = `skrypty: ${group.count}${blockedSuffix}`;
  badge.title = 'Obca domena działa albo mogłaby działać w kontekście tej strony.';

  row.append(title, badge);

  if (group.corsPixelAccess && group.corsPixelAccess.possible) {
    const corsBadge = document.createElement('span');
    corsBadge.className = 'script-badge cors-pixel-access';
    const imageCount = group.corsPixelAccess.imageCount || group.corsPixelAccessImageCount || 0;
    const modes = Array.isArray(group.corsPixelAccess.modes) ? group.corsPixelAccess.modes.join(', ') : '';
    const domains = Array.isArray(group.corsPixelAccess.imageDomains) ? group.corsPixelAccess.imageDomains.join(', ') : '';
    corsBadge.textContent = `może odczytać zdjęcia: ${imageCount}`;
    corsBadge.title = `Obca domena działa albo działałaby bez blokady w kontekście strony. Dowód: JavaScript strony może odczytać ${imageCount} zdjęcie/zdjęcia bez poprawnej autoryzacji użytkownika${modes ? ` przez ${modes}` : ''}${domains ? `; domeny zdjęć: ${domains}` : ''}.`;
    row.appendChild(corsBadge);
  }

  item.appendChild(row);
  elements.scriptTree.appendChild(item);
}

function getScriptSignature(tree) {
  if (!tree) {
    return '';
  }

  return JSON.stringify({
    pageUrl: tree.pageUrl,
    pageOrigin: tree.pageOrigin,
    totalScripts: tree.totalScripts,
    thirdPartyScriptsCount: tree.thirdPartyScriptsCount,
    thirdPartyDomainsCount: tree.thirdPartyDomainsCount,
    thirdPartyCorsPixelAccessDomainsCount: tree.thirdPartyCorsPixelAccessDomainsCount,
    corsPixelAccessImageCount: tree.corsPixelAccess ? tree.corsPixelAccess.imageCount : 0,
    groups: tree.groups.map((group) => ({
      key: group.key,
      label: group.label,
      count: group.count,
      blockedCount: group.blockedCount,
      corsPixelAccessImageCount: group.corsPixelAccessImageCount || 0,
      corsPixelAccessPossible: group.corsPixelAccess && group.corsPixelAccess.possible === true
    }))
  });
}

function renderScripts(state) {
  const tree = state && state.scriptTree ? state.scriptTree : null;
  const nextSignature = getScriptSignature(tree);

  elements.pageUrlValue.textContent = tree && tree.pageUrl ? tree.pageUrl : '-';
  elements.pageOriginValue.textContent = tree && tree.pageOrigin ? tree.pageOrigin : '-';
  elements.totalScriptsValue.textContent = String(tree ? tree.totalScripts : 0);
  elements.thirdPartyScriptsValue.textContent = String(tree ? tree.thirdPartyScriptsCount : 0);
  elements.thirdPartyDomainsValue.textContent = String(tree ? tree.thirdPartyDomainsCount : 0);

  if (nextSignature !== scriptRenderSignature) {
    clearElement(elements.scriptTree);

    if (!tree || tree.groups.length === 0) {
      appendEmptyState(elements.scriptTree, 'Nie zebrano jeszcze skryptów.');
    } else {
      tree.groups.forEach(appendScriptGroup);
    }

    scriptRenderSignature = nextSignature;
  }
}

function getPasswordSignature(tree) {
  if (!tree) {
    return '';
  }

  return JSON.stringify({
    hasPasswordInputs: tree.hasPasswordInputs,
    hasEverPasswordInputs: tree.hasEverPasswordInputs,
    passwordInputCount: tree.passwordInputCount,
    totalAccesses: tree.totalAccesses,
    totalValueAccesses: tree.totalValueAccesses,
    valueAccessDomainsCount: tree.valueAccessDomainsCount,
    domSignalDomainsCount: tree.domSignalDomainsCount,
    uniqueScripts: tree.uniqueScripts,
    potentialScripts: tree.potentialScripts,
    groups: tree.groups.map((group) => ({
      key: group.key,
      eventCount: group.eventCount,
      valueAccessCount: group.valueAccessCount,
      domSignalCount: group.domSignalCount,
      potentialCount: group.potentialCount,
      blockedCount: group.blockedCount,
      accesses: group.accesses.map((access) => [
        access.id,
        access.kind,
        access.scriptUrl,
        access.scriptFilename,
        access.lineNumber,
        access.columnNumber,
        access.count,
        access.observed,
        access.blockedByClient,
        access.errorText
      ])
    }))
  });
}

function appendPasswordAccessRow(list, access) {
  const item = document.createElement('li');
  item.className = access.blockedByClient === true ? 'script-file blocked-script' : (access.observed === false ? 'script-file potential-access' : 'script-file');

  const name = document.createElement('div');
  name.className = 'script-file-name';
  name.textContent = access.scriptFilename || access.scriptUrl || '(nieznany skrypt)';

  const meta = document.createElement('div');
  meta.className = 'script-file-meta';
  const location = access.lineNumber ? ` @ ${access.lineNumber}:${access.columnNumber || 0}` : '';
  if (access.blockedByClient === true) {
    meta.textContent = `zablokowany lokalnie - ${access.errorText || 'ERR_BLOCKED_BY_CLIENT'}; bez blokady: krytyczna możliwość przy polu hasła`;
  } else if (access.observed === false) {
    meta.textContent = 'krytyczna możliwość odczytu wartości hasła';
  } else {
    const valueLabel = access.kind === 'password.value.get'
      ? 'potwierdzony odczyt wartości hasła'
      : (access.kind === 'password.value.set' ? 'potwierdzony zapis wartości hasła' : 'zdarzenie przy polu hasła');
    meta.textContent = `${valueLabel}${location} - zdarzenia: ${access.count}`;
  }

  item.append(name, meta);

  if (access.scriptUrl) {
    const url = document.createElement('div');
    url.className = 'script-file-url';
    url.textContent = access.scriptUrl;
    item.appendChild(url);
  }

  const targetParts = [];
  if (access.target && access.target.id) {
    targetParts.push(`#${access.target.id}`);
  }
  if (access.target && access.target.name) {
    targetParts.push(`nazwa=${access.target.name}`);
  }
  if (access.detail) {
    targetParts.push(access.detail);
  }

  if (targetParts.length > 0) {
    const target = document.createElement('div');
    target.className = 'script-file-url muted';
    target.textContent = `cel: ${targetParts.join(' | ')}`;
    item.appendChild(target);
  }

  list.appendChild(item);
}

function appendPasswordGroup(group) {
  const item = document.createElement('div');
  item.className = `script-group password-group script-domain ${group.classification.replace(/[^a-z0-9-]/gi, '-')}`;

  const row = document.createElement('div');
  row.className = 'script-domain-row';

  const title = document.createElement('span');
  title.className = 'script-group-title';
  title.textContent = group.label;

  const criticalBadge = document.createElement('span');
  criticalBadge.className = 'script-badge password-critical';
  criticalBadge.textContent = 'KRYTYCZNE';
  criticalBadge.title = 'Obca domena ma albo mogłaby mieć dostęp do pola hasła. Dowód techniczny: skrypt z referencją do pola może odczytać jego wartość.';

  row.append(title, criticalBadge);
  item.appendChild(row);
  elements.passwordTree.appendChild(item);
}

function renderPasswordAccess(state) {
  const tree = state && state.passwordAccessTree ? state.passwordAccessTree : null;
  const nextSignature = getPasswordSignature(tree);

  elements.passwordInputsValue.textContent = String(tree ? tree.passwordInputCount : 0);
  elements.passwordScriptsValue.textContent = String(tree ? tree.groups.length : 0);
  elements.passwordAccessesValue.textContent = String(tree ? (tree.totalValueAccesses || 0) : 0);

  if (nextSignature !== passwordRenderSignature) {
    clearElement(elements.passwordTree);

    if (!tree || (!tree.hasPasswordInputs && !tree.hasEverPasswordInputs)) {
      appendEmptyState(elements.passwordTree, 'Nie wykryto jeszcze pola hasła na tej stronie.');
    } else if (tree.groups.length === 0) {
      appendEmptyState(elements.passwordTree, 'Wykryto pole hasła, ale nie znaleziono domen zewnętrznych przy tym polu.');
    } else {
      tree.groups.forEach(appendPasswordGroup);
    }

    passwordRenderSignature = nextSignature;
  }
}
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

function updateStatusMessage(state) {
  if (!elements.statusText) {
    return;
  }

  if (!state || state.status === 'idle') {
    elements.statusText.textContent = 'Nie sprawdzano jeszcze tej strony.';
    return;
  }

  if (busy || state.status === 'attaching') {
    elements.statusText.textContent = 'Przygotowuję bezpieczne sprawdzenie i przeładowanie strony...';
    return;
  }

  if (state.scanning || state.status === 'scanning') {
    elements.statusText.textContent = 'Sprawdzanie trwa. Wyniki poniżej aktualizują się automatycznie.';
    return;
  }

  if (state.status === 'error' || state.status === 'detached') {
    elements.statusText.textContent = translateStatusMessage(state.statusMessage || 'Sprawdzanie zostało przerwane.');
    return;
  }

  elements.statusText.textContent = 'Sprawdzanie zakończone. Zebrane dowody pozostają dostępne poniżej.';
}

function render(state) {
  latestState = state;
  renderImages(state);
  renderScripts(state);
  renderPasswordAccess(state);
  updateOverview();
  updateCounter();
  updateStatusMessage(state);
  updateButtons();
}

async function refreshState() {
  try {
    const state = await sendMessage('getState');
    render(state);
  } catch (error) {
    elements.statusText.textContent = error.message;
    latestState = null;
    visibleImages = [];
    updateOverview();
    updateCounter();
    updateButtons();
  }
}

async function runAction(type) {
  pendingAction = type;
  setBusy(true);
  try {
    const state = await sendMessage(type);
    imageRenderSignature = '';
    scriptRenderSignature = '';
    passwordRenderSignature = '';
    render(state);
  } catch (error) {
    elements.statusText.textContent = error.message;
  } finally {
    pendingAction = '';
    setBusy(false);
  }
}

function startOrRestartScan() {
  if (isScanActive(latestState)) {
    const shouldRestart = window.confirm('Skanowanie nadal trwa. Rozpocząć je od nowa? Dotychczas zebrane wyniki zostaną usunięte.');
    if (!shouldRestart) {
      elements.statusText.textContent = 'Skanowanie nadal trwa. Zachowano dotychczasowe wyniki.';
      return;
    }
  }

  runAction('startScanWithReload');
}

function downloadText(filename, type, text) {
  const blob = new Blob([text], { type });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function downloadBlob(filename, blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

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

function getReportPageDomain() {
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

function getFilenameTimestamp(date = new Date()) {
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

function getPdfReportFilename(date = new Date()) {
  return 'raport-rodo-' + getReportPageDomain() + '-' + getFilenameTimestamp(date) + '.pdf';
}
async function copyImageLinks() {
  if (visibleImages.length === 0) {
    return;
  }

  const urls = visibleImages.map((image) => image.url).join('\n');
  await navigator.clipboard.writeText(urls);
  elements.statusText.textContent = `Skopiowano linki do zdjęć bez poprawnej autoryzacji: ${visibleImages.length}.`;
}

function exportImagesJson() {
  if (visibleImages.length === 0) {
    return;
  }

  const exportRows = visibleImages.map(({ previewDataUrl, ...metadata }) => metadata);
  downloadText('image-network-urls.json', 'application/json', JSON.stringify(exportRows, null, 2));
  elements.statusText.textContent = `Wyeksportowano rekordy zdjęć bez poprawnej autoryzacji: ${visibleImages.length}.`;
}

function getThirdPartyListText() {
  const tree = latestState && latestState.scriptTree ? latestState.scriptTree : null;
  if (!tree || tree.thirdPartyGroups.length === 0) {
    return '';
  }

  return tree.thirdPartyGroups
    .map((group) => {
      const blockedSuffix = group.blockedCount ? `, zablokowane: ${group.blockedCount}` : '';
      return `${group.hostname} (${group.count}${blockedSuffix})`;
    })
    .join('\n');
}

async function copyThirdPartyList() {
  const text = getThirdPartyListText();
  if (!text) {
    return;
  }

  await navigator.clipboard.writeText(text);
  elements.statusText.textContent = 'Skopiowano unikalne domeny zewnętrzne.';
}

function exportScriptsJson() {
  const tree = latestState && latestState.scriptTree ? latestState.scriptTree : null;
  const scripts = latestState && Array.isArray(latestState.scripts) ? latestState.scripts : [];
  if (!tree || scripts.length === 0) {
    return;
  }

  downloadText('script-sources-tree.json', 'application/json', JSON.stringify({ tree, scripts }, null, 2));
  elements.statusText.textContent = `Wyeksportowano rekordy skryptów: ${scripts.length}.`;
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function exportScriptsCsv() {
  const scripts = latestState && Array.isArray(latestState.scripts) ? latestState.scripts : [];
  if (scripts.length === 0) {
    return;
  }

  const headers = [
    'classification',
    'hostname',
    'registrableDomain',
    'type',
    'filename',
    'url',
    'sourceMapURL',
    'origin',
    'protocol',
    'pathname',
    'query',
    'scriptId',
    'executionContextId',
    'startLine',
    'endLine',
    'isModule',
    'hash',
    'embedderName',
    'blockedByClient',
    'errorText',
    'blockedReason',
    'requestId',
    'networkResourceType'
  ];

  const rows = scripts.map((script) => headers.map((header) => csvEscape(script[header])).join(','));
  downloadText('script-sources-tree.csv', 'text/csv', `${headers.join(',')}\n${rows.join('\n')}`);
  elements.statusText.textContent = `Wyeksportowano wiersze skryptów CSV: ${scripts.length}.`;
}

elements.startButton.addEventListener('click', startOrRestartScan);
if (elements.stopButton) {
  elements.stopButton.addEventListener('click', () => runAction('stopScan'));
}
elements.imagesTab.addEventListener('click', () => setActiveView('images'));
elements.scriptsTab.addEventListener('click', () => setActiveView('scripts'));
elements.passwordTab.addEventListener('click', () => setActiveView('password'));
elements.copyImageLinksButton.addEventListener('click', () => {
  copyImageLinks().catch((error) => {
    elements.statusText.textContent = error.message;
  });
});
elements.exportImagesButton.addEventListener('click', exportImagesJson);
if (elements.exportPdfButton) {
  elements.exportPdfButton.addEventListener('click', () => {
    exportImagesPdf().catch((error) => {
      elements.statusText.textContent = 'Nie udało się utworzyć raportu: ' + error.message;
      setBusy(false);
    });
  });
}
if (elements.exportReportZipButton) {
  elements.exportReportZipButton.addEventListener('click', () => {
    exportReportZip().catch((error) => {
      elements.statusText.textContent = 'Nie udało się utworzyć kompletu ZIP: ' + error.message;
      setBusy(false);
    });
  });
}
elements.copyThirdPartyButton.addEventListener('click', () => {
  copyThirdPartyList().catch((error) => {
    elements.statusText.textContent = error.message;
  });
});
elements.exportScriptsJsonButton.addEventListener('click', exportScriptsJson);
elements.exportScriptsCsvButton.addEventListener('click', exportScriptsCsv);
elements.metricCards.forEach((card) => {
  card.addEventListener('click', () => setActiveView(card.dataset.view));
});

refreshState();
setInterval(refreshState, 1000);


















