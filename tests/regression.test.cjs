'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fixture = require('./fixtures/findings.cjs');
const {
  projectRoot, originalRoot, FixedDate, clone, createContext,
  createModuleLoader, loadClassic, createPopup, createBackground
} = require('./harness.cjs');

const { emptyState, fullState, popupCases } = require('./fixtures/states.cjs');

test('static appearance and extension permissions are preserved', async () => {
  const [oldCss, css, oldHtml, html, oldManifest, manifest] = await Promise.all([
    fs.readFile(path.join(originalRoot, 'popup.css'), 'utf8'),
    fs.readFile(path.join(projectRoot, 'popup.css'), 'utf8'),
    fs.readFile(path.join(originalRoot, 'popup.html'), 'utf8'),
    fs.readFile(path.join(projectRoot, 'popup.html'), 'utf8'),
    fs.readFile(path.join(originalRoot, 'manifest.json'), 'utf8'),
    fs.readFile(path.join(projectRoot, 'manifest.json'), 'utf8')
  ]);
  const newRules = /(?:body\[data-risk="unknown"\] \.risk-hero|\.security-wheel\[data-state="uncertain"\](?: small)?|\.password-group \.password-unknown) \{[^}]*\}\r?\n\r?\n/g;
  assert.equal([...css.matchAll(newRules)].length, 4, 'Only the four styles for unknown password access are added');
  assert.equal(css.replace(newRules, ''), oldCss, 'Existing CSS remains byte-for-byte identical');
  const withoutScripts = (value) => value.replace(/\s*<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/\r\n/g, '\n').trim();
  assert.equal(withoutScripts(html), withoutScripts(oldHtml), 'Visible HTML must remain identical');
  const actual = JSON.parse(manifest);
  const expected = JSON.parse(oldManifest);
  delete actual.background.type;
  assert.deepEqual(actual, expected, 'Only the background module loading mode may change');
});


// Zmień wyłącznie teksty, które wcześniej przypisywały wszystkim ramkom kontekst strony głównej.
function expectedFrameAwarePopupSnapshot(snapshot) {
  const expected = clone(snapshot);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.title === 'Obca domena działa albo mogłaby działać w kontekście tej strony.') {
      value.title = 'Skrypty z tej domeny wykryto na stronie lub w jej ramkach; część mogła zostać zablokowana lokalnie.';
    }
    const oldCorsTitle = /^Obca domena działa albo działałaby bez blokady w kontekście strony\. Dowód: JavaScript strony może odczytać (\d+) zdjęcie\/zdjęcia bez poprawnej autoryzacji użytkownika(.*)\.$/.exec(value.title || '');
    if (oldCorsTitle) value.title = 'Ocena originów kontekstów wykonania i nagłówków odpowiedzi wskazuje możliwość odczytu ' + oldCorsTitle[1] + ' zdjęcia/zdjęć przez co najmniej jeden skrypt z tej domeny' + oldCorsTitle[2] + '. To możliwość techniczna, nie obserwacja odczytu.';
    if (value.id === 'riskSummaryText') value.textContent = value.textContent.replace(/^(\d+) domen zewnętrznych działa lub mogłoby działać w kontekście tej strony\.$/, '$1 domen zewnętrznych wykryto na stronie lub w jej ramkach.');
    if (value.id === 'riskMeaningText' && value.textContent === 'Sama obecność domeny nie przesądza o naruszeniu, ale pokazuje, komu strona przekazuje część swojego kontekstu.') {
      value.textContent = 'Sama obecność domeny nie potwierdza dostępu do głównego dokumentu ani naruszenia. Szczegóły rozróżniają możliwość dostępu do zdjęć i wynik nieustalony.';
    }
    Object.values(value).forEach(visit);
  }
  visit(expected);
  return expected;
}

for (const [name, state] of popupCases) {
  test('popup renders the same DOM: ' + name, async () => {
    const before = await createPopup(true, state);
    const after = await createPopup(false, state);
    assert.deepEqual(after.snapshot(), expectedFrameAwarePopupSnapshot(before.snapshot()));
    for (const tab of ['scriptsTab', 'passwordTab', 'imagesTab']) {
      await before.click(tab);
      await after.click(tab);
      assert.deepEqual(after.snapshot(), expectedFrameAwarePopupSnapshot(before.snapshot()), tab);
    }
    assert.deepEqual(after.messages, before.messages);
  });
}

