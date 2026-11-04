'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { createContext, createModuleLoader, projectRoot } = require('./harness.cjs');

const workerUrl = 'chrome-extension://fixture/background.js';
const imageUrl = 'https://photos.example/private/photo.webp?signature=valid%2Btoken';
const fixtureBytes = Buffer.from([255, 216, 255, 224, 0, 128, 254, 65]);

function signal() {
  const listeners = new Set();
  return {
    listeners,
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    emit(...args) { for (const listener of [...listeners]) listener(...args); }
  };
}

function createDebuggerMock(options = {}) {
  const calls = [];
  const fetches = [];
  const handlers = new Map();
  const jobs = new Map();
  const onEvent = signal();
  const onDetach = signal();
  const state = {
    targets: [
      { id: 'page', type: 'page', url: 'https://photos.example/gallery', attached: true },
      { id: 'other-worker', type: 'service_worker', url: 'chrome-extension://other/background.js', attached: false },
      { id: 'worker', type: 'service_worker', url: workerUrl, attached: false }
    ],
    discoveryError: '', attachError: '', detachError: '', fetchError: '',
    type: 'opaque', status: 200, bytes: fixtureBytes,
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    autoEvents: true, autoFinish: true,
    ...options
  };
  let attachedTarget;
  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ background: { service_worker: 'background.js' } }),
      getURL: (file) => 'chrome-extension://fixture/' + file
    },
    debugger: {
      onEvent, onDetach,
      getTargets(callback) { calls.push({ method: 'getTargets' }); reply(callback, state.targets, state.discoveryError); },
      attach(target, version, callback) {
        calls.push({ method: 'attach', target: { ...target }, version });
        if (!state.attachError) attachedTarget = { ...target };
        reply(callback, undefined, state.attachError);
      },
      detach(target, callback) {
        calls.push({ method: 'detach', target: { ...target } });
        if (handlers.has('detach')) return handlers.get('detach')({ target, callback, reply });
        reply(callback, undefined, state.detachError);
      },
      sendCommand(target, method, params, callback) {
        calls.push({ method, target: { ...target }, params: JSON.parse(JSON.stringify(params)) });
        if (method === 'Network.loadNetworkResource') assert.fail('Nigdy nie używaj transportu, który może wysłać Cookie');
        if (handlers.has(method)) return handlers.get(method)({ target, params, callback, reply });
        if (['Network.enable', 'Network.configureDurableMessages', 'Network.disable', 'Runtime.enable'].includes(method)) return reply(callback, {});
        if (method === 'Network.getResponseBody') {
          if (target.tabId !== undefined) return reply(callback, { body: 'captured-image', base64Encoded: false });
          const job = jobs.get(params.requestId);
          assert.ok(job, 'Body musi należeć do zarejestrowanego żądania własnego workera');
          return reply(callback, { body: Buffer.from(job.bytes).toString('base64'), base64Encoded: true });
        }
        assert.fail('Nieoczekiwane polecenie CDP: ' + method);
      }
    }
  };
  function reply(callback, result, error = '') {
    chrome.runtime.lastError = error ? { message: error } : null;
    try { callback(result); } finally { chrome.runtime.lastError = null; }
  }
  function emit(job, method, params, target = job.target) { onEvent.emit(target, method, params); }
  function start(job) {
    emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: job.url, method: 'GET' } });
    emit(job, 'Network.responseReceived', { requestId: job.id, type: 'Fetch', hasExtraInfo: false, response: {
      url: job.url, status: job.status, mimeType: job.headers['Content-Type'] || 'application/octet-stream', headers: job.headers
    } });
  }
  function finish(job, bytes = job.bytes) {
    job.bytes = bytes;
    emit(job, 'Network.dataReceived', { requestId: job.id, dataLength: bytes.length, encodedDataLength: bytes.length });
    emit(job, 'Network.loadingFinished', { requestId: job.id, encodedDataLength: bytes.length });
  }
  function response(job) {
    return {
      type: job.type, status: job.type === 'opaque' ? 0 : job.status,
      ok: job.type !== 'opaque' && job.status >= 200 && job.status < 300,
      headers: new Headers(job.type === 'opaque' ? {} : job.headers),
      body: job.type === 'opaque' ? null : new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(job.bytes)); controller.close(); }
      })
    };
  }
  async function fetch(url, init) {
    const job = { id: 'request-' + (fetches.length + 1), url: String(url), init, target: { ...attachedTarget },
      bytes: Buffer.from(state.bytes), headers: { ...state.headers }, status: state.status, type: state.type };
    fetches.push(job);
    jobs.set(job.id, job);
    if (state.fetchError) throw new Error(state.fetchError);
    if (state.onFetch) return state.onFetch(job, { start, finish, emit, response });
    if (state.autoEvents) start(job);
    if (state.autoEvents && state.autoFinish) finish(job);
    return response(job);
  }
  return { chrome, fetch, calls, fetches, handlers, jobs, state, start, finish, emit, response, onEvent, onDetach,
    of: (method) => calls.filter((call) => call.method === method),
    emitDetach(target = { targetId: 'worker' }, reason = 'target_closed') { onDetach.emit(target, reason); } };
}

