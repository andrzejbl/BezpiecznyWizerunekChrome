// Tekst dowodów przypisanych do zdjęcia, niezależny od sposobu ich wyświetlenia.
/** @param {import('../../../types/scanning.js').ImageFinding} image */
export function getImageIssueBadges(image) {
  const badges = [];
  /** @type {Partial<import('../../../types/scanning.js').CacheAudit>} */
  const cache = image.cache || {};
  /** @type {Partial<import('../../../types/scanning.js').IndexingAudit>} */
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
