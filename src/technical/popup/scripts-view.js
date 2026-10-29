// Renderowanie listy i porównywanie sygnatur DOM.
import { clearElement, appendEmptyState } from './dom.js';

/** @param {import('../../../types/popup.js').CachedViewDependencies} dependencies */
export function createScriptsView({ elements, renderCache }) {
  /** @param {import('../../../types/scanning.js').ScriptTree['groups'][number]} group */
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
    badge.title = 'Skrypty z tej domeny wykryto na stronie lub w jej ramkach; część mogła zostać zablokowana lokalnie.';

    row.append(title, badge);

    if (group.corsPixelAccess && group.corsPixelAccess.possible) {
      const corsBadge = document.createElement('span');
      corsBadge.className = 'script-badge cors-pixel-access';
      const imageCount = group.corsPixelAccess.imageCount || group.corsPixelAccessImageCount || 0;
      const modes = Array.isArray(group.corsPixelAccess.modes) ? group.corsPixelAccess.modes.join(', ') : '';
      const domains = Array.isArray(group.corsPixelAccess.imageDomains) ? group.corsPixelAccess.imageDomains.join(', ') : '';
      const origins = Array.isArray(group.corsPixelAccess.executionOrigins) ? group.corsPixelAccess.executionOrigins.join(', ') : '';
      corsBadge.textContent = `może odczytać zdjęcia: ${imageCount}`;
      corsBadge.title = `Ocena originów kontekstów wykonania i nagłówków odpowiedzi wskazuje możliwość odczytu ${imageCount} zdjęcia/zdjęć przez co najmniej jeden skrypt z tej domeny${modes ? ` przez ${modes}` : ''}${origins ? `; originy wykonania: ${origins}` : ''}${domains ? `; domeny zdjęć: ${domains}` : ''}. To możliwość techniczna, nie obserwacja odczytu.`;
      row.appendChild(corsBadge);
    }

    if (group.corsPixelAccess && (group.corsPixelAccess.unknownScriptCount || 0) > 0) {
      const unknownBadge = document.createElement('span');
      unknownBadge.className = 'script-badge cors-pixel-unknown';
      unknownBadge.textContent = `Dostęp do zdjęć nieustalony: ${group.corsPixelAccess.unknownScriptCount}`;
      unknownBadge.title = 'Nie ustalono pełnego zakresu dostępu dla tej liczby skryptów. Brakuje danych o kontekście, originie lub dostępie do dokumentu głównego; obejmuje to skrypty zablokowane lokalnie. Uprawnienia strony głównej wymagają potwierdzenia. Niezależnie ustalony dostęp może być pokazany osobno.';
      row.appendChild(unknownBadge);
    }

    item.appendChild(row);
    elements.scriptTree.appendChild(item);
  }

  /** @param {import('../../../types/scanning.js').ScriptTree|null} tree */
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
      thirdPartyCorsPixelAccessUnknownDomainsCount: tree.thirdPartyCorsPixelAccessUnknownDomainsCount,
      corsPixelAccessImageCount: tree.corsPixelAccess ? tree.corsPixelAccess.imageCount : 0,
      groups: tree.groups.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.count,
        blockedCount: group.blockedCount,
        corsPixelAccessImageCount: group.corsPixelAccessImageCount || 0,
        corsPixelAccessPossible: group.corsPixelAccess && group.corsPixelAccess.possible === true,
        corsPixelAccess: group.corsPixelAccess
      }))
    });
  }

  /** @param {import('../../../types/scanning.js').ScanSnapshot|null} state */
  function renderScripts(state) {
    const tree = state && state.scriptTree ? state.scriptTree : null;
    const nextSignature = getScriptSignature(tree);

    elements.pageUrlValue.textContent = tree && tree.pageUrl ? tree.pageUrl : '-';
    elements.pageOriginValue.textContent = tree && tree.pageOrigin ? tree.pageOrigin : '-';
    elements.totalScriptsValue.textContent = String(tree ? tree.totalScripts : 0);
    elements.thirdPartyScriptsValue.textContent = String(tree ? tree.thirdPartyScriptsCount : 0);
    elements.thirdPartyDomainsValue.textContent = String(tree ? tree.thirdPartyDomainsCount : 0);

    if (nextSignature !== renderCache.scriptRenderSignature) {
      clearElement(elements.scriptTree);

      if (!tree || tree.groups.length === 0) {
        appendEmptyState(elements.scriptTree, 'Nie zebrano jeszcze skryptów.');
      } else {
        tree.groups.forEach(appendScriptGroup);
      }

      renderCache.scriptRenderSignature = nextSignature;
    }
  }

  return { renderScripts };
}