async function createReader(mock = createDebuggerMock(), globals = {}) {
  const { context } = createContext({ chrome: mock.chrome, fetch: mock.fetch, AbortController, Headers, ReadableStream, ...globals });
  const loader = createModuleLoader(context);
  const api = await loader.load(path.join(projectRoot, 'src/technical/background/resource-reader.js'));
  return { mock, api, loader };
}

async function until(predicate) {
  for (let index = 0; index < 50 && !predicate(); index += 1) await new Promise(setImmediate);
  assert.ok(predicate(), 'Oczekiwany stan asynchroniczny nie nastąpił');
}

function controlledTimeouts() {
  const timers = [];
  return { timers, globals: {
    setTimeout(callback, delay) { const timer = { callback, delay, active: true }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.active = false; }
  }, fire(timer) { assert.equal(timer.active, true); timer.active = false; timer.callback(); } };
}

function assertPrivateTransport(mock) {
  assert.equal(mock.of('Network.loadNetworkResource').length, 0);
  assert.ok(mock.calls.filter(({ target }) => target).every(({ target }) => target.targetId && target.tabId === undefined));
  for (const { url, init } of mock.fetches) {
    assert.ok(url.startsWith('https://'));
    assert.equal(init.credentials, 'omit');
    assert.equal(init.mode, 'no-cors');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'follow');
    assert.ok(init.signal instanceof AbortSignal);
  }
}

