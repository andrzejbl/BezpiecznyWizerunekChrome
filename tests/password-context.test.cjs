'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { projectRoot, createContext, createModuleLoader, clone, createPopup } = require('./harness.cjs');
const { emptyState } = require('./fixtures/states.cjs');

const pageUrl = 'https://konto.example.pl/login';
const scriptUrl = 'https://vendor.example.net/widget.js';
const fields = { hasPasswordInputs: true, count: 1, inputs: [{ id: 'password', inputType: 'password' }] };

async function scenario({ probe = async () => undefined, fieldObservation = fields } = {}) {
  const { context } = createContext();
  const loader = createModuleLoader(context);
  const load = (filename) => loader.load(path.join(projectRoot, 'src', filename));
  const { createScanStateStore } = await load('business/scanning/scan-state.js');
  const { createPageObservationHandlers } = await load('business/scanning/page-observations.js');
  const { createPasswordObservationFlow } = await load('business/scanning/password-observation-flow.js');
  const { createScriptRecorder } = await load('business/scanning/script-records.js');
  const { createPasswordAccessRecorder } = await load('business/scanning/password-access.js');
  const { buildPasswordAccessTree } = await load('business/scanning/password-report.js');
  const { buildScriptTree } = await load('business/scanning/script-report.js');
  const summary = await load('business/popup/summary.js');
  const report = await load('business/report/rules.js');
  const clock = { nowIso: () => '2026-10-18T10:00:00.000Z' };
  const store = createScanStateStore({ stopPasswordInputPolling() {} });
  const state = store.ensureState(42);
  Object.assign(state, { attached: true, scanning: true, status: 'scanning', scanStartedAt: clock.nowIso() });
  const pages = createPageObservationHandlers({ readPageAddress: async () => pageUrl, scheduleRobotsChecks() {} });
  pages.handleFrameNavigated(state, { frame: { id: 'main', url: pageUrl } });
  const recorder = createScriptRecorder({ clock });
  const observed = createPasswordAccessRecorder({ clock });
  const probes = [];
  const flow = createPasswordObservationFlow({
    readPasswordInputs: async () => clone(fieldObservation),
    readPasswordContextAccess: async (tabId, contextId) => { probes.push({ tabId, contextId }); return probe(tabId, contextId); },
    clock,
    scheduler: { repeat: () => 1, cancel() {} }
  });
  function addScript(id, frameId, origin = 'https://konto.example.pl') {
    pages.handleExecutionContextCreated(state, { context: { id, origin, auxData: { frameId, isDefault: true } } });
    recorder.handleScriptParsed(state, { scriptId: 'script-' + id, url: scriptUrl, executionContextId: id });
  }
  function addUnknownScript(id) {
    recorder.handleScriptParsed(state, { scriptId: 'script-' + id, url: scriptUrl, executionContextId: id });
  }
  function snapshot() {
    return emptyState({
      ...clone({ pageUrl: state.pageUrl, pageOrigin: state.pageOrigin, status: state.status, scanStartedAt: state.scanStartedAt }),
      passwordAccessTree: clone(buildPasswordAccessTree(state)), scriptTree: clone(buildScriptTree(state))
    });
  }
  return { state, pages, flow, probes, addScript, addUnknownScript, observed, tree: () => buildPasswordAccessTree(state), snapshot, summary, report };
}

test('zewnętrzny skrypt w głównym dokumencie zachowuje potwierdzoną możliwość dostępu do hasła', async () => {
  const app = await scenario();
  app.addScript(1, 'main');
  await app.flow.pollPasswordInputInfo(app.state);
  const tree = app.tree();
  assert.equal(tree.groups.length, 1);
  assert.equal(tree.groups[0].accessScope, 'accessible');
  assert.equal(tree.groups[0].accesses[0].accessScope, 'accessible');
  assert.equal(tree.potentialScripts, 1);
  assert.equal(tree.unknownScripts, 0);
  const summary = app.summary.getSecuritySummary({ latestState: app.snapshot(), visibleImages: [] });
  assert.equal(summary.passwordDomains, 1);
  assert.equal(app.summary.getRiskLevel(summary), 'critical');
});

test('skrypt izolowanej ramki innego originu nie otrzymuje dostępu do hasła dokumentu głównego', async () => {
  const app = await scenario({ probe: async () => false });
  app.addScript(2, 'cross-origin-frame', 'https://embedded.example.org');
  await app.flow.pollPasswordInputInfo(app.state);
  assert.deepEqual(app.probes, [{ tabId: 42, contextId: 2 }]);
  assert.equal(app.tree().groups.length, 0);
  assert.equal(app.tree().potentialScripts, 0);
  const summary = app.summary.getSecuritySummary({ latestState: app.snapshot(), visibleImages: [] });
  assert.equal(summary.passwordDomains, 0);
  assert.notEqual(app.summary.getRiskLevel(summary), 'critical');
});

