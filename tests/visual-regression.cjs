'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixtures = require('./fixtures/findings.cjs');

const projectRoot = path.resolve(__dirname, '..');
const originalRoot = path.join(__dirname, 'fixtures/original');
const outputDirectory = path.join(projectRoot, 'tmp/readability-visual');

const emptyScripts = {
  pageUrl: '',
  pageOrigin: '',
  totalScripts: 0,
  thirdPartyScriptsCount: 0,
  thirdPartyDomainsCount: 0,
  thirdPartyCorsPixelAccessDomainsCount: 0,
  groups: [],
  thirdPartyGroups: []
};
const emptyPasswords = {
  hasPasswordInputs: false,
  hasEverPasswordInputs: false,
  passwordInputCount: 0,
  totalAccesses: 0,
  totalValueAccesses: 0,
  groups: []
};
const emptyState = {
  status: 'idle',
  scanning: false,
  attached: false,
  images: [],
  scriptTree: emptyScripts,
  passwordAccessTree: emptyPasswords
};
const findingsState = {
  ...fixtures.latestState,
  images: [{
    ...fixtures.image,
    previewDataUrl: fixtures.image.reportPreviewJpeg.dataUrl
  }],
  scriptTree: {
    ...emptyScripts,
    pageUrl: fixtures.latestState.pageUrl,
    pageOrigin: fixtures.latestState.pageOrigin,
    totalScripts: 2,
    thirdPartyScriptsCount: 2,
    thirdPartyDomainsCount: 1,
    thirdPartyCorsPixelAccessDomainsCount: 1,
    corsPixelAccess: { imageCount: 1 },
    groups: [fixtures.scriptGroup],
    thirdPartyGroups: [fixtures.scriptGroup]
  },
  scripts: fixtures.scriptGroup.scripts,
  passwordAccessTree: fixtures.reportStats.passwordTree
};

const scenarios = [
  { name: 'idle', state: emptyState, tab: 'imagesTab' },
  { name: 'stopped-images', state: findingsState, tab: 'imagesTab' },
  { name: 'stopped-scripts', state: findingsState, tab: 'scriptsTab' },
  { name: 'stopped-password', state: findingsState, tab: 'passwordTab' },
  {
    name: 'scanning',
    state: { ...findingsState, status: 'scanning', scanning: true, attached: true },
    tab: 'imagesTab'
  },
  {
    name: 'error',
    state: {
      ...findingsState,
      status: 'error',
      statusMessage: 'Could not attach debugger: fixture'
    },
    tab: 'imagesTab'
  },
  {
    name: 'no-findings',
    state: {
      ...emptyState,
      status: 'stopped',
      scanStartedAt: fixtures.latestState.scanStartedAt
    },
    tab: 'imagesTab'
  }
];

function getContentType(filename) {
  if (filename.endsWith('.js')) return 'text/javascript';
  if (filename.endsWith('.css')) return 'text/css';
  return 'text/html';
}

// Udostępniamy każdą wersję z jej własnego katalogu głównego, bez serwera ani zewnętrznych żądań.
async function serveFixture(route, directory) {
  const pathname = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  const filename = path.resolve(directory, pathname);
  assert.ok(filename.startsWith(path.resolve(directory) + path.sep), 'Invalid fixture path');

  try {
    await route.fulfill({
      body: await fs.readFile(filename),
      contentType: getContentType(filename)
    });
  } catch (error) {
    await route.fulfill({ status: 404, body: 'Missing fixture' });
  }
}

async function capturePopup(browser, scenario, variant, directory) {
  const context = await browser.newContext({
    viewport: { width: 800, height: 760 },
    deviceScaleFactor: 1,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    reducedMotion: 'reduce'
  });

  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await context.route('http://readability.test/**', (route) => serveFixture(route, directory));

    // Obie implementacje otrzymują dokładnie tę samą odpowiedź Chrome.
    await page.addInitScript(({ state }) => {
      globalThis.chrome = {
        runtime: {
          lastError: null,
          getManifest: () => ({ name: 'Bezpieczny wizerunek', version: '2.1.16' }),
          sendMessage: (_message, callback) => callback({ ok: true, state })
        }
      };
    }, { state: scenario.state });

    await page.goto('http://readability.test/popup.html');
    await page.waitForFunction(() => document.body.dataset.risk);
    if (scenario.state.images.length) {
      await page.waitForSelector('.image-tile img');
    }
    await page.locator('#' + scenario.tab).click();

    // Czekamy na ułożenie tekstu i narysowanie strony, aby nie polegać na stałym opóźnieniu.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    });
    assert.deepEqual(pageErrors, [], scenario.name + ' ' + variant + ' page errors');

    return await page.screenshot({
      path: path.join(outputDirectory, scenario.name + '-' + variant + '.png'),
      fullPage: true,
      animations: 'disabled'
    });
  } finally {
    await context.close();
  }
}

async function verifyVisualRegression() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const browserLocation = process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: 'chrome' };
  const browser = await chromium.launch({ headless: true, ...browserLocation });

  try {
    for (const scenario of scenarios) {
      const before = await capturePopup(browser, scenario, 'original', originalRoot);
      const after = await capturePopup(browser, scenario, 'rewrite', projectRoot);
      assert.ok(before.equals(after), scenario.name + ': screenshots differ');
      console.log('PASS pixel-identical ' + scenario.name);
    }
  } finally {
    await browser.close();
  }
}

verifyVisualRegression().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