test('popup preserves copy, JSON and CSV export contents', async () => {
  const before = await createPopup(true, fullState());
  const after = await createPopup(false, fullState());
  for (const button of ['copyImageLinksButton', 'copyThirdPartyButton', 'exportImagesButton', 'exportScriptsJsonButton', 'exportScriptsCsvButton']) {
    await before.click(button);
    await after.click(button);
  }
  assert.deepEqual(after.clipboard, before.clipboard);
  assert.equal(after.clipboard.length, 2);
  assert.deepEqual(await after.downloads(), await before.downloads());
  assert.equal((await after.downloads()).length, 3);
});

test('PNG spełniający warunki trafia do widoku, podsumowania, schowka oraz JSON, PDF i ZIP', async () => {
  // Atrapa Image symuluje wymiary i błędy; podgląd PNG jest wejściem adaptera raportu.
  const png = {
    ...clone(fixture.image),
    url: 'https://cdn.example.net/photo.png',
    mimeType: 'image/png',
    headers: { ...clone(fixture.image.headers), 'content-type': 'image/png' },
    previewDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='
  };
  delete png.reportPreviewJpeg;
  const withoutPreview = { ...png, previewDataUrl: '' };
  const images = [
    png,
    { ...withoutPreview, url: 'https://cdn.example.net/small.png' },
    { ...withoutPreview, url: 'https://cdn.example.net/broken.png' },
    { ...withoutPreview, url: 'https://cdn.example.net/private.png', bodyComparison: { improperAuthorization: false } },
    { ...withoutPreview, url: 'https://cdn.example.net/icon.webp', mimeType: 'image/webp' }
  ];
  const state = emptyState({ ...clone(fixture.latestState), status: 'stopped', scanning: false, attached: false, images, imageCount: images.length });
  const app = await createPopup(false, state);
  const tiles = app.document.getElementById('resultsGrid').children;
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].href, png.url);
  assert.equal(tiles[0].children[0].src, png.previewDataUrl);
  assert.equal(app.document.getElementById('summaryAuthorizationImages').textContent, '1');

  await app.click('copyImageLinksButton');
  assert.deepEqual(app.clipboard, [png.url]);
  for (const button of ['exportImagesButton', 'exportPdfButton', 'exportReportZipButton']) await app.click(button);

  const downloads = await app.downloads();
  assert.equal(downloads.length, 3);
  const json = downloads.find(({ filename }) => filename.endsWith('.json'));
  const pdf = downloads.find(({ filename }) => filename.endsWith('.pdf'));
  const zip = downloads.find(({ filename }) => filename.endsWith('.zip'));
  const exportedImages = JSON.parse(json.bytes.toString());
  assert.equal(exportedImages.length, 1);
  assert.equal(exportedImages[0].url, png.url);
  assert.equal(exportedImages[0].mimeType, 'image/png');
  assert.deepEqual(exportedImages[0].bodyComparison, png.bodyComparison);
  assert.equal(exportedImages[0].previewDataUrl, undefined);
  assert.equal(pdf.bytes.subarray(0, 8).toString(), '%PDF-1.7');
  assert.ok(pdf.bytes.includes(Buffer.from('/DCTDecode')), 'Podgląd do PDF jest kodowany jako JPEG');
  assert.ok(pdf.bytes.includes(Buffer.from(png.url)), 'PDF zawiera dowód źródłowego PNG');

  // Zapis ZIP używa nieskompresowanych wpisów; odczytujemy ich faktyczną treść.
  const entries = new Map();
  let offset = 0;
  while (zip.bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(zip.bytes.readUInt16LE(offset + 8), 0);
    const size = zip.bytes.readUInt32LE(offset + 18);
    const nameLength = zip.bytes.readUInt16LE(offset + 26);
    const extraLength = zip.bytes.readUInt16LE(offset + 28);
    const name = zip.bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, zip.bytes.subarray(start, start + size));
    offset = start + size;
  }
  assert.equal(entries.size, 3);
  const evidenceEntry = [...entries].find(([name]) => name.endsWith('.json'));
  const evidence = JSON.parse(evidenceEntry[1].toString());
  const findings = evidence.findings.improperAuthorizationImages;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].url, png.url);
  assert.equal(findings[0].mimeType, 'image/png');
  assert.deepEqual(findings[0].bodyComparison, png.bodyComparison);
  assert.equal(findings[0].reportPreviewJpeg, undefined);
  assert.equal(evidence.summary.improperAuthorizationImages, 1);
  const manifest = [...entries].find(([name]) => name.endsWith('.txt'))[1].toString();
  for (const [name, bytes] of entries) {
    if (name.endsWith('.pdf') || name.endsWith('.json')) {
      assert.ok(manifest.includes(createHash('sha256').update(bytes).digest('hex') + '  ' + name));
    }
  }
});

