'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createModuleLoader, clone } = require('./harness.cjs');
const fixture = require('./fixtures/findings.cjs');

async function loadBusiness(relativePath) {
  // Nie udostępniamy implementacji Chrome, DOM, Blob, crypto ani zegarów.
  const context = vm.createContext({ URL });
  return createModuleLoader(context).load(path.resolve(__dirname, '../src/business', relativePath));
}

test('CORS odrzuca listy originów i wielokrotne nagłówki, zachowując surowy dowód', async () => {
  const { getCorsPixelAccessInfo } = await loadBusiness('scanning/image-cors.js');
  const pageOrigin = 'https://app.example';
  const cases = [
    { 'Access-Control-Allow-Origin': pageOrigin + ', https://other.example' },
    { 'Access-Control-Allow-Origin': pageOrigin + ', ' + pageOrigin },
    { 'Access-Control-Allow-Origin': '*, ' + pageOrigin },
    { 'Access-Control-Allow-Origin': pageOrigin + ',' },
    { 'Access-Control-Allow-Origin': [pageOrigin, 'https://other.example'] },
    { 'Access-Control-Allow-Origin': pageOrigin, 'access-control-allow-origin': pageOrigin },
    { 'Access-Control-Allow-Origin': pageOrigin + '\n' + pageOrigin }
  ];

  for (const headers of cases) {
    const image = {
      ...clone(fixture.image),
      url: 'https://images.example/photo.jpg',
      headers: { 'Access-Control-Allow-Origin': '*' },
      bodyComparison: { improperAuthorization: true, noCredentialsHeaders: headers }
    };
    const result = getCorsPixelAccessInfo(image, { pageOrigin });
    assert.equal(result.possible, false, JSON.stringify(headers));
    assert.deepEqual(Array.from(result.modes), []);
    assert.equal(result.responseHeaderSource, 'no-credentials-request');
    assert.ok(result.accessControlAllowOrigin.includes(pageOrigin));
  }
});

test('CORS porównuje dokładny zapis originu i zachowuje poprawny dostęp', async () => {
  const { getCorsPixelAccessInfo } = await loadBusiness('scanning/image-cors.js');
  const pageOrigin = 'https://app.example';
  const cases = [
    [undefined, false], ['', false], ['*', true], [pageOrigin, true],
    [' \t' + pageOrigin + '\t ', true], ['https://other.example', false],
    [pageOrigin + '/', false], [pageOrigin + '/path', false],
    [pageOrigin + ':443', false], ['https://APP.EXAMPLE', false],
    ['https://user@app.example', false], [pageOrigin + '?query', false],
    [pageOrigin + '#fragment', false], ['null', false],
    ['\u00a0' + pageOrigin + '\u00a0', false]
  ];
  for (const [header, possible] of cases) {
    const image = {
      ...clone(fixture.image), url: 'https://images.example/photo.jpg',
      bodyComparison: { noCredentialsHeaders: { 'Access-Control-Allow-Origin': header } }
    };
    assert.equal(getCorsPixelAccessInfo(image, { pageOrigin }).possible, possible, String(header));
  }

  const sameOrigin = getCorsPixelAccessInfo({
    ...clone(fixture.image), url: pageOrigin + '/photo.jpg',
    bodyComparison: { noCredentialsHeaders: { 'Access-Control-Allow-Origin': '*, https://other.example' } }
  }, { pageOrigin });
  assert.deepEqual(Array.from(sameOrigin.modes), ['same-origin']);

  for (const [header, possible] of [['null', true], ['NULL', false], ['null, *', false]]) {
    const result = getCorsPixelAccessInfo({
      ...clone(fixture.image), url: 'https://images.example/photo.jpg',
      bodyComparison: { noCredentialsHeaders: { 'Access-Control-Allow-Origin': header } }
    }, { pageOrigin: 'null' });
    assert.equal(result.possible, possible, header);
  }
});

test('niepoprawny CORS nie zwiększa liczby domen z dostępem do zdjęć', async () => {
  const { createScanStateStore } = await loadBusiness('scanning/scan-state.js');
  const { createScriptRecorder } = await loadBusiness('scanning/script-records.js');
  const { buildScriptTree } = await loadBusiness('scanning/script-report.js');
  const state = createScanStateStore({ stopPasswordInputPolling() {} }).ensureState(42);
  Object.assign(state, {
    pageUrl: 'https://app.example/gallery', pageOrigin: 'https://app.example',
    pageHostname: 'app.example', pageRegistrableDomain: 'app.example'
  });
  state.images.push({
    ...clone(fixture.image), url: 'https://images.example/photo.jpg',
    bodyComparison: {
      improperAuthorization: true,
      noCredentialsHeaders: { 'Access-Control-Allow-Origin': 'https://app.example, https://other.example' }
    }
  });
  createScriptRecorder({ clock: { nowIso: () => '2026-10-18T10:00:00.000Z' } })
    .handleScriptParsed(state, { scriptId: 'third-party', url: 'https://vendor.example/widget.js' });

  const tree = buildScriptTree(state);
  assert.equal(tree.thirdPartyDomainsCount, 1);
  assert.equal(tree.thirdPartyCorsPixelAccessDomainsCount, 0);
  assert.equal(tree.corsPixelAccess.imageCount, 0);
  assert.equal(tree.thirdPartyGroups[0].corsPixelAccess.possible, false);
});