test('rzeczywisty fetch zawsze pomija credentials, a opaque body i pełne nagłówki pochodzą z CDP własnego workera', async () => {
  const mock = createDebuggerMock({ headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex', 'Access-Control-Allow-Origin': 'https://photos.example', 'X-Custom-Evidence': 'preserved' } });
  const { api } = await createReader(mock);
  const resource = await api.loadWithoutCredentials(42, 'page-frame', imageUrl);
  assertPrivateTransport(mock);
  assert.equal(mock.fetches[0].url, imageUrl, 'Nie zmieniaj podpisu ani query URL');
  assert.deepEqual(mock.of('attach').map(({ target }) => target), [{ targetId: 'worker' }]);
  const limits = { maxTotalBufferSize: 50 * 1024 * 1024, maxResourceBufferSize: 25 * 1024 * 1024 };
  assert.deepEqual(mock.of('Network.enable').map(({ params }) => params), [limits]);
  assert.deepEqual(mock.of('Network.configureDurableMessages').map(({ params }) => params), [limits]);
  assert.equal(resource.status, 200);
  assert.equal(resource.succeeded, true);
  assert.equal(resource.headers['x-robots-tag'], 'noindex');
  assert.equal(resource.headers['access-control-allow-origin'], 'https://photos.example');
  assert.equal(resource.headers['x-custom-evidence'], 'preserved');
  assert.deepEqual(Buffer.from(await api.readResourceBytes(42, resource.body, 100)), fixtureBytes);
  assert.equal(mock.of('detach').length, 1);
  assert.equal(mock.onEvent.listeners.size, 0);
});

test('zarejestrowane body nadal pochodzi z debuggera karty', async () => {
  const { api, mock } = await createReader();
  const captured = await api.readCapturedImageBody(42, 'photo-request');
  assert.equal(new TextDecoder().decode(captured.bytes), 'captured-image');
  assert.deepEqual(mock.calls, [{ method: 'Network.getResponseBody', target: { tabId: 42 }, params: { requestId: 'photo-request' } }]);
  assert.equal(mock.fetches.length, 0);
});

test('pobrania są serializowane i każde sprząta listener oraz połączenie przed kolejnym', async () => {
  let releaseFirst;
  const mock = createDebuggerMock({ onFetch(job, helpers) {
    helpers.start(job);
    if (job.id === 'request-1') return new Promise((resolve) => { releaseFirst = () => { helpers.finish(job); resolve(helpers.response(job)); }; });
    helpers.finish(job);
    return helpers.response(job);
  } });
  const { api } = await createReader(mock);
  const first = api.loadWithoutCredentials(42, 'page-frame', imageUrl);
  const second = api.loadWithoutCredentials(42, 'page-frame', 'https://photos.example/robots.txt');
  await until(() => releaseFirst);
  assert.equal(mock.fetches.length, 1);
  assert.equal(mock.of('attach').length, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(mock.fetches.length, 2);
  assert.equal(mock.of('attach').length, 2);
  assert.equal(mock.of('detach').length, 2);
  const sessionMethods = mock.calls.filter(({ method }) => ['attach', 'detach'].includes(method)).map(({ method }) => method);
  assert.deepEqual(sessionMethods, ['attach', 'detach', 'attach', 'detach']);
  assert.equal(mock.onEvent.listeners.size, 0);
});

for (const stage of ['discovery', 'attach']) test('błąd ' + stage + ' nie pobiera URL, następna próba odkrywa worker ponownie', async () => {
  const mock = createDebuggerMock({ [stage + 'Error']: stage + ' failed' });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), new RegExp(stage + ' failed'));
  assert.equal(mock.fetches.length, 0);
  assert.equal(mock.of('detach').length, 0);
  mock.state[stage + 'Error'] = '';
  assert.equal((await api.loadWithoutCredentials(42, 'frame', imageUrl)).status, 200);
  assertPrivateTransport(mock);
});

test('brak własnego workera nie wybiera strony ani obcego rozszerzenia', async () => {
  const mock = createDebuggerMock();
  const own = mock.state.targets.pop();
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /worker|target/i);
  assert.equal(mock.of('attach').length, 0);
  assert.equal(mock.fetches.length, 0);
  mock.state.targets.push(own);
  await api.loadWithoutCredentials(42, 'frame', imageUrl);
  assert.deepEqual(mock.of('attach')[0].target, { targetId: 'worker' });
});

test('timeout przerywa fetch, czyści listener i zwalnia kolejkę; późne zdarzenia nie psują nowego zadania', async () => {
  const time = controlledTimeouts();
  let releaseFirst;
  const mock = createDebuggerMock({ onFetch(job, helpers) {
    helpers.start(job);
    if (job.id === 'request-1') return new Promise((resolve) => { releaseFirst = () => { helpers.finish(job); resolve(helpers.response(job)); }; });
    helpers.finish(job);
    return helpers.response(job);
  } });
  const { api } = await createReader(mock, time.globals);
  const rejected = assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /timeout|timed out/i);
  const healthy = api.loadWithoutCredentials(42, 'frame', 'https://photos.example/healthy');
  await until(() => releaseFirst && time.timers.some(({ active }) => active));
  const deadline = time.timers.find(({ active, delay }) => active && delay === 15000);
  assert.ok(deadline);
  time.fire(deadline);
  await rejected;
  assert.equal(mock.fetches[0].init.signal.aborted, true);
  assert.equal((await healthy).status, 200);
  const count = mock.calls.length;
  releaseFirst();
  await new Promise(setImmediate);
  assert.equal(mock.calls.length, count, 'Spóźniony callback nie kieruje poleceń do kolejnej sesji');
  assert.equal(mock.of('detach').length, 2);
  assert.equal(mock.onEvent.listeners.size, 0);
  assert.equal(time.timers.filter(({ active }) => active).length, 0);
});