test('popup preserves start, stop and declined restart behavior', async () => {
  for (const confirm of [true, false]) {
    const state = { ...fullState(), attached: true, scanning: true, status: 'scanning' };
    const before = await createPopup(true, state, { confirm });
    const after = await createPopup(false, state, { confirm });
    for (const button of ['startButton', 'stopButton', 'startButton']) {
      await before.click(button);
      await after.click(button);
      assert.deepEqual(after.snapshot(), expectedFrameAwarePopupSnapshot(before.snapshot()));
    }
    assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(after.confirmations, before.confirmations);
  }
});

test('popup preserves message failure feedback', async () => {
  const options = { messageError: 'Fixture connection failure' };
  const before = await createPopup(true, fullState(), options);
  const after = await createPopup(false, fullState(), options);
  assert.deepEqual(after.snapshot(), expectedFrameAwarePopupSnapshot(before.snapshot()));
  await before.click('startButton');
  await after.click('startButton');
  assert.deepEqual(after.snapshot(), expectedFrameAwarePopupSnapshot(before.snapshot()));
});

async function backgroundScenario(original) {
  const app = await createBackground(original);
  const states = [await app.message('getState'), await app.message('startScanWithReload')];
  app.event('Page.frameNavigated', { frame: { id: 'frame-main', url: 'https://konto.example.pl/gallery' } });
  app.event('Runtime.executionContextCreated', { context: { id: 1, origin: 'https://konto.example.pl', auxData: { frameId: 'frame-main', isDefault: true } } });
  for (const [scriptId, url] of [
    ['same-origin', 'https://konto.example.pl/app.js'],
    ['same-site', 'https://static.example.pl/app.js'],
    ['third-party', 'https://analytics.example.com/tracker.js'],
    ['inline', ''],
    ['browser', 'chrome-extension://fixture/injected.js']
  ]) app.event('Debugger.scriptParsed', { scriptId, url, executionContextId: 1, startLine: 0, endLine: 12, hash: 'fixture-script-hash' });
  app.event('Network.requestWillBeSent', { requestId: 'blocked', type: 'Script', request: { url: 'https://ads.example.net/blocked.js', method: 'GET' } });
  app.event('Network.loadingFailed', { requestId: 'blocked', type: 'Script', errorText: 'net::ERR_BLOCKED_BY_CLIENT', blockedReason: 'inspector' });
  app.event('Network.requestWillBeSent', { requestId: 'photo', type: 'Image', request: { url: 'https://cdn.example.net/photo.jpg', method: 'GET' } });
  app.event('Network.responseReceived', { requestId: 'photo', type: 'Image', response: {
    url: 'https://cdn.example.net/photo.jpg', status: 200, mimeType: 'image/jpeg',
    headers: { 'cache-control': 'public, max-age=60' }, fromDiskCache: false, fromServiceWorker: false
  } });
  app.event('Network.loadingFinished', { requestId: 'photo', encodedDataLength: 18 });
  app.event('Network.requestServedFromCache', { requestId: 'photo' });
  const passwordEvent = {
    name: '__networkAssetInspectorPasswordAccess', executionContextId: 1,
    payload: JSON.stringify({
      kind: 'password.value.get', detail: 'read input.value',
      target: { tagName: 'input', id: 'password', name: 'password', inputType: 'password' },
      pageUrl: 'https://konto.example.pl/gallery',
      stack: 'Error\n at report (__network_asset_inspector_password_monitor.js:1:1)\n at readForm (https://analytics.example.com/tracker.js:211:18)'
    })
  };
  app.event('Runtime.bindingCalled', passwordEvent);
  app.event('Runtime.bindingCalled', passwordEvent);
  app.event('Runtime.bindingCalled', { name: passwordEvent.name, payload: '{invalid JSON' });
  await app.clock.settle();
  states.push(await app.message('getState'));
  states.push(await app.message('stopScan'));
  states.push(await app.message('getState'));
  states.push(await app.message('unsupported-fixture-message'));
  return { states, commands: app.commands, intervals: [...app.clock.intervals.values()].map(({ delay }) => delay) };
}