test('PNG jest rozpoznawany po MIME lub rozszerzeniu, a pozostałe formaty zachowują dotychczasowe reguły', async () => {
  const { isExcludedImageFormat } = await loadBusiness('popup/image-rules.js');
  const cases = [
    ['image/png', 'https://example.test/download?id=1', false],
    ['IMAGE/PNG', 'https://example.test/download', false],
    ['', 'https://example.test/photo.PNG?token=abc#preview', false],
    ['', '/photo.png?token=abc', false],
    ['image/jpeg', 'https://example.test/photo.jpg', false],
    ['image/jpg', 'https://example.test/photo.jpg', false],
    ['image/pjpeg', 'https://example.test/photo.jpg', false],
    ['', 'https://example.test/photo.jpeg', false],
    ['image/webp', 'https://example.test/photo.png', true],
    ['application/octet-stream', 'https://example.test/photo.png', true],
    ['', 'https://example.test/photo.webp', true],
    ['', 'https://example.test/photo.png.exe', true],
    ['', 'https://example.test/download?filename=photo.png', true]
  ];

  for (const [mimeType, url, excluded] of cases) {
    assert.equal(isExcludedImageFormat({ ...clone(fixture.image), mimeType, url }), excluded, mimeType + ' ' + url);
  }
});

test('PNG nadal wymaga zgodnej treści, poprawnych statusów HTTP i zaakceptowanego pomiaru', async () => {
  const { getFilteredImageRows } = await loadBusiness('popup/image-rules.js');
  const { assessImageBodyComparison } = await loadBusiness('scanning/image-comparison-rules.js');
  const successfulComparison = {
    originalLength: 100, publicLength: 100,
    originalSha256: 'same', publicSha256: 'same',
    originalStatus: 200, publicStatus: 200
  };
  const cases = [
    ['accepted', {}, 'loaded', true],
    ['different-content', { publicSha256: 'different' }, 'loaded', true],
    ['different-length', { publicLength: 99 }, 'loaded', true],
    ['original-error', { originalStatus: 403 }, 'loaded', true],
    ['public-error', { publicStatus: 403 }, 'loaded', true],
    ['small', {}, 'loaded', false],
    ['broken', {}, 'failed', false],
    ['pending', {}, 'pending', false]
  ];
  const dimensionsByUrl = new Map();
  const images = cases.map(([name, comparison, state, passes]) => {
    const image = {
      ...clone(fixture.image),
      url: 'https://example.test/' + name + '.png',
      mimeType: 'image/png',
      bodyComparison: assessImageBodyComparison({ ...successfulComparison, ...comparison })
    };
    dimensionsByUrl.set(image.url, { state, passes });
    return image;
  });

  const result = getFilteredImageRows(images, (image) => dimensionsByUrl.get(image.url));

  assert.deepEqual(Array.from(result.rows, ({ image }) => image.url), ['https://example.test/accepted.png']);
  assert.equal(result.pendingCount, 1);
});

