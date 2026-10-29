/** @typedef {import('../../../types/scanning.js').ScriptType} ScriptType */
/** @typedef {import('../../../types/scanning.js').ParsedUrl} ParsedUrl */
/** @typedef {import('../../../types/scanning.js').ScriptRecord} ScriptRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ScriptClassification} ScriptClassification */
/** @typedef {import('../../../types/cdp.js').ScriptParsed} ScriptParsed */

// Klasyfikuj źródła skryptów względem strony i wybierz ich nazwy w raporcie.

import { INTERNAL_PROTOCOLS, parseUrl, getRegistrableDomain } from './urls.js';

/**
 * @param {ScriptParsed} params
 * @returns {ScriptType}
 */
export function getScriptType(params) {
  const url = params.url || '';

  if (!url) {
    return params.hasSourceURL || params.embedderName ? 'eval' : 'inline';
  }

  if (/^blob:/i.test(url)) {
    return 'blob';
  }

  if (/^data:/i.test(url)) {
    return 'data';
  }

  if (/^(chrome-extension:|extensions::)/i.test(url)) {
    return 'extension';
  }

  const parsed = parseUrl(url);
  if (INTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return 'chrome-internal';
  }

  if (/^(https?:|file:|ftp:)/i.test(parsed.protocol)) {
    return 'external';
  }

  if (/VM\d+|eval/i.test(url)) {
    return 'eval';
  }

  return 'unknown';
}

/**
 * @param {ParsedUrl} parsed
 * @param {ScriptType} type
 * @param {string} url
 */
export function getScriptFilename(parsed, type, url) {
  if (parsed.filename) {
    return parsed.filename;
  }

  if (type === 'inline') {
    return '(inline script)';
  }

  if (type === 'eval') {
    return '(eval script)';
  }

  if (type === 'blob') {
    return '(blob script)';
  }

  if (type === 'data') {
    return '(data script)';
  }

  return url ? url.slice(0, 80) : '(anonymous script)';
}

/**
 * @param {Pick<ScriptRecord, 'type'|'origin'|'hostname'>} script
 * @param {ScanState} state
 * @returns {ScriptClassification}
 */
export function classifyScript(script, state) {
  if (script.type === 'chrome-internal' || script.type === 'extension') {
    return 'browser/internal';
  }

  if (script.type === 'inline' || script.type === 'eval' || script.type === 'blob' || script.type === 'data') {
    return 'inline/eval/blob';
  }

  if (!script.origin || !script.hostname) {
    return 'inline/eval/blob';
  }

  if (state.pageOrigin && script.origin === state.pageOrigin) {
    return 'first-party-origin';
  }

  const scriptRegistrableDomain = getRegistrableDomain(script.hostname);
  if (scriptRegistrableDomain && state.pageRegistrableDomain && scriptRegistrableDomain === state.pageRegistrableDomain) {
    return 'same-site';
  }

  return 'third-party';
}

/**
 * @param {Pick<ScriptRecord, 'filename'|'query'|'url'>} script
 */
export function makeDisplayName(script) {
  if (script.filename && script.query) {
    return `${script.filename}${script.query}`;
  }

  return script.filename || script.url || '(anonymous script)';
}

/**
 * @param {string} url
 * @returns {ScriptType}
 */
function getSourceTypeFromUrl(url) {
  if (!url) {
    return 'inline';
  }

  if (/^blob:/i.test(url)) {
    return 'blob';
  }

  if (/^data:/i.test(url)) {
    return 'data';
  }

  if (/^(chrome-extension:|extensions::)/i.test(url)) {
    return 'extension';
  }

  const parsed = parseUrl(url);
  if (INTERNAL_PROTOCOLS.has(parsed.protocol)) {
    return 'chrome-internal';
  }

  if (/^(https?:|file:|ftp:)/i.test(parsed.protocol)) {
    return 'external';
  }

  return 'unknown';
}

/**
 * @param {string} url
 * @param {ScanState} state
 */
export function classifySourceUrl(url, state) {
  const parsed = parseUrl(url);
  const type = getSourceTypeFromUrl(url);
  const classification = classifyScript({
    type,
    origin: parsed.origin,
    hostname: parsed.hostname
  }, state);

  return {
    parsed,
    type,
    classification,
    registrableDomain: getRegistrableDomain(parsed.hostname),
    filename: getScriptFilename(parsed, type, url)
  };
}

/**
 * @param {ScriptRecord} script
 */
function shouldExposeScript(script) {
  return script.classification !== 'inline/eval/blob'
    && script.classification !== 'browser/internal'
    && script.classification !== 'first-party-origin'
    && script.classification !== 'same-site';
}

/**
 * @param {ScanState} state
 */
export function getVisibleScripts(state) {
  return state.scripts.filter(shouldExposeScript);
}

/**
 * @param {string} classification
 */
export function getGroupSortRank(classification) {
  if (classification === 'first-party-origin') {
    return 1;
  }
  if (classification === 'same-site') {
    return 2;
  }
  if (classification === 'third-party') {
    return 3;
  }
  if (classification === 'inline/eval/blob') {
    return 4;
  }
  if (classification === 'browser/internal') {
    return 5;
  }

  return 9;
}
