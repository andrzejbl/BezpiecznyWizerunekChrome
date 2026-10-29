'use strict';

const fixture = require('./findings.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));

function emptyState(overrides = {}) {
  return {
    tabId: 42, attached: false, scanning: false, status: 'idle',
    statusMessage: 'No scan has been started for this tab.',
    scanStartedAt: '', scanStoppedAt: '', debuggerDetachedAt: '',
    pageUrl: '', pageOrigin: '', images: [], imageCount: 0, scripts: [], passwordAccesses: [],
    passwordInputPolling: false, passwordInputPollIntervalMs: 1000,
    scriptTree: {
      pageUrl: '', pageOrigin: '', pageHostname: '', pageRegistrableDomain: '',
      totalScripts: 0, thirdPartyScriptsCount: 0, thirdPartyDomainsCount: 0,
      thirdPartyCorsPixelAccessDomainsCount: 0,
      corsPixelAccess: { possible: false, imageCount: 0, imageDomains: [], modes: [], accessControlAllowOrigins: [] },
      groups: [], thirdPartyGroups: []
    },
    passwordAccessTree: {
      hasPasswordInputs: false, hasEverPasswordInputs: false, passwordInputCount: 0,
      passwordInputs: [], totalAccesses: 0, totalValueAccesses: 0, valueAccessDomainsCount: 0,
      domSignalDomainsCount: 0, uniqueScripts: 0, potentialScripts: 0, lastChecked: '',
      polling: false, pollIntervalMs: 1000, groups: []
    },
    ...overrides
  };
}

function fullState() {
  const state = emptyState({ ...clone(fixture.latestState), images: [clone(fixture.image)], imageCount: 1 });
  state.scripts = clone(fixture.scriptGroup.scripts);
  state.scriptTree = {
    ...state.scriptTree,
    pageUrl: state.pageUrl, pageOrigin: state.pageOrigin,
    pageHostname: 'konto.example.pl', pageRegistrableDomain: 'example.pl',
    totalScripts: 2, thirdPartyScriptsCount: 2, thirdPartyDomainsCount: 1,
    thirdPartyCorsPixelAccessDomainsCount: 1,
    corsPixelAccess: clone(fixture.scriptGroup.corsPixelAccess),
    groups: [clone(fixture.scriptGroup)], thirdPartyGroups: [clone(fixture.scriptGroup)]
  };
  state.passwordAccessTree = clone(fixture.reportStats.passwordTree);
  return state;
}

const popupCases = [
  ['before scanning', emptyState()],
  ['completed scan without findings', emptyState({ status: 'stopped', scanStartedAt: '2026-07-19T10:00:00.000Z' })],
  ['active scan with all finding types', { ...fullState(), attached: true, scanning: true, status: 'scanning' }],
  ['interrupted scan with findings', { ...fullState(), status: 'detached' }],
  ['failed scan with findings', { ...fullState(), status: 'error', statusMessage: 'Fixture debugger error' }],
  ['third-party scripts without image or password findings', (() => {
    const state = fullState();
    state.images = [];
    state.passwordAccessTree = emptyState().passwordAccessTree;
    state.scriptTree.thirdPartyCorsPixelAccessDomainsCount = 0;
    return state;
  })()],
  ['mixed image formats, failed probes and minimum size', (() => {
    const state = fullState();
    state.images = [
      ...state.images,
      { ...clone(fixture.image), url: 'https://cdn.example.net/small.jpg' },
      { ...clone(fixture.image), url: 'https://cdn.example.net/broken.jpg' },
      // Format nadal wykluczony; obsługę PNG sprawdzają osobne testy nowego zachowania.
      { ...clone(fixture.image), url: 'https://cdn.example.net/icon.webp', mimeType: 'image/webp' },
      { ...clone(fixture.image), url: 'https://cdn.example.net/private.jpg', bodyComparison: { improperAuthorization: false } }
    ];
    return state;
  })()]
];


module.exports = { emptyState, fullState, popupCases };