function makeReportScenario() {
  let state = { ...clone(fixture.latestState), status: 'scanning', scanning: true, attached: true };
  let busy = false;
  const calls = [];
  const downloads = [];
  const ports = {
    getLatestState: () => state,
    getReportStats: () => {
      assert.equal(state.scanning, false, 'findings must be read after stopping');
      calls.push('read findings');
      return clone(fixture.reportStats);
    },
    getSecuritySummary: () => clone(fixture.summary),
    getReportPageDomain: () => 'example.pl',
    getFilenameTimestamp: () => '2026-07-19_12-03-00',
    getPdfReportFilename: () => 'report.pdf',
    setBusy: (value) => { busy = value; },
    setStatusText: () => {},
    confirmStopScan: () => true,
    stopScan: async () => {
      calls.push('stop scan');
      return { ...state, scanning: false, attached: false, status: 'stopped' };
    },
    render: (nextState) => { state = nextState; },
    now: () => new Date('2026-07-19T10:03:00.000Z'),
    getExtensionManifest: () => ({ name: 'Fixture extension', version: '1.0.0' }),
    createImagePreview: async (image) => {
      // Symulujemy nadejście nowego wyniku skanu podczas przygotowywania podglądu.
      state = { ...state, pageUrl: 'https://example.pl/fresh-snapshot' };
      return image.reportPreviewJpeg;
    },
    cloneEvidenceValue: clone,
    formatReportDate: (date) => date.toISOString(),
    serializeEvidencePayload: JSON.stringify,
    serializeEvidenceAttachment: JSON.stringify,
    hashText: async (text) => 'text-hash-' + text.length,
    hashFile: async () => 'pdf-hash',
    renderReportDocument: (model) => model,
    createPdf: (document, options) => {
      calls.push('create PDF');
      return { kind: 'pdf', document, options };
    },
    createJsonFile: (text) => ({ kind: 'json', text }),
    createTextFile: (text) => ({ kind: 'manifest', text }),
    createArchive: async (files) => {
      calls.push('create archive');
      return { kind: 'zip', files };
    },
    downloadBlob: (filename, file) => {
      calls.push('download');
      downloads.push({ filename, file });
    }
  };
  return { ports, calls, downloads, isBusy: () => busy };
}

test('report business flow stops the scan, uses fresh evidence and delivers the selected files without a browser', async () => {
  const { exportReport } = await loadBusiness('report/export.js');
  const scenario = makeReportScenario();
  await exportReport('zip', scenario.ports);

  assert.deepEqual(scenario.calls, [
    'stop scan', 'read findings', 'create PDF', 'create archive', 'download'
  ]);
  assert.equal(scenario.isBusy(), false);
  assert.equal(scenario.downloads.length, 1);
  const { filename, file } = scenario.downloads[0];
  assert.equal(filename, 'report-komplet.zip');
  assert.equal(file.kind, 'zip');
  assert.deepEqual(Array.from(file.files, (entry) => entry.name), [
    'report.pdf', 'report-dowody-techniczne.json', 'report-integralnosc.sha256.txt'
  ]);

  const evidence = JSON.parse(file.files[1].blob.text);
  assert.equal(evidence.scan.status, 'stopped');
  assert.equal(evidence.subject.pageUrl, 'https://example.pl/fresh-snapshot');
  assert.equal(file.files[0].blob.options.attachmentText, file.files[1].blob.text);
  assert.match(file.files[2].blob.text, /pdf-hash  report\.pdf/);
});

test('declining report export leaves the active scan and files untouched', async () => {
  const { exportReport } = await loadBusiness('report/export.js');
  const scenario = makeReportScenario();
  scenario.ports.confirmStopScan = () => false;

  await exportReport('pdf', scenario.ports);

  assert.deepEqual(scenario.calls, []);
  assert.deepEqual(scenario.downloads, []);
  assert.equal(scenario.ports.getLatestState().scanning, true);
  assert.equal(scenario.isBusy(), false);
});

test('a file adapter failure releases report progress and never downloads a partial result', async () => {
  const { exportReport } = await loadBusiness('report/export.js');
  const scenario = makeReportScenario();
  scenario.ports.createPdf = () => { throw new Error('PDF adapter failure'); };

  await assert.rejects(exportReport('pdf', scenario.ports), /PDF adapter failure/);

  assert.equal(scenario.isBusy(), false);
  assert.deepEqual(scenario.downloads, []);
});


async function makeScanScenario() {
  const context = vm.createContext({ URL });
  const loader = createModuleLoader(context);
  const load = (name) => loader.load(path.resolve(__dirname, '../src/business/scanning', name));
  const { createScanFlow } = await load('scan-flow.js');
  const { createScanStateStore } = await load('scan-state.js');
  const events = [];
  const stopPasswordInputPolling = () => events.push('stop field observation');
  const store = createScanStateStore({ stopPasswordInputPolling });
  const browser = {};
  for (const step of [
    'enableNetwork', 'enableScriptCapture', 'enableRuntime', 'enablePageEvents',
    'installPasswordBinding', 'installPasswordMonitor', 'disableCache', 'bypassServiceWorker'
  ]) {
    browser[step] = async () => { events.push(step); };
  }
  browser.reloadPage = async () => {
    assert.ok(events.includes('enableNetwork'));
    assert.ok(events.includes('enableScriptCapture'));
    assert.ok(events.includes('installPasswordMonitor'));
    events.push('reload page');
  };

  const flow = createScanFlow({
    ...store,
    browser,
    getActiveTab: async () => ({ id: 42, url: 'https://example.pl/gallery' }),
    attachDebugger: async () => { events.push('attach observation'); },
    detachDebugger: async () => { events.push('detach observation'); },
    setPageInfo: (state, url) => { state.pageUrl = url; },
    updatePageInfoFromRuntime: async () => { events.push('read page address'); },
    scheduleRobotsChecks: () => { events.push('check indexing rules'); },
    pollPasswordInputInfo: async () => { events.push('read password fields'); },
    startPasswordInputPolling: () => { events.push('start field observation'); },
    stopPasswordInputPolling,
    clock: { nowIso: () => '2026-07-19T10:03:00.000Z' }
  });
  return { flow, browser, events, store };
}

