/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ScriptRecord} ScriptRecord */

// Możliwość dostępu wynika z kontekstu wykonania, a nie z adresu pobranego pliku JS.
/**
 * @param {ScriptRecord} script
 * @param {ScanState} state
 * @returns {'accessible'|'isolated'|'unknown'}
 */
export function getPasswordAccessScope(script, state) {
  if (script.executionContextDestroyed) return 'isolated';
  const context = typeof script.executionContextId === 'number'
    ? state.contexts.get(script.executionContextId) : undefined;
  const fields = state.passwordInputInfo;
  if (!context || !context.frameId || !state.mainFrameId || fields.error ||
      fields.frameId !== state.mainFrameId || fields.documentRevision !== state.passwordDocumentRevision) {
    return 'unknown';
  }
  if (context.frameId === state.mainFrameId && context.isDefault === true) {
    return 'accessible';
  }
  return context.passwordAccess?.documentRevision === state.passwordDocumentRevision
    ? context.passwordAccess.scope : 'unknown';
}

/** @param {ScanState} state */
export function invalidatePasswordDocument(state) {
  state.passwordDocumentRevision += 1;
  state.passwordInputInfo = {
    hasPasswordInputs: false, hasEverPasswordInputs: false,
    count: 0, inputs: [], lastChecked: ''
  };
  for (const context of state.contexts.values()) {
    delete context.passwordAccess;
    delete context.imageAccess;
  }
}

/** @param {ScanState} state @param {number} contextId */
export function retirePasswordContext(state, contextId) {
  const context = state.contexts.get(contextId);
  state.contexts.delete(contextId);
  for (const script of state.scripts) {
    if (script.executionContextId === contextId) script.executionContextDestroyed = true;
  }
  if (context?.frameId === state.mainFrameId && context.isDefault) invalidatePasswordDocument(state);
}

/** @param {ScanState} state */
export function retireAllPasswordContexts(state) {
  for (const script of state.scripts) {
    if (typeof script.executionContextId === 'number') script.executionContextDestroyed = true;
  }
  // Nowa mapa unieważnia również operacje rozpoczęte przed zmianą dokumentu.
  state.contexts = new Map();
  state.passwordPollInFlight = false;
  invalidatePasswordDocument(state);
}
