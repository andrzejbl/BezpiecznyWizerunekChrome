/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').NetworkMetadata} NetworkMetadata */
/** @typedef {import('../../../types/scanning.js').ScriptRecord} ScriptRecord */
/** @typedef {import('../../../types/cdp.js').ScriptParsed} ScriptParsed */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} ScriptRecorderPorts
 * @property {Clock} clock
 */

// Zbieraj obserwacje skryptów, korzystając z reguł klasyfikacji bez efektów ubocznych i przekazanego zegara.

import { parseUrl, getRegistrableDomain } from './urls.js';
import {
  getScriptType,
  getScriptFilename,
  classifyScript,
  makeDisplayName
} from './script-classification.js';

/**
 * @param {ScriptRecorderPorts} ports
 */
export function createScriptRecorder({ clock }) {
  // Zachowuj rozpoznane przez przeglądarkę skrypty i żądania skryptów zewnętrznych zablokowane lokalnie.

  /**
   * @param {ScanState} state
   * @param {string} requestId
   * @param {NetworkMetadata} metadata
   * @returns {NetworkMetadata}
   */
  function mergeScriptRequestMetadata(state, requestId, metadata) {
    if (!requestId) {
      return metadata;
    }

    const previous = state.scriptRequests.get(requestId) || {};
    const merged = {
      ...previous,
      ...metadata,
      requestId
    };

    state.scriptRequests.set(requestId, merged);
    return merged;
  }

  /**
   * @param {NetworkMetadata} metadata
   */
  function isScriptNetworkResource(metadata) {
    return metadata && metadata.resourceType === 'Script';
  }

  /**
   * @param {NetworkMetadata} params
   */
  function isBlockedByClientFailure(params) {
    return typeof params.errorText === 'string' && params.errorText.includes('ERR_BLOCKED_BY_CLIENT');
  }

  /**
   * @param {ScanState} state
   * @param {NetworkMetadata} metadata
   */
  function addBlockedThirdPartyScript(state, metadata) {
    if (!metadata || !metadata.url || !isScriptNetworkResource(metadata) || !isBlockedByClientFailure(metadata)) {
      return;
    }

    if (state.blockedScriptsByUrl.has(metadata.url)) {
      const existing = /** @type {ScriptRecord} */ (state.blockedScriptsByUrl.get(metadata.url));
      existing.lastSeen = clock.nowIso();
      existing.requestId = metadata.requestId || existing.requestId;
      existing.errorText = metadata.errorText || existing.errorText;
      existing.blockedReason = metadata.blockedReason || existing.blockedReason;
      return;
    }

    const parsed = parseUrl(metadata.url);
    const script = /** @type {ScriptRecord} */ ({
      scriptId: metadata.requestId ? `blocked:${metadata.requestId}` : `blocked:${metadata.url}`,
      url: metadata.url,
      sourceMapURL: '',
      executionContextId: null,
      startLine: null,
      endLine: null,
      isModule: false,
      hash: '',
      embedderName: '',
      type: 'blocked',
      origin: parsed.origin,
      hostname: parsed.hostname,
      protocol: parsed.protocol,
      pathname: parsed.pathname,
      filename: getScriptFilename(parsed, 'blocked', metadata.url),
      query: parsed.query,
      registrableDomain: getRegistrableDomain(parsed.hostname),
      blockedByClient: true,
      blockedReason: metadata.blockedReason || '',
      errorText: metadata.errorText || 'net::ERR_BLOCKED_BY_CLIENT',
      requestId: metadata.requestId || '',
      networkResourceType: metadata.resourceType || 'Script',
      timestamp: clock.nowIso(),
      lastSeen: clock.nowIso()
    });

    script.displayName = makeDisplayName(script);
    script.classification = classifyScript(script, state);

    if (script.classification !== 'third-party') {
      return;
    }

    state.blockedScriptsByUrl.set(script.url, script);
    state.scripts.push(script);
  }

  /**
   * @param {ScanState} state
   * @param {ScriptParsed} params
   * @returns {ScriptRecord}
   */
  function normalizeScript(state, params) {
    const url = params.url || '';
    const parsed = parseUrl(url);
    const type = getScriptType(params);
    const script = /** @type {ScriptRecord} */ ({
      scriptId: params.scriptId || '',
      url,
      sourceMapURL: params.sourceMapURL || '',
      executionContextId: typeof params.executionContextId === 'number' ? params.executionContextId : null,
      executionContextDestroyed: false,
      startLine: typeof params.startLine === 'number' ? params.startLine : null,
      endLine: typeof params.endLine === 'number' ? params.endLine : null,
      isModule: params.isModule === true,
      hash: params.hash || '',
      embedderName: params.embedderName || '',
      type,
      origin: parsed.origin,
      hostname: parsed.hostname,
      protocol: parsed.protocol,
      pathname: parsed.pathname,
      filename: getScriptFilename(parsed, type, url),
      query: parsed.query,
      registrableDomain: getRegistrableDomain(parsed.hostname),
      timestamp: clock.nowIso()
    });

    script.displayName = makeDisplayName(script);
    script.classification = classifyScript(script, state);

    return script;
  }

  /**
   * @param {ScanState} state
   * @param {ScriptParsed} params
   */
  function handleScriptParsed(state, params) {
    const script = normalizeScript(state, params);

    if (script.scriptId && state.scriptsById.has(script.scriptId)) {
      const existing = /** @type {ScriptRecord} */ (state.scriptsById.get(script.scriptId));
      Object.assign(existing, script);
      return;
    }

    state.scripts.push(script);

    if (script.scriptId) {
      state.scriptsById.set(script.scriptId, script);
    }
  }

  return { mergeScriptRequestMetadata, addBlockedThirdPartyScript, handleScriptParsed };
}
