'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const originalRoot = path.join(__dirname, 'fixtures', 'original');
const fixedTime = '2026-07-19T10:03:00.000Z';

class FixedDate extends Date {
  constructor(...values) {
    super(...(values.length ? values : [fixedTime]));
  }

  static now() {
    return new Date(fixedTime).getTime();
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSignal() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    emit(...args) { return listeners.map((listener) => listener(...args)); }
  };
}

function createClock() {
  const timeouts = new Map();
  const intervals = new Map();
  let nextId = 1;
  return {
    intervals,
    setTimeout(callback) {
      const id = nextId++;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(callback, delay) {
      const id = nextId++;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    async settle() {
      // Opróżniamy kolejki jednorazowych wywołań i obietnic bez uruchamiania kolejnych cykli odpytywania.
      for (let pass = 0; pass < 20; pass += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        const pending = [...timeouts.values()];
        timeouts.clear();
        for (const callback of pending) callback();
      }
    }
  };
}

function createContext(extra = {}) {
  const clock = createClock();
  const crypto = {
    subtle: {
      async digest(algorithm, bytes) {
        // Zachowujemy prawdziwy wynik SHA-256, eliminując wpływ kolejności pracy puli wątków.
        const hash = createHash(algorithm.toLowerCase().replace('-', '')).update(Buffer.from(bytes)).digest();
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
      }
    }
  };
  const context = vm.createContext({
    console, URL, Blob, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    DataView, crypto, atob, btoa, Date: FixedDate,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    ...extra
  });
  return { context, clock };
}

function createModuleLoader(context) {
  const modules = new Map();
  async function getModule(filename) {
    const absolute = path.resolve(filename);
    if (!modules.has(absolute)) {
      modules.set(absolute, fs.readFile(absolute, 'utf8').then((source) => new vm.SourceTextModule(source, {
        context,
        identifier: absolute
      })));
    }
    return modules.get(absolute);
  }
  async function load(filename) {
    const module = await getModule(filename);
    if (module.status === 'unlinked') {
      await module.link((specifier, parent) => getModule(path.resolve(path.dirname(parent.identifier), specifier)));
    }
    if (module.status === 'linked') await module.evaluate();
    if (module.status === 'errored') throw module.error;
    return module.namespace;
  }
  return { load };
}

async function loadClassic(context, name) {
  vm.runInContext(await fs.readFile(path.join(originalRoot, name), 'utf8'), context, { filename: name });
}

class Element {
  constructor(tagName = 'div', id = '', document = null) {
    this.tagName = tagName;
    this.id = id;
    this.document = document;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.className = '';
    this.title = '';
    this.textContent = '';
    this.classList = {
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const nextEnabled = enabled === undefined ? !names.has(name) : enabled;
        if (nextEnabled) names.add(name);
        else names.delete(name);
        this.className = [...names].join(' ');
        return nextEnabled;
      },
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false)
    };
  }

  get textContent() { return this.text; }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }
  get firstChild() { return this.children[0] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  dispatch(name) {
    for (const listener of this.listeners.get(name) || []) listener({ target: this });
  }
  append(...children) { for (const child of children) this.appendChild(child); }
  appendChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  click() {
    if (this.tagName === 'a' && this.download) this.document.downloads.push({ filename: this.download, url: this.href });
    this.dispatch('click');
  }
  snapshot() {
    const result = {};
    for (const name of ['tagName', 'id', 'textContent', 'hidden', 'disabled', 'className', 'title', 'href', 'src', 'alt', 'target', 'rel', 'loading', 'decoding', 'width', 'height']) {
      if (this[name] !== undefined) result[name] = this[name];
    }
    result.dataset = { ...this.dataset };
    result.attributes = { ...this.attributes };
    result.children = this.children.map((child) => child.snapshot());
    return result;
  }
}

function createDocument() {
  const elements = new Map();
  const document = {
    downloads: [],
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element('div', id, document));
      return elements.get(id);
    },
    querySelectorAll(selector) { return selector === '.metric-card' ? metricCards : []; },
    createElement(tagName) {
      const element = new Element(tagName, '', document);
      if (tagName === 'canvas') {
        element.getContext = () => ({ fillRect() {}, drawImage() {} });
        element.toDataURL = () => 'data:image/jpeg;base64,/9j/2Q==';
      }
      return element;
    },
    snapshot() {
      return { body: document.body.snapshot(), elements: Object.fromEntries([...elements].map(([id, element]) => [id, element.snapshot()])) };
    }
  };
  const metricCards = ['images', 'scripts', 'password'].map((view) => {
    const card = new Element('button', '', document);
    card.dataset.view = view;
    return card;
  });
  document.body = new Element('body', '', document);
  return document;
}