for (const error of ['net::ERR_BLOCKED_BY_RESPONSE', 'net::ERR_NAME_NOT_RESOLVED']) test('błąd fetch jest nieustalonym wynikiem, bez niebezpiecznego fallbacku: ' + error, async () => {
  const mock = createDebuggerMock({ fetchError: error });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), new RegExp(error));
  assert.equal(mock.fetches.length, 1);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  assert.equal(mock.of('detach').length, 1);
  assertPrivateTransport(mock);
});

test('błąd odczytu CDP nie korzysta z loadNetworkResource i sprząta połączenie', async () => {
  const mock = createDebuggerMock();
  mock.handlers.set('Network.getResponseBody', ({ callback, reply }) => reply(callback, undefined, 'body unavailable'));
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /body unavailable/);
  assert.equal(mock.fetches.length, 1);
  assert.equal(mock.of('detach').length, 1);
  assertPrivateTransport(mock);
});

test('zniknięcie targetu kończy próbę, następna odkrywa nowego workera', async () => {
  const mock = createDebuggerMock({ onFetch() { mock.emitDetach(); return new Promise(() => {}); } });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /detach|target|worker|closed/i);
  mock.state.onFetch = undefined;
  mock.state.targets = [{ id: 'replacement', type: 'service_worker', url: workerUrl, attached: false }];
  assert.equal((await api.loadWithoutCredentials(42, 'frame', imageUrl)).status, 200);
  assert.deepEqual(mock.of('attach').at(-1).target, { targetId: 'replacement' });
  assert.equal(mock.fetches.length, 2);
});

test('redirect zachowuje tylko finalne HTTP, MIME i nagłówki; obce zdarzenia są ignorowane', async () => {
  const finalHeaders = { 'Content-Type': 'image/png', 'X-Robots-Tag': 'noindex', 'X-Final': 'yes' };
  const mock = createDebuggerMock({ onFetch(job, helpers) {
    helpers.emit(job, 'Network.responseReceived', { requestId: 'unrelated', response: { status: 418, headers: { 'X-Foreign': 'no' } } }, { tabId: 42 });
    helpers.emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: job.url, method: 'GET' } });
    helpers.emit(job, 'Network.responseReceivedExtraInfo', { requestId: job.id, statusCode: 302, headers: { Location: '/final.png', 'X-Redirect': 'old' } });
    helpers.emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: 'https://photos.example/final.png', method: 'GET' }, redirectResponse: { status: 302, headers: { Location: '/final.png' } }, redirectHasExtraInfo: true });
    helpers.emit(job, 'Network.responseReceived', { requestId: job.id, type: 'Fetch', hasExtraInfo: true, response: { url: 'https://photos.example/final.png', status: 200, mimeType: 'image/png', headers: { 'Content-Type': 'image/png' } } });
    helpers.emit(job, 'Network.responseReceivedExtraInfo', { requestId: job.id, statusCode: 200, headers: finalHeaders });
    helpers.finish(job);
    return helpers.response(job);
  } });
  const { api } = await createReader(mock);
  const resource = await api.loadWithoutCredentials(42, 'frame', imageUrl);
  assert.equal(resource.status, 200);
  assert.equal(resource.mimeType, 'image/png');
  assert.equal(resource.headers['x-final'], 'yes');
  assert.equal(resource.headers['x-robots-tag'], 'noindex');
  assert.equal(resource.headers['x-redirect'], undefined);
  assert.equal(resource.headers['x-foreign'], undefined);
  assertPrivateTransport(mock);
});

test('limit odrzuca zbyt duże opaque body z CDP i przerywa transport', async () => {
  const mock = createDebuggerMock({ bytes: Buffer.alloc(9, 65) });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl, 8), /larger|limit|exceed/i);
  assert.equal(mock.fetches[0].init.signal.aborted, true);
  assert.equal(mock.of('detach').length, 1);
});