test('ramka z rzeczywistym dostępem do DOM głównego dokumentu nadal daje alarm możliwości odczytu', async () => {
  const app = await scenario({ probe: async () => true });
  app.addScript(2, 'same-origin-frame');
  await app.flow.pollPasswordInputInfo(app.state);
  assert.deepEqual(app.probes, [{ tabId: 42, contextId: 2 }]);
  assert.equal(app.tree().groups[0].accessScope, 'accessible');
  assert.equal(app.tree().potentialScripts, 1);
});

test('zgodny origin ramki nie zastępuje sprawdzenia faktycznego dostępu do dokumentu', async () => {
  const app = await scenario({ probe: async () => false });
  app.addScript(2, 'sandboxed-frame');
  await app.flow.pollPasswordInputInfo(app.state);
  assert.equal(app.tree().groups.length, 0);
});

test('nieznany kontekst daje jawny wynik nieustalony zamiast alarmu krytycznego lub zielonego OK', async () => {
  const app = await scenario();
  app.addScript(2, 'unknown-frame', 'https://embedded.example.org');
  await app.flow.pollPasswordInputInfo(app.state);
  const tree = app.tree();
  assert.equal(tree.groups[0].accessScope, 'unknown');
  assert.equal(tree.groups[0].unknownCount, 1);
  assert.equal(tree.unknownScripts, 1);
  assert.equal(tree.unknownDomainsCount, 1);
  assert.equal(tree.potentialScripts, 0);
  const summary = app.summary.getSecuritySummary({ latestState: app.snapshot(), visibleImages: [] });
  assert.equal(summary.passwordDomains, 0);
  assert.equal(summary.passwordUnknownDomains, 1);
  assert.equal(app.summary.getRiskLevel(summary), 'unknown');
  assert.match(app.summary.riskCopy(summary).level, /nieustalony/i);
  assert.equal(app.report.reportPriority(summary).label, 'DOSTĘP DO HASŁA NIEUSTALONY');
  assert.equal(app.report.getPasswordEvidenceLabel(tree.groups[0].accesses[0]), 'DOSTĘP NIEUSTALONY');

  const popup = await createPopup(false, app.snapshot());
  await popup.click('passwordTab');
  const rendered = JSON.stringify(popup.snapshot());
  assert.match(rendered, /Dostęp do hasła nieustalony/);
  assert.doesNotMatch(rendered, /Krytyczna możliwość dostępu do hasła/);
});

for (const missing of ['missing-context', 'failed-probe']) {
  test('brak wiarygodnego pomiaru pozostawia dostęp nieustalony: ' + missing, async () => {
    const app = await scenario({ probe: async () => { throw new Error('Context unavailable'); } });
    if (missing === 'missing-context') app.addUnknownScript(2);
    else app.addScript(2, 'child-frame');
    await app.flow.pollPasswordInputInfo(app.state);
    assert.equal(app.tree().groups[0].accessScope, 'unknown');
    assert.equal(app.tree().potentialScripts, 0);
    assert.equal(app.tree().unknownScripts, 1);
  });
}

for (const invalidate of ['destroyed', 'cleared', 'navigation', 'reused-id', 'child-navigation', 'frame-detached']) {
  test('spóźniona odpowiedź o dostępie nie przywraca starego kontekstu: ' + invalidate, async () => {
    let finishProbe;
    let probeStarted;
    const started = new Promise((resolve) => { probeStarted = resolve; });
    const result = new Promise((resolve) => { finishProbe = resolve; });
    const app = await scenario({ probe: async () => { probeStarted(); return result; } });
    app.addScript(2, 'child-frame');
    const polling = app.flow.pollPasswordInputInfo(app.state);
    await started;
    const previousContext = app.state.contexts.get(2);
    if (invalidate === 'destroyed') app.pages.handleExecutionContextDestroyed(app.state, { executionContextId: 2 });
    if (invalidate === 'cleared') app.pages.handleExecutionContextsCleared(app.state);
    if (invalidate === 'navigation') app.pages.handleFrameNavigated(app.state, { frame: { id: 'main', url: 'https://konto.example.pl/next' } });
    if (invalidate === 'reused-id') {
      app.pages.handleExecutionContextDestroyed(app.state, { executionContextId: 2 });
      app.addScript(2, 'new-child-frame');
    }
    if (invalidate === 'child-navigation') app.pages.handleFrameNavigated(app.state, { frame: { id: 'child-frame', parentId: 'main', url: 'https://konto.example.pl/next' } });
    if (invalidate === 'frame-detached') app.pages.handleFrameDetached(app.state, { frameId: 'child-frame' });
    finishProbe(true);
    await polling;
    assert.notEqual(previousContext.passwordAccess?.scope, 'accessible');
    assert.equal(app.tree().potentialScripts, 0);
    assert.ok(app.tree().groups.every((group) => group.accessScope !== 'accessible'));
  });
}

