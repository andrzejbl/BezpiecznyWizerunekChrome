/**
 * Najpierw zbierz rekordy w grupy; oblicz sumy przed zwróceniem wyniku.
 * @typedef {Omit<PasswordAccessGroup, 'scriptCount'> & Partial<Pick<PasswordAccessGroup, 'scriptCount'>>} PendingPasswordAccessGroup
 */

/** @typedef {import('../../../types/scanning.js').ScriptRecord} ScriptRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').PasswordAccess} PasswordAccess */
/** @typedef {import('../../../types/scanning.js').PasswordAccessGroup} PasswordAccessGroup */
/** @typedef {import('../../../types/scanning.js').PasswordAccessTree} PasswordAccessTree */

// Grupuj zaobserwowane dostępy do pól hasła i potencjalne możliwości skryptów dla okna rozszerzenia i raportu.

import { PASSWORD_INPUT_POLL_INTERVAL_MS } from './config.js';
import { getRegistrableDomain } from './urls.js';
import { getVisibleScripts, getGroupSortRank } from './script-classification.js';
import { getPasswordAccessScope } from './password-context.js';
import {
  shouldExposePasswordScript,
  getVisiblePasswordAccesses,
  isPasswordValueAccess
} from './password-rules.js';

/**
 * @param {ScriptRecord} script
 * @param {ScanState} state
 * @param {'accessible'|'unknown'} accessScope
 * @returns {PasswordAccess}
 */
function makePotentialPasswordAccess(script, state, accessScope) {
  const blockedByClient = script.blockedByClient === true;

  return {
    id: `potential:${script.scriptId || script.url || script.displayName}`,
    kind: blockedByClient ? 'blocked-by-client.third-party-script'
      : accessScope === 'unknown' ? 'potential.password-access-unknown' : 'potential.password-value-capability',
    detail: accessScope === 'unknown'
      ? 'Access to the document containing password fields has not been established for this execution context.'
      : 'The script execution context can access the document containing password fields; no value access was observed.',
    target: accessScope === 'accessible' ? state.passwordInputInfo.inputs[0] || {} : {},
    accessScope,
    pageUrl: state.pageUrl,
    scriptUrl: script.url,
    scriptOrigin: script.origin,
    scriptHostname: script.hostname,
    scriptProtocol: script.protocol,
    scriptPathname: script.pathname,
    scriptFilename: script.displayName || script.filename,
    scriptType: script.type,
    classification: script.classification,
    registrableDomain: script.registrableDomain,
    functionName: '',
    lineNumber: null,
    columnNumber: null,
    executionContextId: script.executionContextId,
    stackFrames: [],
    count: 0,
    observed: false,
    blockedByClient,
    blockedReason: script.blockedReason || '',
    errorText: script.errorText || '',
    firstSeen: script.timestamp,
    lastSeen: script.timestamp
  };
}

/**
 * @param {Map<string,PendingPasswordAccessGroup>} groupsByKey
 * @param {PasswordAccess} access
 */
function addPasswordAccessToGroup(groupsByKey, access) {
  const mainDomain = access.registrableDomain || getRegistrableDomain(access.scriptHostname || '') || access.scriptHostname || access.scriptOrigin || 'unknown';
  const key = `${access.classification}:${mainDomain}`;

  if (!groupsByKey.has(key)) {
    groupsByKey.set(key, {
      key,
      label: mainDomain,
      hostname: mainDomain,
      origin: access.scriptOrigin || '',
      registrableDomain: mainDomain,
      classification: access.classification,
      accesses: /** @type {PasswordAccess[]} */ ([]),
      eventCount: 0,
      valueAccessCount: 0,
      domSignalCount: 0,
      potentialCount: 0,
      unknownCount: 0,
      accessScope: 'unknown',
      blockedCount: 0
    });
  }

  const group = /** @type {PendingPasswordAccessGroup} */ (groupsByKey.get(key));
  group.accesses.push({ ...access });
  if (access.accessScope !== 'unknown') group.accessScope = 'accessible';
  else group.unknownCount = (group.unknownCount || 0) + 1;
  if (access.blockedByClient === true) {
    group.blockedCount += 1;
  } else if (access.observed === false && access.accessScope !== 'unknown') {
    group.potentialCount += 1;
  } else if (access.observed !== false) {
    group.eventCount += access.count;
    if (isPasswordValueAccess(access)) {
      group.valueAccessCount += access.count;
    } else {
      group.domSignalCount += access.count;
    }
  }
}