test('fetch zakończony po nagłówkach czeka, aż kolektor CDP udostępni kompletne body', async () => {
  const time = controlledTimeouts();
  const mock = createDebuggerMock({ autoFinish: false });
  mock.handlers.set('Network.getResponseBody', ({ callback, reply }) => reply(callback, undefined, 'No data found for resource with given identifier'));
  const { api } = await createReader(mock, time.globals);
  let resolved = false;
  const pending = api.loadWithoutCredentials(42, 'frame', imageUrl).then((result) => { resolved = true; return result; });
  await until(() => mock.of('Network.getResponseBody').length === 1);
  assert.equal(resolved, false, 'Opaque fetch rozwiązuje się po nagłówkach; nie jest dowodem końca transferu');
  mock.handlers.delete('Network.getResponseBody');
  mock.finish(mock.fetches[0]);
  const retry = time.timers.find(({ active, delay }) => active && delay === 50);
  assert.ok(retry);
  time.fire(retry);
  const resource = await pending;
  assert.deepEqual(Buffer.from(await api.readResourceBytes(42, resource.body, 100)), fixtureBytes);
  assert.equal(mock.of('Network.getResponseBody').length, 2);
  assert.equal(mock.of('detach').length, 1);
  assert.equal(time.timers.filter(({ active }) => active).length, 0);
});

test('bez trwałego kolektora nie rozpoczyna fetch ani nie uznaje częściowego body', async () => {
  const mock = createDebuggerMock();
  mock.handlers.set('Network.configureDurableMessages', ({ callback, reply }) => reply(callback, undefined, 'Method not found'));
  mock.handlers.set('Network.enable', ({ params, callback, reply }) => reply(callback, {}, params.enableDurableMessages ? 'Durable bodies unsupported' : ''));
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /Durable bodies unsupported/);
  assert.equal(mock.fetches.length, 0);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  assert.equal(mock.of('detach').length, 1);
  assertPrivateTransport(mock);
});

test('trwale niekompletne body kończy się timeoutem, bez skrótu pustej odpowiedzi', async () => {
  const time = controlledTimeouts();
  const mock = createDebuggerMock({ autoFinish: false });
  mock.handlers.set('Network.getResponseBody', ({ callback, reply }) => reply(callback, undefined, 'No data found for resource with given identifier'));
  const { api } = await createReader(mock, time.globals);
  const pending = assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /timed out/i);
  await until(() => mock.of('Network.getResponseBody').length === 1);
  time.fire(time.timers.find(({ active, delay }) => active && delay === 15000));
  await pending;
  assert.equal(mock.fetches[0].init.signal.aborted, true);
  assert.equal(mock.of('detach').length, 1);
  assert.equal(time.timers.filter(({ active }) => active).length, 0);
});

test('brak body w odpowiedzi CDP jest błędem, a nie pustym poprawnym zasobem', async () => {
  const mock = createDebuggerMock();
  mock.handlers.set('Network.getResponseBody', ({ callback, reply }) => reply(callback, {}));
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /complete response body/);
  assert.equal(mock.of('detach').length, 1);
});

test('brak skorelowanej odpowiedzi CDP nie korzysta z pustego statusu i body opaque', async () => {
  const time = controlledTimeouts();
  const mock = createDebuggerMock({ autoEvents: false });
  const { api } = await createReader(mock, time.globals);
  const rejected = assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl));
  await until(() => mock.fetches.length);
  for (const timer of time.timers.filter(({ active }) => active)) time.fire(timer);
  await rejected;
  assert.equal(mock.of('detach').length, 1);
  assert.equal(mock.of('Network.loadNetworkResource').length, 0);
});

