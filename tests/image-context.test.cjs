'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { projectRoot, createContext, createModuleLoader, clone, createPopup } = require('./harness.cjs');

const { emptyState } = require('./fixtures/states.cjs');

const mainOrigin = 'https://konto.example.pl';
const frameOrigin = 'https://embedded.example.org';
const vendorOrigin = 'https://vendor.example.net';

function image(url, allowOrigin = '') {
  return {
    url, headers: allowOrigin ? { 'access-control-allow-origin': allowOrigin } : {},
    bodyComparison: { improperAuthorization: true }
  };
}

async function scenario({ images = [image(mainOrigin + '/private.jpg')], probe = async () => undefined, fieldsFail = false } = {}) {
  const { context } = createContext();
  const loader = createModuleLoader(context);
  const load = (filename) => loader.load(path.join(projectRoot, 'src', filename));
  const { createScanStateStore } = await load('business/scanning/scan-state.js');
  const { createPageObservationHandlers } = await load('business/scanning/page-observations.js');
  const { createScriptRecorder } = await load('business/scanning/script-records.js');
  const { createImageContextObservation } = await load('business/scanning/image-context-observation.js');
  const { createPasswordObservationFlow } = await load('business/scanning/password-observation-flow.js');
  const { buildScriptTree } = await load('business/scanning/script-report.js');
  const clock = { nowIso: () => '2026-10-18T10:00:00.000Z' };
  const store = createScanStateStore({ stopPasswordInputPolling() {} });
  const state = store.ensureState(42);
  Object.assign(state, { attached: true, scanning: true, status: 'scanning', scanStartedAt: clock.nowIso() });
  const pages = createPageObservationHandlers({ readPageAddress: async () => mainOrigin + '/gallery', scheduleRobotsChecks() {} });
  pages.handleFrameNavigated(state, { frame: { id: 'main', url: mainOrigin + '/gallery' } });
  state.images = clone(images);
  const recorder = createScriptRecorder({ clock });
  const probes = [];
  const observation = createImageContextObservation({ readImageContextAccess: async (tabId, contextId) => {
    probes.push({ tabId, contextId });
    return probe(tabId, contextId);
  } });
  const flow = createPasswordObservationFlow({
    readPasswordInputs: async () => {
      if (fieldsFail) throw new Error('Password field observation failed');
      return { hasPasswordInputs: false, count: 0, inputs: [] };
    },
    readPasswordContextAccess: async () => { throw new Error('No password fields to probe'); },
    updateImageContextAccess: observation.updateImageContextAccess,
    clock, scheduler: { repeat: () => 1, cancel() {} }
  });
  function addScript(id, { frameId = 'child', origin = frameOrigin, url = vendorOrigin + '/widget.js', context = true, scriptId = 'script-' + id } = {}) {
    if (context && !state.contexts.has(id)) pages.handleExecutionContextCreated(state, {
      context: { id, origin, auxData: { frameId, isDefault: true } }
    });
    recorder.handleScriptParsed(state, { scriptId, url, executionContextId: id });
    return state.scripts.find((script) => script.scriptId === scriptId);
  }
  return { state, pages, probes, addScript, load, poll: () => flow.pollPasswordInputInfo(state), tree: () => buildScriptTree(state) };
}

function onlyGroup(app) {
  const groups = app.tree().groups;
  assert.equal(groups.length, 1);
  return groups[0];
}

test('skrypt dostawcy uruchomiony w dokumencie głównym używa originu dokumentu, nie adresu JS', async () => {
  const app = await scenario();
  app.addScript(1, { frameId: 'main', origin: mainOrigin });
  await app.poll();
  const group = onlyGroup(app);
  assert.equal(group.corsPixelAccess.possible, true);
  assert.equal(group.corsPixelAccess.imageCount, 1);
  assert.deepEqual(clone(group.corsPixelAccess.executionOrigins), [mainOrigin]);
  assert.equal(group.corsPixelAccess.assessedScriptCount, 1);
  assert.equal(group.corsPixelAccess.unknownScriptCount, 0);
  assert.deepEqual(app.probes, []);
});

