/**
 * Najpierw zbierz rekordy w grupy; oblicz sumy przed zwróceniem wyniku.
 * @typedef {Omit<ScriptGroup, 'count'|'blockedCount'|'corsPixelAccessImageCount'> & Partial<Pick<ScriptGroup, 'count'|'blockedCount'|'corsPixelAccessImageCount'>>} PendingScriptGroup
 */

/** @typedef {import('../../../types/scanning.js').ScriptRecord} ScriptRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').ScriptTree} ScriptTree */
/** @typedef {import('../../../types/scanning.js').ScriptGroup} ScriptGroup */

// Zbuduj drzewo grup skryptów używane przez okno rozszerzenia i raport.

import { getRegistrableDomain } from './urls.js';
import {
  getCorsPixelReadableImproperAuthorizationImages,
  summarizeCorsPixelReadableImages
} from './image-cors.js';
import { classifyScript, getVisibleScripts, getGroupSortRank } from './script-classification.js';
import { summarizeScriptImageAccess } from './image-script-access.js';

/**
 * @param {ScriptRecord} script
 * @returns {ScriptRecord}
 */
export function summarizeScript(script) {
  return {
    scriptId: script.scriptId,
    url: script.url,
    sourceMapURL: script.sourceMapURL,
    executionContextId: script.executionContextId,
    startLine: script.startLine,
    endLine: script.endLine,
    isModule: script.isModule,
    hash: script.hash,
    embedderName: script.embedderName,
    type: script.type,
    origin: script.origin,
    hostname: script.hostname,
    protocol: script.protocol,
    pathname: script.pathname,
    filename: script.filename,
    displayName: script.displayName,
    query: script.query,
    registrableDomain: script.registrableDomain,
    classification: script.classification,
    blockedByClient: script.blockedByClient === true,
    blockedReason: script.blockedReason || '',
    errorText: script.errorText || '',
    requestId: script.requestId || '',
    networkResourceType: script.networkResourceType || '',
    timestamp: script.timestamp
  };
}

/**
 * @param {ScanState} state
 * @returns {ScriptTree}
 */
export function buildScriptTree(state) {
  /** @type {Map<string, PendingScriptGroup>} */
  const groupsByKey = new Map();
  const corsPixelAccess = summarizeCorsPixelReadableImages(getCorsPixelReadableImproperAuthorizationImages(state));
  const visibleScripts = getVisibleScripts(state);

  visibleScripts.forEach((script) => {
    const classification = script.classification || classifyScript(script, state);
    const mainDomain = script.registrableDomain || getRegistrableDomain(script.hostname || '') || script.hostname || script.origin || 'unknown';
    const hostname = mainDomain;
    const label = mainDomain;

    const key = `${classification}:${mainDomain}`;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        label,
        hostname,
        origin: script.origin || '',
        registrableDomain: mainDomain,
        classification,
        scripts: /** @type {ScriptRecord[]} */ ([]),
        corsPixelAccess: { possible: false, imageCount: 0, imageDomains: [], modes: [], accessControlAllowOrigins: [] }
      });
    }

    (/** @type {PendingScriptGroup} */ (groupsByKey.get(key))).scripts.push(script);
  });

  const groups = Array.from(groupsByKey.values()).map((group) => {
    if (group.classification === 'third-party') {
      group.corsPixelAccess = summarizeScriptImageAccess(group.scripts, state);
    }
    group.scripts = group.scripts.map(summarizeScript);
    group.scripts.sort((a, b) => {
      const byName = a.displayName.localeCompare(b.displayName);
      if (byName !== 0) {
        return byName;
      }

      return a.url.localeCompare(b.url);
    });

    group.count = group.scripts.length;
    group.blockedCount = group.scripts.filter((script) => script.blockedByClient === true).length;
    group.corsPixelAccessImageCount = group.corsPixelAccess && group.corsPixelAccess.possible ? group.corsPixelAccess.imageCount : 0;
    return /** @type {ScriptGroup} */ (group);
  });

  groups.sort((a, b) => {
    const byRank = getGroupSortRank(a.classification) - getGroupSortRank(b.classification);
    if (byRank !== 0) {
      return byRank;
    }

    return a.label.localeCompare(b.label);
  });

  const thirdPartyGroups = groups.filter((group) => group.classification === 'third-party');
  const thirdPartyScriptsCount = thirdPartyGroups.reduce((sum, group) => sum + group.count, 0);
  const thirdPartyDomainsCount = new Set(thirdPartyGroups.map((group) => group.registrableDomain || group.hostname || group.origin)).size;
  const thirdPartyCorsPixelAccessDomainsCount = thirdPartyGroups.filter((group) => group.corsPixelAccess && group.corsPixelAccess.possible).length;
  const thirdPartyCorsPixelAccessUnknownDomainsCount = thirdPartyGroups.filter((group) => (group.corsPixelAccess.unknownScriptCount || 0) > 0).length;
  const thirdPartyCorsPixelAccessImageCount = summarizeScriptImageAccess(
    visibleScripts.filter((script) => (script.classification || classifyScript(script, state)) === 'third-party'), state
  ).imageCount;

  return {
    label: 'top',
    pageUrl: state.pageUrl,
    pageOrigin: state.pageOrigin,
    pageHostname: state.pageHostname,
    pageRegistrableDomain: state.pageRegistrableDomain,
    totalScripts: visibleScripts.length,
    thirdPartyScriptsCount,
    thirdPartyDomainsCount,
    thirdPartyCorsPixelAccessDomainsCount,
    thirdPartyCorsPixelAccessUnknownDomainsCount,
    thirdPartyCorsPixelAccessImageCount,
    corsPixelAccess,
    groups,
    thirdPartyGroups
  };
}

/**
 * @returns {ScriptTree}
 */
export function emptyTree() {
  return {
    label: 'top',
    pageUrl: '',
    pageOrigin: '',
    pageHostname: '',
    pageRegistrableDomain: '',
    totalScripts: 0,
    thirdPartyScriptsCount: 0,
    thirdPartyDomainsCount: 0,
    thirdPartyCorsPixelAccessDomainsCount: 0,
    thirdPartyCorsPixelAccessUnknownDomainsCount: 0,
    thirdPartyCorsPixelAccessImageCount: 0,
    corsPixelAccess: { possible: false, imageCount: 0, imageDomains: [], modes: [], accessControlAllowOrigins: [] },
    groups: [],
    thirdPartyGroups: []
  };
}
