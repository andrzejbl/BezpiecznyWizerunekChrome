/** @typedef {import('../../../types/scanning.js').RobotsGroup} RobotsGroup */
/** @typedef {import('../../../types/scanning.js').RobotsRule} RobotsRule */
/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').RobotsResult} RobotsResult */

// Odczytaj grupy z robots.txt i zastosuj dotychczasowe reguły dostępu robotów Google do zdjęć.

import { GOOGLE_IMAGE_USER_AGENTS } from './config.js';
import { parseUrl } from './urls.js';

/**
 * @param {string} origin
 */
export function getRobotsUrlForOrigin(origin) {
  return origin ? `${origin}/robots.txt` : '';
}

/**
 * @param {string|undefined} url
 */
export function isRobotsCheckableUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(parsed.origin && (parsed.protocol === 'http:' || parsed.protocol === 'https:'));
}

/**
 * @param {string} text
 * @returns {RobotsGroup[]}
 */
export function parseRobotsTxt(text) {
  /** @type {RobotsGroup[]} */
  const groups = [];
  /** @type {RobotsGroup|null} */
  let currentGroup = null;

  String(text || '').split(/\r?\n/).forEach((rawLine) => {
    const commentIndex = rawLine.indexOf('#');
    const line = (commentIndex === -1 ? rawLine : rawLine.slice(0, commentIndex)).trim();
    if (!line) {
      return;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'user-agent') {
      if (!currentGroup || currentGroup.rules.length > 0) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
      }

      if (value) {
        currentGroup.agents.push(value.toLowerCase());
      }
      return;
    }

    if ((key === 'allow' || key === 'disallow') && currentGroup) {
      currentGroup.rules.push({ directive: key, path: value });
    }
  });

  return groups.filter((group) => group.agents.length > 0);
}

/**
 * @param {string[]} agents
 */
function getRobotsAgentSpecificity(agents) {
  let bestSpecificity = -1;

  agents.forEach((agent) => {
    const normalizedAgent = String(agent || '').toLowerCase().trim();
    if (!normalizedAgent) {
      return;
    }

    if (normalizedAgent === '*') {
      bestSpecificity = Math.max(bestSpecificity, 0);
      return;
    }

    GOOGLE_IMAGE_USER_AGENTS.forEach((targetAgent) => {
      if (targetAgent !== '*' && targetAgent.startsWith(normalizedAgent)) {
        bestSpecificity = Math.max(bestSpecificity, normalizedAgent.length);
      }
    });
  });

  return bestSpecificity;
}

/**
 * @param {string} pattern
 */
function robotsPatternToRegExp(pattern) {
  const hasEndAnchor = pattern.endsWith('$');
  const patternBody = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = patternBody
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${escaped}${hasEndAnchor ? '$' : ''}`);
}

/**
 * @param {string} pattern
 * @param {string} path
 */
function robotsRuleMatches(pattern, path) {
  if (!pattern) {
    return false;
  }

  try {
    return robotsPatternToRegExp(pattern).test(path);
  } catch (error) {
    return path.startsWith(pattern.replace(/[*$]/g, ''));
  }
}

/**
 * @param {string} pattern
 */
function getRobotsRuleSpecificity(pattern) {
  return String(pattern || '').replace(/\*/g, '').replace(/\$$/, '').length;
}

/**
 * @param {RobotsGroup[]} groups
 * @param {string} path
 * @returns {{blocked:boolean, matchedRule:RobotsRule|null}}
 */
function evaluateRobotsForPath(groups, path) {
  const candidates = groups
    .map((group) => ({
      group,
      specificity: getRobotsAgentSpecificity(group.agents)
    }))
    .filter((candidate) => candidate.specificity >= 0);

  if (candidates.length === 0) {
    return { blocked: false, matchedRule: null };
  }

  // Reguły ścieżek pochodzą tylko z grup o najbardziej szczegółowym dopasowaniu do nazwy robota.
  const bestSpecificity = Math.max(...candidates.map((candidate) => candidate.specificity));
  const relevantRules = candidates
    .filter((candidate) => candidate.specificity === bestSpecificity)
    .flatMap((candidate) => candidate.group.rules);

  /** @type {RobotsRule & {specificity:number}|null} */
  let bestRule = null;

  relevantRules.forEach((rule) => {
    if (!rule.path || !robotsRuleMatches(rule.path, path)) {
      return;
    }

    const specificity = getRobotsRuleSpecificity(rule.path);
    if (
      !bestRule ||
      specificity > bestRule.specificity ||
      (specificity === bestRule.specificity && rule.directive === 'allow' && bestRule.directive === 'disallow')
    ) {
      bestRule = { ...rule, specificity };
    }
  });

  if (!bestRule) {
    return { blocked: false, matchedRule: null };
  }

  return {
    blocked: (/** @type {RobotsRule & {specificity:number}} */ (bestRule)).directive === 'disallow',
    matchedRule: {
      directive: (/** @type {RobotsRule & {specificity:number}} */ (bestRule)).directive,
      path: (/** @type {RobotsRule & {specificity:number}} */ (bestRule)).path,
      specificity: (/** @type {RobotsRule & {specificity:number}} */ (bestRule)).specificity
    }
  };
}

/**
 * @param {ImageRecord} image
 * @param {ScanState} state
 * @returns {RobotsResult}
 */
export function getRobotsResultForImage(image, state) {
  const parsed = parseUrl(image.url);
  const robotsUrl = getRobotsUrlForOrigin(parsed.origin);

  if (!robotsUrl || !isRobotsCheckableUrl(image.url)) {
    return { status: 'unavailable', blocked: false, robotsUrl: '', message: 'Only http and https image URLs can be checked.' };
  }

  const check = state && state.robotsChecksByOrigin ? state.robotsChecksByOrigin.get(parsed.origin) : null;
  if (!check) {
    return { status: 'unchecked', blocked: false, robotsUrl, message: 'robots.txt has not been checked yet.' };
  }

  if (check.status !== 'loaded') {
    return {
      status: check.status,
      checkedAt: check.checkedAt || '',
      blocked: false,
      robotsUrl: check.robotsUrl || robotsUrl,
      message: check.message || '',
      httpStatusCode: check.httpStatusCode || null
    };
  }

  const path = `${parsed.pathname || '/'}${parsed.query || ''}`;
  const evaluation = evaluateRobotsForPath(check.groups || [], path || '/');

  return {
    status: evaluation.blocked ? 'blocked' : 'allowed',
    checkedAt: check.checkedAt || '',
    blocked: evaluation.blocked,
    robotsUrl: check.robotsUrl || robotsUrl,
    message: evaluation.blocked ? 'robots.txt blocks Google image crawling for this path.' : '',
    httpStatusCode: check.httpStatusCode || null,
    matchedRule: evaluation.matchedRule
  };
}