/**
 * @param {ScanState} state
 * @returns {PasswordAccessTree}
 */
export function buildPasswordAccessTree(state) {
  /** @type {Map<string, PendingPasswordAccessGroup>} */
  const groupsByKey = new Map();
  const visibleAccesses = getVisiblePasswordAccesses(state);
  const observedScriptKeys = new Set(visibleAccesses.map((access) => access.scriptUrl || access.scriptFilename));
  const hasPasswordInputSignal = state.passwordInputInfo.hasPasswordInputs || state.passwordInputInfo.hasEverPasswordInputs;
  const candidateScripts = hasPasswordInputSignal
    ? getVisibleScripts(state).filter((script) => shouldExposePasswordScript(script) && !observedScriptKeys.has(script.url || script.displayName || script.filename))
    : [];

  let potentialScripts = 0;
  let unknownScripts = 0;
  candidateScripts.forEach((script) => {
    const scope = getPasswordAccessScope(script, state);
    if (scope === 'isolated') return;
    if (scope === 'accessible') potentialScripts += 1;
    else unknownScripts += 1;
    addPasswordAccessToGroup(groupsByKey, makePotentialPasswordAccess(script, state, scope));
  });

  visibleAccesses.forEach((access) => {
    addPasswordAccessToGroup(groupsByKey, { ...access, observed: true, accessScope: 'accessible' });
  });

  const groups = Array.from(groupsByKey.values()).map((group) => {
    group.accesses.sort((a, b) => {
      const byObserved = Number(a.observed === false) - Number(b.observed === false);
      if (byObserved !== 0) {
        return byObserved;
      }
      const byName = a.scriptFilename.localeCompare(b.scriptFilename);
      if (byName !== 0) {
        return byName;
      }
      return a.kind.localeCompare(b.kind);
    });
    group.scriptCount = new Set(group.accesses.map((access) => access.scriptUrl || access.scriptFilename)).size;
    return /** @type {PasswordAccessGroup} */ (group);
  });

  groups.sort((a, b) => {
    const byRank = getGroupSortRank(a.classification) - getGroupSortRank(b.classification);
    if (byRank !== 0) {
      return byRank;
    }
    return a.label.localeCompare(b.label);
  });

  const allScriptKeys = new Set();
  groups.forEach((group) => {
    group.accesses.forEach((access) => allScriptKeys.add(access.scriptUrl || access.scriptFilename));
  });
  const totalValueAccesses = visibleAccesses
    .filter(isPasswordValueAccess)
    .reduce((sum, access) => sum + access.count, 0);

  return {
    hasPasswordInputs: state.passwordInputInfo.hasPasswordInputs,
    hasEverPasswordInputs: state.passwordInputInfo.hasEverPasswordInputs === true,
    passwordInputCount: state.passwordInputInfo.count,
    passwordInputs: state.passwordInputInfo.inputs,
    totalAccesses: visibleAccesses.reduce((sum, access) => sum + access.count, 0),
    totalValueAccesses,
    valueAccessDomainsCount: groups.filter((group) => group.valueAccessCount > 0).length,
    domSignalDomainsCount: groups.filter((group) => group.domSignalCount > 0).length,
    uniqueScripts: allScriptKeys.size,
    potentialScripts,
    unknownScripts,
    unknownDomainsCount: groups.filter((group) => group.accessScope === 'unknown').length,
    lastChecked: state.passwordInputInfo.lastChecked || '',
    polling: state.passwordPollTimerId !== null,
    pollIntervalMs: PASSWORD_INPUT_POLL_INTERVAL_MS,
    groups
  };
}