test('zaobserwowany odczyt hasła wewnątrz izolowanej ramki pozostaje dowodem', async () => {
  const app = await scenario({ probe: async () => false });
  app.addScript(2, 'cross-origin-frame', 'https://embedded.example.org');
  await app.flow.pollPasswordInputInfo(app.state);
  assert.equal(app.tree().groups.length, 0);
  app.observed.recordPasswordAccess(app.state, {
    executionContextId: 2,
    payload: {
      kind: 'password.value.get', detail: 'read input.value', target: { id: 'frame-password', inputType: 'password' },
      pageUrl: 'https://embedded.example.org/login',
      stack: 'Error\n at readForm (' + scriptUrl + ':21:7)'
    }
  });
  const tree = app.tree();
  assert.equal(tree.totalValueAccesses, 1);
  assert.equal(tree.groups[0].accessScope, 'accessible');
  assert.equal(tree.groups[0].accesses[0].observed, true);
  assert.equal(tree.groups[0].accesses[0].pageUrl, 'https://embedded.example.org/login');
  assert.equal(tree.groups[0].accesses[0].executionContextId, 2);
});

test('odczyt hasła w ramce jest widoczny także bez pól hasła w głównym dokumencie', async () => {
  const app = await scenario({ probe: async () => false, fieldObservation: { hasPasswordInputs: false, count: 0, inputs: [] } });
  app.addScript(2, 'child-frame', 'https://embedded.example.org');
  await app.flow.pollPasswordInputInfo(app.state);
  app.observed.recordPasswordAccess(app.state, {
    executionContextId: 2,
    payload: {
      kind: 'password.value.get', target: { id: 'frame-password', inputType: 'password' },
      pageUrl: 'https://embedded.example.org/login', stack: 'Error\n at readForm (' + scriptUrl + ':21:7)'
    }
  });
  assert.equal(app.tree().passwordInputCount, 0);
  assert.equal(app.tree().totalValueAccesses, 1);
  const popup = await createPopup(false, app.snapshot());
  await popup.click('passwordTab');
  const rendered = JSON.stringify(popup.snapshot());
  assert.match(JSON.stringify(popup.document.getElementById('passwordTree').snapshot()), /example\.net/);
  assert.match(JSON.stringify(popup.document.getElementById('passwordTree').snapshot()), /KRYTYCZNE/);
  assert.equal(popup.document.getElementById('passwordAccessesValue').textContent, '1');
  assert.match(rendered, /Krytyczne zagrożenie hasła/);
});

test('adapter sprawdza top.document we wskazanym kontekście i odróżnia izolację od błędu pomiaru', async () => {
  const commands = [];
  let pageWindow;
  const { context } = createContext({
    chrome: {
      runtime: { lastError: null },
      debugger: { sendCommand(target, method, params, callback) {
        commands.push({ target: clone(target), method, params: clone(params) });
        callback({ result: { value: vm.runInNewContext(params.expression, { window: pageWindow }) } });
      } }
    }
  });
  const { scanBrowser } = await createModuleLoader(context).load(path.join(projectRoot, 'src/technical/background/scan-browser.js'));
  // Any property access on the document would touch page content and must fail this test.
  pageWindow = { top: { document: new Proxy({}, { get() { throw new Error('Probe read document contents'); } }) } };
  assert.equal(await scanBrowser.readPasswordContextAccess(42, 7), true);
  pageWindow = { top: { get document() { throw Object.assign(new Error('Blocked by same-origin policy'), { name: 'SecurityError' }); } } };
  assert.equal(await scanBrowser.readPasswordContextAccess(42, 8), false);
  pageWindow = { top: { get document() { throw new Error('Unexpected access failure'); } } };
  assert.equal(await scanBrowser.readPasswordContextAccess(42, 9), undefined);
  pageWindow = undefined;
  assert.equal(await scanBrowser.readPasswordContextAccess(42, 10), undefined);
  assert.deepEqual(commands.map(({ target, method, params }) => ({ target, method, contextId: params.contextId })),
    [7, 8, 9, 10].map((contextId) => ({ target: { tabId: 42 }, method: 'Runtime.evaluate', contextId })));
});
