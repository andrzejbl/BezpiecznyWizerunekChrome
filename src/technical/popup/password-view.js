// Renderowanie listy i porównywanie sygnatur DOM.
import { clearElement, appendEmptyState } from './dom.js';

/** @param {import('../../../types/popup.js').CachedViewDependencies} dependencies */
export function createPasswordView({ elements, renderCache }) {
  /** @param {import('../../../types/scanning.js').PasswordAccessTree|null} tree */
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
        accessScope: group.accessScope,
        unknownCount: group.unknownCount,
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
          access.accessScope,
          access.blockedByClient,
          access.errorText
        ])
      }))
    });
  }

  /** @param {import('../../../types/scanning.js').PasswordAccessTree['groups'][number]} group */
  function appendPasswordGroup(group) {
    const item = document.createElement('div');
    item.className = `script-group password-group script-domain ${group.classification.replace(/[^a-z0-9-]/gi, '-')}`;

    const row = document.createElement('div');
    row.className = 'script-domain-row';

    const title = document.createElement('span');
    title.className = 'script-group-title';
    title.textContent = group.label;

    const unknownAccess = group.accessScope === 'unknown';
    const criticalBadge = document.createElement('span');
    criticalBadge.className = 'script-badge ' + (unknownAccess ? 'password-unknown' : 'password-critical');
    criticalBadge.textContent = unknownAccess ? 'Dostęp nieustalony' : 'KRYTYCZNE';
    criticalBadge.title = unknownAccess
      ? 'Nie ustalono, czy kontekst wykonania skryptu ma dostęp do dokumentu z polem hasła.'
      : (group.accessScope === 'accessible'
        ? 'Zaobserwowano dostęp do pola hasła lub ustalono kontekst wykonania, który ma dostęp do jego dokumentu.'
        : 'Obca domena ma albo mogłaby mieć dostęp do pola hasła. Dowód techniczny: skrypt z referencją do pola może odczytać jego wartość.');

    row.append(title, criticalBadge);
    item.appendChild(row);
    elements.passwordTree.appendChild(item);
  }

  /** @param {import('../../../types/scanning.js').ScanSnapshot|null} state */
  function renderPasswordAccess(state) {
    const tree = state && state.passwordAccessTree ? state.passwordAccessTree : null;
    const nextSignature = getPasswordSignature(tree);

    elements.passwordInputsValue.textContent = String(tree ? tree.passwordInputCount : 0);
    elements.passwordScriptsValue.textContent = String(tree ? tree.groups.length : 0);
    elements.passwordAccessesValue.textContent = String(tree ? (tree.totalValueAccesses || 0) : 0);

    if (nextSignature !== renderCache.passwordRenderSignature) {
      clearElement(elements.passwordTree);

      if (!tree || (tree.groups.length === 0 && !tree.hasPasswordInputs && !tree.hasEverPasswordInputs)) {
        appendEmptyState(elements.passwordTree, 'Nie wykryto jeszcze pola hasła na tej stronie.');
      } else if (tree.groups.length === 0) {
        appendEmptyState(elements.passwordTree, 'Wykryto pole hasła, ale nie znaleziono domen zewnętrznych przy tym polu.');
      } else {
        tree.groups.forEach(appendPasswordGroup);
      }

      renderCache.passwordRenderSignature = nextSignature;
    }
  }

  return { renderPasswordAccess };
}