async function createPopup(original, state, options = {}) {
  const document = createDocument();
  const messages = [];
  const clipboard = [];
  const confirmations = [];
  const blobs = new Map();
  let currentState = clone(state);
  let objectUrlId = 0;
  const manifest = JSON.parse(await fs.readFile(path.join(originalRoot, 'manifest.json'), 'utf8'));
  const { context, clock } = createContext({
    document,
    navigator: { clipboard: { async writeText(text) { clipboard.push(text); } } },
    window: { confirm(message) { confirmations.push(message); return options.confirm !== false; } },
    chrome: { runtime: {
      lastError: null,
      getManifest: () => manifest,
      sendMessage(message, callback) {
        messages.push(clone(message));
        if (options.messageError) { callback({ ok: false, error: options.messageError }); return; }
        if (message.type === 'stopScan') currentState = { ...currentState, attached: false, scanning: false, status: 'stopped' };
        if (message.type === 'startScanWithReload') currentState = { ...currentState, attached: true, scanning: true, status: 'scanning' };
        callback({ ok: true, state: clone(currentState) });
      }
    } }
  });
  context.URL = class BrowserURL extends URL {
    static createObjectURL(blob) {
      const url = 'blob:fixture-' + ++objectUrlId;
      blobs.set(url, blob);
      return url;
    }
    static revokeObjectURL() {}
  };
  context.Image = class ImageProbe extends Element {
    set src(value) {
      this.source = value;
      this.naturalWidth = value.includes('small') ? 100 : 1600;
      this.naturalHeight = value.includes('small') ? 80 : 1067;
      clock.setTimeout(() => this.dispatch(value.includes('broken') ? 'error' : 'load'), 0);
    }
    get src() { return this.source; }
  };
  const modules = createModuleLoader(context);
  if (original) {
    await loadClassic(context, 'report.js');
    await loadClassic(context, 'popup.js');
  } else await modules.load(path.join(projectRoot, 'popup.js'));
  await clock.settle();
  return {
    context, clock, document, messages, clipboard, confirmations, modules,
    snapshot: () => clone(document.snapshot()),
    async click(id) { document.getElementById(id).click(); await clock.settle(); },
    async downloads() {
      return Promise.all(document.downloads.map(async ({ filename, url }) => ({ filename, bytes: Buffer.from(await blobs.get(url).arrayBuffer()) })));
    }
  };
}

async function createBackground(original, options = {}) {
  const onMessage = createSignal();
  const onEvent = createSignal();
  const onDetach = createSignal();
  const onRemoved = createSignal();
  const commands = [];
  const chrome = {
    runtime: { lastError: null, onMessage },
    tabs: { query: async () => [{ id: 42, url: 'https://konto.example.pl/gallery' }], onRemoved },
    debugger: {
      onEvent, onDetach,
      attach(target, version, callback) {
        commands.push(clone({ method: 'attach', target, version }));
        if (options.attachError) chrome.runtime.lastError = { message: options.attachError };
        callback();
        chrome.runtime.lastError = null;
      },
      detach(target, callback) {
        commands.push(clone({ method: 'detach', target }));
        onDetach.emit(target, 'canceled_by_user');
        callback();
      },
      sendCommand(target, method, params, callback) {
        commands.push(clone({ target, method, params }));
        let result = {};
        if (method === 'Runtime.evaluate') {
          result = { result: { value: params.expression.includes('querySelectorAll')
            ? { hasPasswordInputs: true, count: 1, inputs: [{ id: 'password', name: 'password', inputType: 'password' }] }
            : { href: 'https://konto.example.pl/gallery', url: 'https://konto.example.pl/gallery', origin: 'https://konto.example.pl' } } };
        }
        if (method === 'Page.getFrameTree') result = { frameTree: { frame: { id: 'frame-main', url: 'https://konto.example.pl/gallery' } } };
        if (method === 'Network.getResponseBody') result = { body: 'fixture-image-body', base64Encoded: false };
        if (method === 'Network.loadNetworkResource') result = { resource: {
          success: true, httpStatusCode: 200,
          content: params.url.endsWith('/robots.txt') ? 'User-agent: *\nAllow: /\n' : 'fixture-image-body',
          headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' },
          mimeType: 'image/jpeg'
        } };
        callback(result);
      }
    }
  };
  const { context, clock } = createContext({ chrome });
  if (original) await loadClassic(context, 'background.js');
  else await createModuleLoader(context).load(path.join(projectRoot, 'background.js'));
  return {
    clock, commands,
    message(type) {
      return new Promise((resolve) => onMessage.emit({ type }, {}, (response) => resolve(clone(response))));
    },
    event(method, params) { onEvent.emit({ tabId: 42 }, method, clone(params)); },
    detach(reason) { onDetach.emit({ tabId: 42 }, reason); },
    removeTab() { onRemoved.emit(42); }
  };
}

module.exports = {
  projectRoot, originalRoot, fixedTime, FixedDate, clone,
  createContext, createModuleLoader, loadClassic, createPopup, createBackground
};