test('izolowana ramka nie dziedziczy ACAO dopuszczającego wyłącznie stronę główną', async () => {
  const app = await scenario({
    images: [image('https://photos.example.com/private.jpg', mainOrigin)],
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(app.tree().corsPixelAccess.possible, true);
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
  assert.equal(onlyGroup(app).corsPixelAccess.imageCount, 0);
  assert.equal(app.tree().thirdPartyCorsPixelAccessDomainsCount, 0);
  assert.equal(app.tree().thirdPartyCorsPixelAccessUnknownDomainsCount, 0);
});

test('izolowana ramka może odczytać zdjęcie ze swojego originu bez nagłówka CORS', async () => {
  const app = await scenario({
    images: [image(frameOrigin + '/private.jpg')],
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(app.tree().corsPixelAccess.possible, false);
  assert.equal(onlyGroup(app).corsPixelAccess.possible, true);
  assert.equal(onlyGroup(app).corsPixelAccess.imageCount, 1);
});

for (const allowOrigin of ['*', frameOrigin]) {
  test('ramka otrzymuje dostęp dopuszczony przez CORS dla własnego originu: ' + allowOrigin, async () => {
    const app = await scenario({
      images: [image('https://photos.example.com/private.jpg', allowOrigin)],
      probe: async () => ({ origin: frameOrigin, topAccessible: false })
    });
    app.addScript(2);
    await app.poll();
    assert.deepEqual(app.probes, [{ tabId: 42, contextId: 2 }]);
    assert.equal(app.state.passwordInputInfo.hasPasswordInputs, false);
    assert.equal(onlyGroup(app).corsPixelAccess.possible, true);
  });
}

test('origin źródła JS nie daje ramce dostępu do zdjęcia z domeny dostawcy skryptu', async () => {
  const app = await scenario({
    images: [image(vendorOrigin + '/private.jpg')],
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
});

test('sandbox z originem null nie dziedziczy originu URL ramki ani strony głównej', async () => {
  const app = await scenario({ probe: async () => ({ origin: 'null', topAccessible: false }) });
  app.addScript(2, { origin: mainOrigin });
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
  assert.deepEqual(clone(onlyGroup(app).corsPixelAccess.executionOrigins), ['null']);
});

for (const allowOrigin of ['null', '*']) {
  test('nieprzezroczysty origin jest dopuszczony tylko przez odpowiedni CORS: ' + allowOrigin, async () => {
    const app = await scenario({
      images: [image('https://photos.example.com/private.jpg', allowOrigin)],
      probe: async () => ({ origin: 'null', topAccessible: false })
    });
    app.addScript(2);
    await app.poll();
    assert.equal(onlyGroup(app).corsPixelAccess.possible, true);
    assert.ok(!onlyGroup(app).corsPixelAccess.modes.includes('same-origin'));
  });
}

test('null nie oznacza wspólnego originu z innym nieprzezroczystym adresem zdjęcia', async () => {
  const app = await scenario({
    images: [image('data:image/jpeg;base64,AA==')],
    probe: async () => ({ origin: 'null', topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
});

test('nagłówek z dwoma originami pozostaje odrzucony także w kontekście ramki', async () => {
  const app = await scenario({
    images: [image('https://photos.example.com/private.jpg', frameOrigin + ', ' + mainOrigin)],
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
});

for (const failure of ['missing-context', 'failed-probe', 'no-probe-result', 'expired-probe']) {
  test('brak aktualnych danych kontekstu pozostawia dostęp do zdjęć nieustalony: ' + failure, async () => {
    const app = await scenario({
      images: [image('https://photos.example.com/private.jpg', '*')],
      probe: async () => {
        if (failure === 'failed-probe') throw new Error('Context unavailable');
        return undefined;
      }
    });
    app.addScript(2, { context: failure !== 'missing-context' });
    if (failure === 'expired-probe') app.state.contexts.get(2).imageAccess = {
      origin: mainOrigin, topAccessible: true, documentRevision: app.state.passwordDocumentRevision - 1
    };
    await app.poll();
    const group = onlyGroup(app);
    assert.equal(group.corsPixelAccess.possible, false);
    assert.equal(group.corsPixelAccess.unknownScriptCount, 1);
    assert.equal(group.corsPixelAccess.assessedScriptCount, 0);
    assert.equal(app.tree().thirdPartyCorsPixelAccessUnknownDomainsCount, 1);
  });
}

test('zablokowany skrypt bez wykonania nie otrzymuje dostępu do zdjęć', async () => {
  const app = await scenario({ images: [image('https://photos.example.com/private.jpg', '*')] });
  const script = app.addScript(2, { context: false });
  script.blockedByClient = true;
  script.type = 'blocked';
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
  assert.deepEqual(app.probes, []);
});

test('grupa domeny łączy dostęp kilku kontekstów bez podwójnego liczenia zdjęć', async () => {
  const secondOrigin = 'https://second.example.edu';
  const app = await scenario({
    images: [
      image('https://photos.example.com/first.jpg', frameOrigin),
      image('https://photos.example.com/second.jpg', secondOrigin),
      image('https://photos.example.com/shared.jpg', '*')
    ],
    probe: async (_tabId, contextId) => ({ origin: contextId === 2 ? frameOrigin : secondOrigin, topAccessible: false })
  });
  app.addScript(2);
  app.addScript(3, { frameId: 'other', origin: secondOrigin });
  app.addScript(2, { scriptId: 'second-script-in-context', url: vendorOrigin + '/extra.js' });
  await app.poll();
  const group = onlyGroup(app);
  assert.equal(group.count, 3);
  assert.equal(group.corsPixelAccess.imageCount, 3);
  assert.equal(group.corsPixelAccessImageCount, 3);
  assert.equal(group.corsPixelAccess.assessedScriptCount, 3);
  assert.deepEqual(clone(group.corsPixelAccess.executionOrigins), [frameOrigin, secondOrigin].sort());
  assert.equal(app.probes.length, 2);
});

test('awaria odczytu pól hasła nie blokuje niezależnego sprawdzenia dostępu ramki do zdjęć', async () => {
  const app = await scenario({
    images: [image('https://photos.example.com/private.jpg', frameOrigin)], fieldsFail: true,
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.match(app.state.passwordInputInfo.error, /Password field observation failed/);
  assert.equal(onlyGroup(app).corsPixelAccess.possible, true);
  assert.deepEqual(app.probes, [{ tabId: 42, contextId: 2 }]);
});

for (const invalidate of ['destroyed', 'cleared', 'navigation', 'reused-id', 'child-navigation', 'frame-detached']) {
  test('spóźniony pomiar zdjęć nie przywraca dostępu starego kontekstu: ' + invalidate, async () => {
    let finishProbe;
    let probeStarted;
    const started = new Promise((resolve) => { probeStarted = resolve; });
    const result = new Promise((resolve) => { finishProbe = resolve; });
    const app = await scenario({
      images: [image('https://photos.example.com/private.jpg', '*')],
      probe: async () => { probeStarted(); return result; }
    });
    app.addScript(2);
    const polling = app.poll();
    await started;
    const previousContext = app.state.contexts.get(2);
    if (invalidate === 'destroyed') app.pages.handleExecutionContextDestroyed(app.state, { executionContextId: 2 });
    if (invalidate === 'cleared') app.pages.handleExecutionContextsCleared(app.state);
    if (invalidate === 'navigation') app.pages.handleFrameNavigated(app.state, { frame: { id: 'main', url: mainOrigin + '/next' } });
    if (invalidate === 'reused-id') {
      app.pages.handleExecutionContextDestroyed(app.state, { executionContextId: 2 });
      app.addScript(2, { frameId: 'new-child', scriptId: 'new-script' });
    }
    if (invalidate === 'child-navigation') app.pages.handleFrameNavigated(app.state, { frame: { id: 'child', parentId: 'main', url: frameOrigin + '/next' } });
    if (invalidate === 'frame-detached') app.pages.handleFrameDetached(app.state, { frameId: 'child' });
    finishProbe({ origin: frameOrigin, topAccessible: false });
    await polling;
    assert.equal(previousContext.imageAccess, undefined);
    assert.equal(app.tree().thirdPartyCorsPixelAccessDomainsCount, 0);
    assert.ok(app.tree().groups.every((group) => group.corsPixelAccess.possible === false));
    assert.equal(app.tree().thirdPartyCorsPixelAccessUnknownDomainsCount, invalidate === 'reused-id' ? 1 : 0);
    for (const group of app.tree().groups) assert.equal(group.corsPixelAccess.unknownScriptCount, invalidate === 'reused-id' ? 1 : 0);
  });
}


test('potwierdzony dostęp ramki do głównego dokumentu zachowuje jego rzeczywisty origin wykonania', async () => {
  const app = await scenario({ probe: async () => ({ origin: frameOrigin, topAccessible: true }) });
  app.pages.handleExecutionContextCreated(app.state, { context: { id: 1, origin: mainOrigin, auxData: { frameId: 'main', isDefault: true } } });
  app.addScript(2);
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, true);
  assert.deepEqual(clone(onlyGroup(app).corsPixelAccess.executionOrigins), [mainOrigin, frameOrigin].sort());
  assert.equal(onlyGroup(app).corsPixelAccess.unknownScriptCount, 0);
});

test('brak kontekstu głównego dokumentu nie pozwala zastąpić jego originu adresem strony', async () => {
  const app = await scenario({ probe: async () => ({ origin: frameOrigin, topAccessible: true }) });
  app.addScript(2);
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, false);
  assert.equal(onlyGroup(app).corsPixelAccess.unknownScriptCount, 1);
  assert.deepEqual(clone(onlyGroup(app).corsPixelAccess.executionOrigins), [frameOrigin]);
});

test('nieustalony dostęp do top nie usuwa niezależnie potwierdzonej możliwości dla originu ramki', async () => {
  const app = await scenario({
    images: [image(frameOrigin + '/private.jpg')],
    probe: async () => ({ origin: frameOrigin, topAccessible: null })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(onlyGroup(app).corsPixelAccess.possible, true);
  assert.equal(onlyGroup(app).corsPixelAccess.unknownScriptCount, 1);
  assert.equal(app.tree().thirdPartyCorsPixelAccessDomainsCount, 1);
  assert.equal(app.tree().thirdPartyCorsPixelAccessUnknownDomainsCount, 1);
});

test('nieustalony dostęp ramki do zdjęć jest widoczny w oknie i raporcie bez fałszywej możliwości odczytu', async () => {
  const app = await scenario({ images: [image('https://photos.example.com/private.jpg', '*')] });
  app.addScript(2, { context: false });
  await app.poll();
  const snapshot = emptyState({ status: 'stopped', scriptTree: clone(app.tree()), scanStartedAt: app.state.scanStartedAt });
  const popup = await createPopup(false, snapshot);
  await popup.click('scriptsTab');
  const rendered = JSON.stringify(popup.document.getElementById('scriptTree').snapshot());
  assert.match(rendered, /Dostęp do zdjęć nieustalony: 1/);
  assert.doesNotMatch(rendered, /może odczytać zdjęcia:/);
  const { getSecuritySummary } = await app.load('business/popup/summary.js');
  const summary = getSecuritySummary({ latestState: snapshot, visibleImages: [] });
  assert.equal(summary.corsPixelDomains, 0);
  assert.equal(summary.corsPixelUnknownDomains, 1);
  const { appendScriptReportSection } = await app.load('technical/report/sections/scripts.js');
  const items = [];
  appendScriptReportSection(items, app.tree().groups);
  const report = JSON.stringify(items);
  assert.match(report, /DOSTĘP DO ZDJĘĆ NIEUSTALONY/);
  assert.doesNotMatch(report, /MOŻLIWOŚĆ ODCZYTU PIKSELI/);
});

test('adapter zdjęć odczytuje origin bezpieczeństwa ramki bez treści dokumentu lub URL-u', async () => {
  const commands = [];
  let pageWindow;
  const { context } = createContext({ chrome: {
    runtime: { lastError: null },
    debugger: { sendCommand(target, method, params, callback) {
      commands.push({ target: clone(target), method, params: clone(params) });
      callback({ result: { value: vm.runInNewContext(params.expression, { window: pageWindow }) } });
    } }
  } });
  const { scanBrowser } = await createModuleLoader(context).load(path.join(projectRoot, 'src/technical/background/scan-browser.js'));
  // Dotknięcie treści dokumentu lub adresu URL obala test: wystarcza security origin i sama próba top.document.
  const noContent = new Proxy({}, { get() { throw new Error('Read document contents'); } });
  pageWindow = { origin: frameOrigin, get location() { throw new Error('Read location URL'); }, top: { document: noContent } };
  assert.deepEqual(clone(await scanBrowser.readImageContextAccess(42, 7)), { origin: frameOrigin, topAccessible: true });
  pageWindow = { origin: 'null', get location() { throw new Error('Read location URL'); }, top: {
    get document() { throw Object.assign(new Error('Isolated frame'), { name: 'SecurityError' }); }
  } };
  assert.deepEqual(clone(await scanBrowser.readImageContextAccess(42, 8)), { origin: 'null', topAccessible: false });
  pageWindow = { origin: frameOrigin, top: { get document() { throw new Error('Unexpected error'); } } };
  assert.deepEqual(clone(await scanBrowser.readImageContextAccess(42, 9)), { origin: frameOrigin, topAccessible: null });
  pageWindow = { get origin() { throw new Error('Origin unavailable'); } };
  assert.equal(await scanBrowser.readImageContextAccess(42, 10), undefined);
  pageWindow = undefined;
  assert.equal(await scanBrowser.readImageContextAccess(42, 11), undefined);
  assert.deepEqual(commands.map(({ target, method, params }) => ({
    target, method, contextId: params.contextId, returnByValue: params.returnByValue, timeout: params.timeout
  })), [7, 8, 9, 10, 11].map((contextId) => ({ target: { tabId: 42 }, method: 'Runtime.evaluate', contextId, returnByValue: true, timeout: 1000 })));
});


test('podsumowanie liczy zdjęcia dostępne tylko dla ramki także bez dostępu strony głównej', async () => {
  const app = await scenario({
    images: [image('https://photos.example.com/private.jpg', frameOrigin)],
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  await app.poll();
  assert.equal(app.tree().corsPixelAccess.imageCount, 0);
  assert.equal(app.tree().thirdPartyCorsPixelAccessImageCount, 1);
  const { getSecuritySummary } = await app.load('business/popup/summary.js');
  const summary = getSecuritySummary({ latestState: emptyState({ scriptTree: clone(app.tree()) }), visibleImages: [] });
  assert.equal(summary.corsPixelDomains, 1);
  assert.equal(summary.corsPixelImages, 1);
});

test('wspólne zdjęcie dwóch domen skryptów jest liczone tylko raz w podsumowaniu', async () => {
  const app = await scenario({
    images: [image('https://photos.example.com/shared.jpg', '*')],
    probe: async () => ({ origin: frameOrigin, topAccessible: false })
  });
  app.addScript(2);
  app.addScript(3, { url: 'https://scripts.other.net/widget.js', frameId: 'other' });
  await app.poll();
  assert.equal(app.tree().thirdPartyCorsPixelAccessDomainsCount, 2);
  assert.equal(app.tree().thirdPartyCorsPixelAccessImageCount, 1);
  assert.equal(app.tree().groups.reduce((sum, group) => sum + group.corsPixelAccess.imageCount, 0), 2);
  const { getSecuritySummary } = await app.load('business/popup/summary.js');
  const summary = getSecuritySummary({ latestState: emptyState({ scriptTree: clone(app.tree()) }), visibleImages: [] });
  assert.equal(summary.corsPixelImages, 1);
});