function expectedContextAwareResponse(response) {
  const expected = clone(response);
  const scriptTree = expected.state && expected.state.scriptTree;
  if (scriptTree) {
    for (const group of [...scriptTree.groups, ...scriptTree.thirdPartyGroups]) {
      const executed = group.scripts.filter((script) => !script.blockedByClient).length;
      const unknown = expected.state.images.some((image) => image.bodyComparison?.improperAuthorization) ? group.blockedCount : 0;
      if (!executed) {
        group.corsPixelAccess = { possible: false, imageCount: 0, imageDomains: [], modes: [], accessControlAllowOrigins: [] };
        group.corsPixelAccessImageCount = 0;
      }
      Object.assign(group.corsPixelAccess, {
        unknownScriptCount: unknown, assessedScriptCount: executed,
        executionOrigins: executed ? ['https://konto.example.pl'] : []
      });
    }
    scriptTree.thirdPartyCorsPixelAccessDomainsCount = scriptTree.thirdPartyGroups.filter((group) => group.corsPixelAccess.possible).length;
    scriptTree.thirdPartyCorsPixelAccessImageCount = scriptTree.thirdPartyCorsPixelAccessDomainsCount > 0 ? 1 : 0;
    scriptTree.thirdPartyCorsPixelAccessUnknownDomainsCount = scriptTree.thirdPartyGroups.filter((group) => group.corsPixelAccess.unknownScriptCount > 0).length;
  }
  const tree = expected.state && expected.state.scanStartedAt && expected.state.passwordAccessTree;
  if (!tree) return expected;
  tree.unknownScripts = 0;
  tree.unknownDomainsCount = 0;
  for (const group of tree.groups) {
    group.unknownCount = 0;
    for (const access of group.accesses) {
      access.accessScope = access.blockedByClient ? 'unknown' : 'accessible';
      if (access.blockedByClient) {
        access.detail = 'Access to the document containing password fields has not been established for this execution context.';
        access.target = {};
        group.unknownCount += 1;
        tree.unknownScripts += 1;
        tree.potentialScripts -= 1;
      }
    }
    group.accessScope = group.accesses.every((access) => access.accessScope === 'unknown') ? 'unknown' : 'accessible';
    if (group.accessScope === 'unknown') tree.unknownDomainsCount += 1;
  }
  return expected;
}

test('background preserves CDP commands, filtering, body comparisons, password deduplication and stop state', async () => {
  const before = await backgroundScenario(true);
  const after = await backgroundScenario(false);
  assert.deepEqual(after, { ...before, states: before.states.map(expectedContextAwareResponse) });
  const result = after.states[2].state;
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].bodyComparison.exactMatch, true);
  assert.equal(result.scriptTree.thirdPartyDomainsCount, 2);
  assert.equal(result.passwordAccesses[0].count, 2);
  assert.equal(after.states[3].state.scanning, false);
});

test('background preserves attach failure, unexpected detach and closed tab behavior', async () => {
  for (const options of [{ attachError: 'Another debugger is attached' }, {}]) {
    const before = await createBackground(true, options);
    const after = await createBackground(false, options);
    assert.deepEqual(await after.message('startScanWithReload'), expectedContextAwareResponse(await before.message('startScanWithReload')));
    before.detach('target_closed');
    after.detach('target_closed');
    assert.deepEqual(await after.message('getState'), expectedContextAwareResponse(await before.message('getState')));
    before.removeTab();
    after.removeTab();
    assert.deepEqual(await after.message('getState'), expectedContextAwareResponse(await before.message('getState')));
  }
});