test('basic odpowiedź zachowuje UTF-8 robots.txt i liczy limit w bajtach', async () => {
  const bytes = Buffer.from('ąę');
  const mock = createDebuggerMock({ type: 'basic', bytes, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  mock.handlers.set('Network.getResponseBody', ({ callback, reply }) => reply(callback, { body: 'ąę', base64Encoded: false }));
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', 'https://photos.example/robots.txt', 3), /larger|limit|exceed/i);
  const resource = await api.loadWithoutCredentials(42, 'frame', 'https://photos.example/robots.txt', 4);
  assert.equal(await api.readResourceText(42, resource.body), 'ąę');
  assertPrivateTransport(mock);
});

test('basic fetch czeka na EOF strumienia przed odczytem body z CDP', async () => {
  let controller;
  const mock = createDebuggerMock({ type: 'basic', onFetch(job, helpers) {
    helpers.start(job);
    return { ...helpers.response(job), body: new ReadableStream({ start(value) {
      controller = value;
      controller.enqueue(new Uint8Array(job.bytes.subarray(0, 3)));
    } }) };
  } });
  const { api } = await createReader(mock);
  let resolved = false;
  const pending = api.loadWithoutCredentials(42, 'frame', imageUrl).then((result) => { resolved = true; return result; });
  await until(() => controller);
  await new Promise(setImmediate);
  assert.equal(resolved, false);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  controller.enqueue(new Uint8Array(fixtureBytes.subarray(3)));
  mock.finish(mock.fetches[0]);
  controller.close();
  const resource = await pending;
  assert.deepEqual(Buffer.from(await api.readResourceBytes(42, resource.body, 100)), fixtureBytes);
  assert.equal(mock.of('Network.getResponseBody').length, 1);
});

test('limit podczas czytania basic anuluje strumień i nie odczytuje body CDP', async () => {
  let cancelled = false;
  const mock = createDebuggerMock({ type: 'basic', onFetch(job, helpers) {
    helpers.start(job);
    return { ...helpers.response(job), body: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(9)); },
      cancel() { cancelled = true; }
    }) };
  } });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl, 8), /larger|limit|exceed/i);
  assert.equal(cancelled, true);
  assert.equal(mock.fetches[0].init.signal.aborted, true);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  assert.equal(mock.of('detach').length, 1);
});

test('loadingFailed odrzuca odpowiedź mimo rozwiązania obietnicy fetch', async () => {
  const mock = createDebuggerMock({ onFetch(job, helpers) {
    helpers.start(job);
    helpers.emit(job, 'Network.loadingFailed', { requestId: job.id, errorText: 'net::ERR_BLOCKED_BY_RESPONSE' });
    return helpers.response(job);
  } });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /ERR_BLOCKED_BY_RESPONSE/);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  assert.equal(mock.of('detach').length, 1);
});

for (const [status, expected] of [[403, 'not-found'], [429, 'error'], [503, 'error']]) {
  test('przerwany odczyt robots.txt zachowuje końcowy HTTP ' + status, async () => {
    const mock = createDebuggerMock({ status, onFetch(job, helpers) {
      helpers.start(job);
      helpers.emit(job, 'Network.loadingFailed', { requestId: job.id, errorText: 'net::ERR_ABORTED' });
      return helpers.response(job);
    } });
    const { api, loader } = await createReader(mock);
    const { createRobotsFlow } = await loader.load(path.join(projectRoot, 'src/business/scanning/robots-flow.js'));
    const origin = new URL(imageUrl).origin;
    const state = { attached: true, mainFrameId: 'frame', tabId: 42, robotsChecksByOrigin: new Map(), robotsChecksInFlight: new Set() };
    const flow = createRobotsFlow({ ...api, clock: { nowIso: () => 'now' } });
    flow.scheduleRobotsCheckForImage(state, imageUrl);
    await until(() => !state.robotsChecksInFlight.has(origin));
    const result = state.robotsChecksByOrigin.get(origin);
    assert.equal(result.httpStatusCode, status);
    assert.equal(result.status, expected);
    assert.equal(mock.of('Network.getResponseBody').length, 0);
  });
}

test('brak końcowego ExtraInfo nie pozwala użyć nagłówków przekierowania', async () => {
  const time = controlledTimeouts();
  const mock = createDebuggerMock({ onFetch(job, helpers) {
    helpers.emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: job.url } });
    helpers.emit(job, 'Network.responseReceivedExtraInfo', { requestId: job.id, statusCode: 302, headers: { 'X-Redirect': 'old' } });
    helpers.emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: job.url + '&final=1' }, redirectResponse: { status: 302 }, redirectHasExtraInfo: true });
    helpers.emit(job, 'Network.responseReceived', { requestId: job.id, hasExtraInfo: true, response: { status: 200, mimeType: 'image/jpeg', headers: {} } });
    helpers.finish(job);
    return helpers.response(job);
  } });
  const { api } = await createReader(mock, time.globals);
  const pending = api.loadWithoutCredentials(42, 'frame', imageUrl);
  await until(() => time.timers.some(({ active, delay }) => active && delay === 50));
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  const job = mock.fetches[0];
  mock.emit(job, 'Network.responseReceivedExtraInfo', { requestId: job.id, statusCode: 200, headers: { 'X-Final': 'new' } });
  time.fire(time.timers.find(({ active, delay }) => active && delay === 50));
  const resource = await pending;
  assert.deepEqual({ ...resource.headers }, { 'x-final': 'new' });
});

