/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {import('../../../types/scanning.js').StackFrame} StackFrame */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').PasswordObservation} PasswordObservation */

/**
 * Operacje przekazane przy składaniu aplikacji; decyzje biznesowe należą do tego modułu.
 * @typedef {object} PasswordAccessRecorderPorts
 * @property {Clock} clock
 */

// Przypisz obserwację do wywołującego skryptu; przekazany zegar zapisuje czas każdego wystąpienia.

import { classifySourceUrl } from './script-classification.js';

/**
 * @param {PasswordAccessRecorderPorts} ports
 */
export function createPasswordAccessRecorder({ clock }) {
  // Przypisuj wiadomości monitora pól hasła do wywołujących skryptów i scalaj powtarzające się obserwacje.

  /**
   * @param {string} stack
   * @returns {StackFrame[]}
   */
  function parsePasswordStack(stack) {
    if (!stack || typeof stack !== 'string') {
      return [];
    }

    return /** @type {StackFrame[]} */ (stack
      .split('\n')
      .map((line) => line.trim())
      .map((line) => {
        const match = line.match(/\(?((?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/)[^()]*?):(\d+):(\d+)\)?$/);
        if (!match) {
          return null;
        }

        const functionMatch = line.match(/^at\s+([^\s(]+(?:\s+[^\s(]+)*)/);
        return {
          functionName: functionMatch ? functionMatch[1] : '',
          url: match[1],
          lineNumber: Number(match[2]),
          columnNumber: Number(match[3])
        };
      })
      .filter(Boolean));
  }

  /**
   * @param {StackFrame[]} frames
   */
  function findPasswordSourceFrame(frames) {
    return frames.find((frame) => (
      frame.url && !frame.url.includes('__network_asset_inspector_password_monitor.js')
    )) || null;
  }

  /**
   * @param {ScanState} state
   * @param {PasswordObservation} observation
   */
  function recordPasswordAccess(state, { payload, executionContextId }) {
    const frames = parsePasswordStack(payload.stack || '');
    const sourceFrame = findPasswordSourceFrame(frames);
    const scriptUrl = sourceFrame ? sourceFrame.url : '';
    const source = classifySourceUrl(scriptUrl, state);
    const scriptKey = scriptUrl || '(unknown script)';
    const target = payload.target && typeof payload.target === 'object' ? payload.target : {};
    const key = [
      payload.kind || '',
      scriptKey,
      sourceFrame ? sourceFrame.lineNumber : '',
      sourceFrame ? sourceFrame.columnNumber : '',
      payload.detail || '',
      target.id || '',
      target.name || ''
    ].join('\u0000');

    const existing = state.passwordAccessesByKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = clock.nowIso();
      return;
    }

    const access = {
      id: key,
      kind: payload.kind || 'password.access',
      detail: payload.detail || '',
      target,
      pageUrl: payload.pageUrl || state.pageUrl,
      scriptUrl,
      scriptOrigin: source.parsed.origin,
      scriptHostname: source.parsed.hostname,
      scriptProtocol: source.parsed.protocol,
      scriptPathname: source.parsed.pathname,
      scriptFilename: source.filename,
      scriptType: source.type,
      classification: source.classification,
      registrableDomain: source.registrableDomain,
      functionName: sourceFrame ? sourceFrame.functionName : '',
      lineNumber: sourceFrame ? sourceFrame.lineNumber : null,
      columnNumber: sourceFrame ? sourceFrame.columnNumber : null,
      executionContextId,
      stackFrames: frames.slice(0, 20),
      count: 1,
      firstSeen: clock.nowIso(),
      lastSeen: clock.nowIso()
    };

    state.passwordAccessesByKey.set(key, access);
    state.passwordAccesses.push(access);
  }

  return { recordPasswordAccess };
}
