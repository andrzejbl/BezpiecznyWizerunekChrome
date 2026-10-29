/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ScriptRecord} ScriptRecord */
/** @typedef {import('../../../types/scanning.js').ExecutionContext} ExecutionContext */
/** @typedef {import('../../../types/scanning.js').CorsPixelSummary} CorsPixelSummary */

import { getCorsPixelAccessInfo, summarizeCorsPixelReadableImages } from './image-cors.js';

// Origin pochodzi z kontekstu wykonania. Adres pliku JS nie nadaje skryptowi uprawnień.
/** @param {string} origin */
export function normalizeImageExecutionOrigin(origin) {
  if (origin === 'null') return 'null';
  try {
    const url = new URL(origin);
    return /^(https?:)$/.test(url.protocol) ? url.origin : '';
  } catch (error) {
    return '';
  }
}

/** @param {ExecutionContext} context @param {ScanState} state */
export function getMainWorldImageOrigin(context, state) {
  if (!state.mainFrameId || context.frameId !== state.mainFrameId || context.isDefault !== true) return '';
  return normalizeImageExecutionOrigin(context.origin);
}

/**
 * @param {ScriptRecord} script
 * @param {ScanState} state
 * @returns {{origins:string[], unknown:boolean, inactive:boolean}}
 */
function getImageExecutionScope(script, state) {
  if (script.executionContextDestroyed) return { origins: [], unknown: false, inactive: true };
  const context = typeof script.executionContextId === 'number' ? state.contexts.get(script.executionContextId) : undefined;
  if (script.blockedByClient || !context?.frameId || !state.mainFrameId) {
    return { origins: [], unknown: true, inactive: false };
  }
  const mainOrigin = getMainWorldImageOrigin(context, state);
  if (mainOrigin) return { origins: [mainOrigin], unknown: false, inactive: false };

  const access = context.imageAccess;
  if (!access || access.documentRevision !== state.passwordDocumentRevision) {
    return { origins: [], unknown: true, inactive: false };
  }
  const origin = normalizeImageExecutionOrigin(access.origin);
  const origins = origin ? [origin] : [];
  let unknown = !origin || access.topAccessible === null;
  if (access.topAccessible === true) {
    const top = Array.from(state.contexts.values()).find((candidate) => getMainWorldImageOrigin(candidate, state));
    const topOrigin = top && getMainWorldImageOrigin(top, state);
    if (topOrigin && !origins.includes(topOrigin)) origins.push(topOrigin);
    if (!topOrigin) unknown = true;
  }
  return { origins, unknown, inactive: false };
}

/**
 * Suma zdjęć dostępnych dla co najmniej jednego skryptu danej domeny.
 * Sam brak dostępu do dokumentu głównego nie blokuje CORS dla originu ramki.
 * @param {ScriptRecord[]} scripts
 * @param {ScanState} state
 * @returns {CorsPixelSummary}
 */
export function summarizeScriptImageAccess(scripts, state) {
  const candidates = state.images.filter((image) => image.bodyComparison?.improperAuthorization === true);
  /** @type {Map<string, {image:import('../../../types/scanning.js').ImageRecord,cors:import('../../../types/scanning.js').CorsPixelAccess}>} */
  const readable = new Map();
  const executionOrigins = new Set();
  let unknownScriptCount = 0;
  let assessedScriptCount = 0;
  for (const script of scripts) {
    const scope = getImageExecutionScope(script, state);
    if (scope.inactive) continue;
    if (scope.unknown && candidates.length) unknownScriptCount += 1;
    if (!scope.unknown) assessedScriptCount += 1;
    for (const origin of scope.origins) executionOrigins.add(origin);
  }
  // Wiele plików JS zwykle działa w tym samym originie; nagłówki oceń raz na origin.
  for (const origin of executionOrigins) {
    for (const image of candidates) {
      const cors = getCorsPixelAccessInfo(image, { pageOrigin: origin });
      if (!cors.possible) continue;
      const existing = readable.get(image.url);
      if (existing) {
        existing.cors.modes = Array.from(new Set([...existing.cors.modes, ...cors.modes]));
      } else {
        readable.set(image.url, { image, cors });
      }
    }
  }
  return {
    ...summarizeCorsPixelReadableImages(Array.from(readable.values())),
    unknownScriptCount,
    assessedScriptCount,
    executionOrigins: Array.from(executionOrigins).sort()
  };
}