test('robots.txt: po odrzuceniu fetch przez CORP czekaj na status końcowego żądania', async () => {
  const mock = createDebuggerMock({ onFetch(job, { emit }) {
    emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: job.url } });
    emit(job, 'Network.responseReceivedExtraInfo', { requestId: 'unrelated', statusCode: 404 });
    emit(job, 'Network.responseReceivedExtraInfo', { requestId: job.id, statusCode: 302 });
    emit(job, 'Network.requestWillBeSent', { requestId: job.id, type: 'Fetch', request: { url: job.url + '?final' },
      redirectResponse: { status: 302 }, redirectHasExtraInfo: true });
    throw new TypeError('Failed to fetch');
  } });
  const { api } = await createReader(mock);
  const pending = api.loadWithoutCredentials(42, 'frame', 'https://photos.example/robots.txt', 1024, { skipHttpErrorBody: true });
  await until(() => mock.fetches.length > 0);
  const job = mock.fetches[0];
  mock.emit(job, 'Network.responseReceivedExtraInfo', { requestId: job.id, statusCode: 403, headers: { 'X-Final': 'yes' } });
  const resource = await pending;
  assert.equal(resource.status, 403);
  assert.equal(resource.headers['x-final'], 'yes');
  assert.equal(resource.succeeded, false);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
});

test('robots.txt: zakończ po nagłówkach 403 także gdy duża odpowiedź nigdy się nie kończy', async () => {
  const mock = createDebuggerMock({ status: 403, onFetch(job, { start, emit }) {
    start(job);
    emit(job, 'Network.dataReceived', { requestId: job.id, dataLength: 1048576 });
    return new Promise((_, reject) => job.init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  const { api } = await createReader(mock);
  const resource = await api.loadWithoutCredentials(42, 'frame', 'https://photos.example/robots.txt', 262144, { skipHttpErrorBody: true });
  assert.equal(resource.status, 403);
  assert.equal(resource.succeeded, false);
  assert.equal(mock.fetches[0].init.signal.aborted, true);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
});

test('niejednoznaczne równoległe żądanie tego samego URL kończy się bez ustalenia', async () => {
  const mock = createDebuggerMock({ onFetch(job, helpers) {
    helpers.start(job);
    helpers.emit(job, 'Network.requestWillBeSent', { requestId: 'unrelated', type: 'Fetch', request: { url: job.url } });
    helpers.finish(job);
    return helpers.response(job);
  } });
  const { api } = await createReader(mock);
  await assert.rejects(api.loadWithoutCredentials(42, 'frame', imageUrl), /unambiguously/);
  assert.equal(mock.of('Network.getResponseBody').length, 0);
  assert.equal(mock.of('detach').length, 1);
});

for (const url of ['file:///private.jpg', 'data:image/png;base64,AA==', 'javascript:void(0)', 'https://user:password@photos.example/private.jpg']) {
  test('odrzuca URL przed połączeniem: ' + url, async () => {
    const { api, mock } = await createReader();
    await assert.rejects(api.loadWithoutCredentials(42, 'frame', url));
    assert.equal(mock.calls.length, 0);
    assert.equal(mock.fetches.length, 0);
  });
}

for (const status of [200, 401, 403]) test('rzeczywisty status HTTP ' + status + ' jest zachowany mimo statusu 0 wrappera opaque', async () => {
  const mock = createDebuggerMock({ status });
  const { api, loader } = await createReader(mock);
  const resource = await api.loadWithoutCredentials(42, 'frame', imageUrl);
  const { assessImageBodyComparison } = await loader.load(path.join(projectRoot, 'src/business/scanning/image-comparison-rules.js'));
  const comparison = assessImageBodyComparison({ originalLength: 1, publicLength: 1, originalSha256: 'hash', publicSha256: 'hash', originalStatus: 200, publicStatus: resource.status });
  assert.equal(resource.status, status);
  assert.equal(comparison.improperAuthorization, status === 200);
});
