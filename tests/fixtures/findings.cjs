'use strict';

const fs = require('node:fs');
const path = require('node:path');

const latestState = {
  tabId: 42,
  pageUrl: 'https://konto.example.pl/galeria/rodzinna?widok=prywatny',
  pageOrigin: 'https://konto.example.pl',
  status: 'stopped',
  statusMessage: 'Scan stopped. Existing image and script results were kept.',
  scanStartedAt: '2026-07-19T10:00:00.000Z',
  scanStoppedAt: '2026-07-19T10:02:45.000Z',
  debuggerDetachedAt: '2026-07-19T10:02:45.000Z',
  attached: false,
  scanning: false,
  passwordInputPolling: false,
  passwordInputPollIntervalMs: 1000
};
const riskCopy = function riskCopy(summary) {
  return {
    level: 'Krytyczne zagrożenie hasła',
    text: 'Zewnętrzny skrypt działa przy polu hasła, a zdjęcie wydano bez poprawnej autoryzacji użytkownika.',
    meaning: 'Jeśli zdjęcie przedstawia osobę, może to oznaczać ujawnienie jej danych.',
    actionTitle: 'Nie wpisuj tu hasła',
    action: 'Zachowaj raport i przekaż go właścicielowi strony lub inspektorowi ochrony danych.'
  };
};

const image = {
  url: 'https://cdn.example.net/private/photos/child-portrait-2026.jpg?token=example-long-signed-url-for-layout-verification',
  domain: 'cdn.example.net',
  status: 200,
  mimeType: 'image/jpeg',
  resourceType: 'Image',
  requestId: '12345.67',
  fromDiskCache: false,
  fromServiceWorker: false,
  encodedDataLength: 245678,
  timestamp: '2026-07-19T10:01:12.000Z',
  width: 1600,
  height: 1067,
  longSide: 1600,
  headers: {
    'cache-control': 'public, max-age=86400',
    'content-type': 'image/jpeg',
    'access-control-allow-origin': '*',
    'etag': 'fixture-etag',
    'x-robots-tag': ''
  },
  cache: {
    checked: true,
    cacheControl: 'public, max-age=86400',
    hasNoStore: false,
    missingNoStore: true
  },
  missingCacheNoStore: true,
  bodyComparison: {
    status: 'same',
    exactMatch: true,
    improperAuthorization: true,
    originalBodySha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    originalBodyLength: 245678,
    noCredentialsBodySha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    noCredentialsBodyLength: 245678,
    noCredentialsStatus: 200,
    mode: 'cdp-no-credentials',
    comparedAt: '2026-07-19T10:01:15.000Z'
  },
  indexing: {
    xRobotsTag: '',
    headerBlocksGoogle: false,
    robotsTxtStatus: 'allowed',
    robotsTxtCheckedAt: '2026-07-19T10:01:14.000Z',
    robotsTxtUrl: 'https://cdn.example.net/robots.txt',
    robotsTxtHttpStatusCode: 200,
    robotsTxtMatchedRule: { directive: 'allow', path: '/' },
    googleIndexingOpen: true
  },
  googleIndexingOpen: true,
  corsPixelAccess: {
    possible: true,
    imageCount: 1,
    modes: ['wildcard-acao'],
    imageDomains: ['cdn.example.net'],
    accessControlAllowOrigin: '*'
  }
};
image.reportPreviewJpeg = {
  dataUrl: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'preview.jpg')).toString('base64'),
  width: 640,
  height: 360
};

const scriptGroup = {
  label: 'analytics.example.com',
  hostname: 'analytics.example.com',
  registrableDomain: 'example.com',
  classification: 'third-party',
  count: 2,
  blockedCount: 1,
  corsPixelAccess: {
    possible: true,
    imageCount: 1,
    modes: ['wildcard-acao'],
    imageDomains: ['cdn.example.net']
  },
  scripts: [
    {
      url: 'https://analytics.example.com/tracker.js?v=20260719',
      displayName: 'tracker.js',
      type: 'external',
      scriptId: '21',
      requestId: '',
      timestamp: '2026-07-19T10:00:35.000Z',
      blockedByClient: false,
      errorText: '',
      blockedReason: ''
    },
    {
      url: 'https://analytics.example.com/blocked-ad-client.js',
      displayName: 'blocked-ad-client.js',
      type: 'blocked',
      scriptId: 'blocked:123',
      requestId: '123',
      timestamp: '2026-07-19T10:00:36.000Z',
      blockedByClient: true,
      errorText: 'net::ERR_BLOCKED_BY_CLIENT',
      blockedReason: 'inspector'
    }
  ]
};

const passwordGroup = {
  label: 'analytics.example.com',
  hostname: 'analytics.example.com',
  registrableDomain: 'example.com',
  classification: 'third-party',
  scriptCount: 1,
  eventCount: 3,
  valueAccessCount: 1,
  domSignalCount: 2,
  potentialCount: 0,
  blockedCount: 0,
  accesses: [
    {
      kind: 'password.value.get',
      observed: true,
      blockedByClient: false,
      scriptUrl: 'https://analytics.example.com/tracker.js?v=20260719',
      scriptFilename: 'tracker.js',
      functionName: 'readForm',
      lineNumber: 211,
      columnNumber: 18,
      count: 1,
      firstSeen: '2026-07-19T10:01:30.000Z',
      lastSeen: '2026-07-19T10:01:30.000Z',
      detail: 'read input.value',
      errorText: '',
      target: {
        tagName: 'input',
        id: 'password',
        name: 'password',
        autocomplete: 'current-password',
        inputType: 'password'
      }
    }
  ]
};

const reportStats = {
  imageFindings: [image],
  scriptGroups: [scriptGroup],
  passwordGroups: [passwordGroup],
  scriptTree: {
    pageHostname: 'konto.example.pl',
    pageRegistrableDomain: 'example.pl'
  },
  passwordTree: {
    hasPasswordInputs: true,
    hasEverPasswordInputs: true,
    passwordInputCount: 1,
    passwordInputs: [{
      tagName: 'input',
      id: 'password',
      name: 'password',
      autocomplete: 'current-password',
      inputType: 'password'
    }],
    totalAccesses: 3,
    totalValueAccesses: 1,
    valueAccessDomainsCount: 1,
    domSignalDomainsCount: 1,
    uniqueScripts: 1,
    potentialScripts: 0,
    lastChecked: '2026-07-19T10:02:44.000Z',
    pollIntervalMs: 1000,
    groups: [passwordGroup]
  }
};

const summary = {
  totalIssues: 3,
  problemTypes: 6,
  hasAnyProblem: true,
  hasAnyData: true,
  improperAuthorizationImages: 1,
  cacheIssues: 1,
  googleIssues: 1,
  corsPixelDomains: 1,
  corsPixelImages: 1,
  thirdPartyDomains: 1,
  thirdPartyScripts: 2,
  passwordDomains: 1,
  passwordInputs: 1,
  passwordEvents: 3,
  passwordValueEvents: 1,
  passwordValueDomains: 1
};


module.exports = { latestState, riskCopy, image, scriptGroup, passwordGroup, reportStats, summary };