test('scan business flow prepares capture before reload and keeps findings when stopped', async () => {
  const { flow, events, store } = await makeScanScenario();
  const started = await flow.startScanWithReload();
  assert.equal(started.scanning, true);
  assert.equal(started.attached, true);
  assert.ok(events.indexOf('reload page') > events.indexOf('read page address'));
  assert.ok(events.indexOf('start field observation') > events.indexOf('reload page'));

  const state = store.ensureState(42);
  state.passwordInputInfo = {
    hasPasswordInputs: true, hasEverPasswordInputs: true, count: 1,
    inputs: [{ id: 'login-password' }], lastChecked: '2026-07-19T10:03:00.000Z'
  };
  const stopped = await flow.stopScan();
  assert.equal(stopped.scanning, false);
  assert.equal(stopped.attached, false);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.scanStartedAt, started.scanStartedAt);
  assert.equal(stopped.passwordAccessTree.passwordInputCount, 1);
  assert.ok(events.includes('detach observation'));
});

test('scan business flow cleans up an interrupted preparation without reloading the page', async () => {
  const { flow, browser, events } = await makeScanScenario();
  browser.installPasswordMonitor = async () => { throw new Error('Observation unavailable'); };

  const result = await flow.startScanWithReload();

  assert.equal(result.scanning, false);
  assert.equal(result.attached, false);
  assert.equal(result.status, 'error');
  assert.equal(result.statusMessage, 'Observation unavailable');
  assert.ok(events.includes('detach observation'));
  assert.ok(!events.includes('reload page'));
});


async function makePopupScenario() {
  const { createPopupSession } = await loadBusiness('popup/session.js');
  const { createPopupFlow } = await loadBusiness('popup/popup-flow.js');
  const session = createPopupSession();
  const messages = [];
  const rendered = [];
  const status = [];
  const state = {
    ...clone(fixture.latestState),
    attached: true,
    scanning: true,
    images: [clone(fixture.image)]
  };
  const scanner = {
    sendMessage: async (type) => { messages.push(type); return state; }
  };
  const display = {
    renderImages: (findings) => rendered.push(findings),
    setStatusText: (text) => status.push(text)
  };
  for (const operation of [
    'renderScripts', 'renderPasswordAccess', 'updateOverview', 'updateCounter',
    'updateStatusMessage', 'updateButtons', 'showActiveView',
    'resetRenderSignatures', 'resetImageRenderSignature'
  ]) display[operation] = () => {};

  const flow = createPopupFlow({
    session,
    scanner,
    display,
    confirmation: { confirmRestart: () => false },
    dimensions: {
      prune: () => {},
      getRecord: () => ({ state: 'loaded', width: 1600, height: 1067, longSide: 1600, passes: true })
    }
  });
  return { flow, session, scanner, state, messages, rendered, status };
}

test('popup business flow shares measured findings with the views and preserves a declined restart', async () => {
  const scenario = await makePopupScenario();
  await scenario.flow.refreshState();

  assert.deepEqual(scenario.messages, ['getState']);
  assert.equal(scenario.session.latestState, scenario.state);
  assert.equal(scenario.session.visibleImages.length, 1);
  assert.equal(scenario.session.visibleImages[0].width, 1600);
  assert.equal(scenario.rendered[0].rows.length, 1);

  scenario.flow.startOrRestartScan();
  assert.deepEqual(scenario.messages, ['getState'], 'declining restart must not send a scan command');
  assert.equal(scenario.session.latestState, scenario.state);
  assert.match(scenario.status.at(-1), /Zachowano dotychczasowe wyniki/);
});

test('popup business flow releases pending controls after a command failure and keeps existing findings', async () => {
  const scenario = await makePopupScenario();
  await scenario.flow.refreshState();
  const findings = scenario.session.visibleImages;
  scenario.scanner.sendMessage = async () => { throw new Error('Scanner unavailable'); };

  await scenario.flow.runAction('stopScan');

  assert.equal(scenario.session.busy, false);
  assert.equal(scenario.session.pendingAction, '');
  assert.equal(scenario.session.visibleImages, findings);
  assert.equal(scenario.status.at(-1), 'Scanner unavailable');
});