async function reportArtifacts(original, evidenceOverride, itemsOverride) {
  const manifest = JSON.parse(await fs.readFile(path.join(originalRoot, 'manifest.json'), 'utf8'));
  const { context } = createContext({
    chrome: { runtime: { getManifest: () => manifest } },
    latestState: clone(fixture.latestState), MIN_IMAGE_LONG_SIDE: 200, riskCopy: fixture.riskCopy
  });
  let api;
  if (original) {
    await loadClassic(context, 'report.js');
    api = vm.runInContext('({ buildEvidencePayload, getFindingReportItems, createPdfBlob, createZipBlob })', context);
  } else {
    const loader = createModuleLoader(context);
    api = Object.assign({},
      await loader.load(path.join(projectRoot, 'src/composition/report.js')),
      await loader.load(path.join(projectRoot, 'src/technical/report/document.js')),
      await loader.load(path.join(projectRoot, 'src/technical/report/pdf/encoder.js')),
      await loader.load(path.join(projectRoot, 'src/technical/report/zip.js'))
    );
  }
  const generatedAt = new FixedDate();
  const reportId = 'RODO-example-pl-2026-07-19_12-03-00';
  const payload = api.buildEvidencePayload(clone(fixture.reportStats), clone(fixture.summary), generatedAt, reportId, clone(fixture.latestState));
  const evidence = evidenceOverride || JSON.stringify(payload);
  const sha256 = createHash('sha256').update(evidence).digest('hex');
  const reportContext = { generatedAt, reportId, pageUrl: fixture.latestState.pageUrl, summary: clone(fixture.summary), evidenceSha256: sha256, attachmentSha256: sha256 };
  const items = itemsOverride || api.getFindingReportItems(clone(fixture.reportStats), reportContext, {
    getLatestState: () => clone(fixture.latestState), riskCopy: fixture.riskCopy, minImageLongSide: 200
  });
  const pdf = api.createPdfBlob(items, { generatedAt, reportId, domain: 'example.pl', attachmentName: 'dowody-techniczne.json', attachmentText: evidence.replace(/[\u007f-\uffff]/g, (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')) });
  const zip = await api.createZipBlob([
    { name: 'raport.pdf', blob: pdf },
    { name: 'dowody-techniczne.json', blob: new Blob([evidence]) },
    { name: 'integralnosc.sha256.txt', blob: new Blob([sha256 + '  dowody-techniczne.json\n']) }
  ], generatedAt);
  return { evidence, items: clone(items), pdf: Buffer.from(await pdf.arrayBuffer()), zip: Buffer.from(await zip.arrayBuffer()) };
}

function assertUpdatedContextEvidence(actual, expected) {
  const projected = clone(actual);
  assert.match(projected.methodology.passwordAccess, /Potential access is tied to execution contexts/);
  assert.match(projected.methodology.passwordAccess, /Isolated contexts are excluded/);
  assert.match(projected.methodology.passwordAccess, /reported as unknown/);
  assert.equal(projected.findings.password.unknownScripts, 0);
  assert.equal(projected.findings.password.unknownDomainsCount, 0);
  projected.methodology.passwordAccess = expected.methodology.passwordAccess;
  delete projected.findings.password.unknownScripts;
  delete projected.findings.password.unknownDomainsCount;
  if ('passwordUnknownDomains' in projected.summary) {
    assert.equal(projected.summary.passwordUnknownDomains, 0);
    delete projected.summary.passwordUnknownDomains;
  }
  assert.match(projected.methodology.imagePixelAccess, /separately for each live script execution context/);
  assert.match(projected.methodology.imagePixelAccess, /an isolated frame may still have independent access/);
  assert.match(projected.methodology.imagePixelAccess, /not an observed image read/);
  delete projected.methodology.imagePixelAccess;
  if ('corsPixelUnknownDomains' in projected.summary) {
    assert.equal(projected.summary.corsPixelUnknownDomains, 0);
    delete projected.summary.corsPixelUnknownDomains;
  }
  delete projected.integrity;
  const previous = clone(expected);
  delete previous.integrity;
  assert.deepEqual(projected, previous);
}

test('report retains evidence and encoding with corrected context explanations', async () => {
  const before = await reportArtifacts(true);
  const after = await reportArtifacts(false);
  assertUpdatedContextEvidence(JSON.parse(after.evidence), JSON.parse(before.evidence));
  // Zmieniono tytuł sekcji oraz dodano dokładnie dwa wiersze wyjaśnienia. Pozostała treść jest identyczna.
  const originalRendering = await reportArtifacts(true, after.evidence);
  const expectedItems = originalRendering.items.flatMap((item) => {
    if (item.text === '3. Domeny zewnętrzne z dostępem do strony - CWE-830 / CWE-942') {
      return [{ ...item, text: '3. Domeny zewnętrzne na stronie i w ramkach - CWE-830 / CWE-942' }];
    }
    if (item.text === 'CORS/pixel: możliwe=TAK; obrazy=1; tryby=wildcard-acao; domeny zdjęć=cdn.example.net.') {
      return [item,
        { ...item, text: 'Możliwość wynika z oceny originów kontekstów wykonania i nagłówków odpowiedzi; dotyczy co najmniej jednego skryptu z' },
        { ...item, text: 'tej domeny. Nie potwierdza odczytu zdjęć.' }
      ];
    }
    return [item];
  });
  assert.deepEqual(after.items, expectedItems);
  // Oryginalny renderer otrzymuje identyczną treść: PDF i ZIP muszą być zgodne bajt po bajcie.
  const originalEncoding = await reportArtifacts(true, after.evidence, expectedItems);
  assert.deepEqual(after.pdf, originalEncoding.pdf);
  assert.deepEqual(after.zip, originalEncoding.zip);
  assert.equal(after.pdf.subarray(0, 8).toString(), '%PDF-1.7');
  assert.equal(after.zip.readUInt32LE(0), 0x04034b50);
  assert.ok(after.pdf.length > 10000);
});

test('PDF and ZIP buttons preserve exported files and active-scan confirmation', async () => {
  for (const confirm of [true, false]) {
    const state = { ...fullState(), attached: true, scanning: true, status: 'scanning' };
    const before = await createPopup(true, state, { confirm });
    const after = await createPopup(false, state, { confirm });
    for (const button of ['exportPdfButton', 'exportReportZipButton']) {
      await before.click(button);
      await after.click(button);
    }
    const previousDownloads = await before.downloads();
    const downloads = await after.downloads();
    assert.deepEqual(downloads.map(({ filename }) => filename), previousDownloads.map(({ filename }) => filename));
    if (confirm) {
      const readZip = (bytes) => {
        const entries = new Map();
        let offset = 0;
        while (bytes.readUInt32LE(offset) === 0x04034b50) {
          assert.equal(bytes.readUInt16LE(offset + 8), 0);
          const size = bytes.readUInt32LE(offset + 18);
          const nameLength = bytes.readUInt16LE(offset + 26);
          const start = offset + 30 + nameLength + bytes.readUInt16LE(offset + 28);
          entries.set(bytes.subarray(offset + 30, offset + 30 + nameLength).toString(), bytes.subarray(start, start + size));
          offset = start + size;
        }
        return entries;
      };
      const entries = readZip(downloads[1].bytes);
      const previousEntries = readZip(previousDownloads[1].bytes);
      assert.deepEqual([...entries.keys()], [...previousEntries.keys()]);
      const jsonName = [...entries.keys()].find((name) => name.endsWith('.json'));
      assertUpdatedContextEvidence(JSON.parse(entries.get(jsonName)), JSON.parse(previousEntries.get(jsonName)));
      const manifest = [...entries].find(([name]) => name.endsWith('.txt'))[1].toString();
      for (const [name, bytes] of entries) {
        if (name.endsWith('.pdf') || name.endsWith('.json')) assert.ok(manifest.includes(createHash('sha256').update(bytes).digest('hex') + '  ' + name));
      }
      assert.equal(downloads[0].bytes.subarray(0, 8).toString(), '%PDF-1.7');
      assert.deepEqual(downloads[0].bytes, entries.get(downloads[0].filename));
    }
    assert.equal((await after.downloads()).length, confirm ? 2 : 0);
    assert.deepEqual(after.confirmations, before.confirmations);
    assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(after.snapshot(), expectedFrameAwarePopupSnapshot(before.snapshot()));
  }
});
