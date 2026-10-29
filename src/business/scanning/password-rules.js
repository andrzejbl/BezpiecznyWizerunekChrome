/** @typedef {import('../../../types/scanning.js').PasswordAccess} PasswordAccess */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */

// Reguły widoczności bez efektów ubocznych, wspólne dla bieżącego wyniku skanu i raportu pól hasła.

/**
 * @param {{classification:string}} item
 */
export function shouldExposePasswordScript(item) {
  return item.classification !== 'inline/eval/blob'
    && item.classification !== 'browser/internal'
    && item.classification !== 'first-party-origin'
    && item.classification !== 'same-site';
}

/**
 * @param {PasswordAccess} access
 */
function shouldExposePasswordAccess(access) {
  return shouldExposePasswordScript(access);
}

/**
 * @param {ScanState} state
 */
export function getVisiblePasswordAccesses(state) {
  return state.passwordAccesses.filter(shouldExposePasswordAccess);
}

/**
 * @param {PasswordAccess} access
 */
export function isPasswordValueAccess(access) {
  return access
    && (access.kind === 'password.value.get' || access.kind === 'password.value.set');
}
