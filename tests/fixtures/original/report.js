'use strict';

const PDF_PAGE = {
  width: 612,
  height: 792,
  margin: 42,
  top: 734,
  bottom: 48
};

const PDF_COLORS = {
  ink: [0.09, 0.13, 0.18],
  muted: [0.35, 0.40, 0.46],
  line: [0.82, 0.85, 0.89],
  red: [0.70, 0.14, 0.09],
  redDark: [0.50, 0.11, 0.11],
  redSoft: [1.00, 0.95, 0.94],
  green: [0.07, 0.45, 0.27],
  greenSoft: [0.94, 0.98, 0.95],
  blue: [0.13, 0.37, 0.70],
  blueSoft: [0.94, 0.97, 1.00],
  amber: [0.63, 0.36, 0.03],
  amberSoft: [1.00, 0.97, 0.91],
  white: [1, 1, 1]
};

const REPORT_CWE = Object.freeze({
  improperAuthorization: {
    id: 'CWE-863',
    name: 'Incorrect Authorization',
    description: 'Serwer wydaje zdjęcie bez powiązania dostępu z potwierdzoną tożsamością i uprawnieniem osoby pobierającej; poprawny token URL może wystarczać każdemu jego posiadaczowi.'
  },
  personalDataExposure: {
    id: 'CWE-359',
    name: 'Exposure of Private Personal Information to an Unauthorized Actor',
    description: 'Ma zastosowanie, ponieważ raport zakłada wcześniejszą weryfikację użytkownika, że zdjęcie zawiera prywatne dane osobowe.'
  },
  browserCache: {
    id: 'CWE-525',
    name: 'Use of Web Browser Cache Containing Sensitive Information',
    description: 'Ma zastosowanie, gdy odpowiedź zawierająca wrażliwe zdjęcie może zostać zachowana przez cache.'
  },
  thirdPartyCode: {
    id: 'CWE-830',
    name: 'Inclusion of Web Functionality from an Untrusted Source',
    description: 'Ma zastosowanie po potwierdzeniu, że zewnętrzne źródło nie powinno działać w zaufanym kontekście strony.'
  },
  permissiveCors: {
    id: 'CWE-942',
    name: 'Permissive Cross-domain Policy with Untrusted Domains',
    description: 'Ma zastosowanie do nadmiernie otwartej polityki CORS, jeżeli umożliwia odczyt niezaufanej domenie.'
  },
  credentials: {
    id: 'CWE-522',
    name: 'Insufficiently Protected Credentials',
    description: 'Ma zastosowanie, gdy dane uwierzytelniające są podatne na nieuprawnione przechwycenie lub odczyt.'
  }
});

function formatCwe(cwe) {
  return cwe.id + ' - ' + cwe.name;
}

function formatHashForPdf(value) {
  const hash = String(value || '-');
  return hash === '-' ? hash : (hash.match(/.{1,8}/g) || [hash]).join(' ');
}

function getCorsCweText(cors) {
  const modes = cors && Array.isArray(cors.modes) ? cors.modes : [];
  return modes.some((mode) => String(mode).startsWith('cors-'))
    ? formatCwe(REPORT_CWE.permissiveCors)
    : 'Brak osobnego CWE dla CORS: wykryty tryb nie przekracza granicy originu.';
}

const PDF_POLISH_GLYPHS = {
  'Ą': { code: 128, name: 'Aogonek' },
  'Ć': { code: 129, name: 'Cacute' },
  'Ę': { code: 130, name: 'Eogonek' },
  'Ł': { code: 131, name: 'Lslash' },
  'Ń': { code: 132, name: 'Nacute' },
  'Ó': { code: 133, name: 'Oacute' },
  'Ś': { code: 134, name: 'Sacute' },
  'Ź': { code: 135, name: 'Zacute' },
  'Ż': { code: 136, name: 'Zdotaccent' },
  'ą': { code: 137, name: 'aogonek' },
  'ć': { code: 138, name: 'cacute' },
  'ę': { code: 139, name: 'eogonek' },
  'ł': { code: 140, name: 'lslash' },
  'ń': { code: 141, name: 'nacute' },
  'ó': { code: 142, name: 'oacute' },
  'ś': { code: 143, name: 'sacute' },
  'ź': { code: 144, name: 'zacute' },
  'ż': { code: 145, name: 'zdotaccent' }
};

// Custom Polish glyph codes need explicit advances; otherwise following letters overlap.
const PDF_FONT_WIDTHS = {
  regular: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350, 667, 722, 667, 556, 722, 778, 667, 611, 611, 556, 500, 556, 222, 556, 556, 500, 500, 500],
  bold: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 350, 722, 722, 667, 611, 722, 778, 667, 611, 611, 556, 556, 556, 278, 611, 611, 556, 500, 500]
};
function sanitizePdfText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7eąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '?')
    .trim();
}

function escapePdfString(value) {
  let output = '';

  for (const char of sanitizePdfText(value)) {
    const glyph = PDF_POLISH_GLYPHS[char];
    if (glyph) {
      output += '\\' + glyph.code.toString(8).padStart(3, '0');
    } else if (char === '\\' || char === '(' || char === ')') {
      output += '\\' + char;
    } else {
      output += char;
    }
  }

  return output;
}

function getPdfFontEncoding() {
  const differences = Object.values(PDF_POLISH_GLYPHS)
    .sort((a, b) => a.code - b.code)
    .map((glyph, index, glyphs) => {
      const previous = index > 0 ? glyphs[index - 1] : null;
      const codePrefix = !previous || glyph.code !== previous.code + 1 ? glyph.code + ' ' : '';
      return codePrefix + '/' + glyph.name;
    })
    .join(' ');

  return '<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [' + differences + '] >>';
}

function wrapText(value, maxLength) {
  const text = sanitizePdfText(value);
  if (!text) {
    return [''];
  }

  const lines = [];
  let current = '';

  text.split(' ').forEach((word) => {
    if (word.length > maxLength) {
      if (current) {
        lines.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      return;
    }

    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function getPdfMaxCharacters(size, indent, width) {
  const availableWidth = width || (PDF_PAGE.width - (PDF_PAGE.margin * 2) - (indent || 0));
  return Math.max(24, Math.floor(availableWidth / Math.max(4.4, size * 0.51)));
}

function pushPdfLine(items, text, options = {}) {
  const size = options.size || 10;
  const indent = options.indent || 0;
  const wrapped = wrapText(text, options.maxLength || getPdfMaxCharacters(size, indent, options.width));

  wrapped.forEach((line, index) => {
    items.push({
      kind: 'text',
      text: line,
      size,
      indent,
      font: options.font || 'regular',
      color: options.color || PDF_COLORS.ink,
      gapBefore: index === 0 ? (options.gapBefore || 0) : 0,
      gapAfter: index === wrapped.length - 1 ? (options.gapAfter || 0) : 0
    });
  });
}

function pushPdfBlock(items, text, options = {}) {
  const size = options.size || 10;
  const indent = options.indent || 0;
  const width = options.width || (PDF_PAGE.width - (PDF_PAGE.margin * 2) - indent);
  const padding = options.padding === undefined ? 8 : options.padding;
  const textWidth = Math.max(80, width - (padding * 2) - (options.accent ? 7 : 0));
  const maxLength = options.maxLength || getPdfMaxCharacters(size, 0, textWidth);
  const wrapped = String(text).split(/\r?\n/).flatMap((line) => wrapText(line, maxLength));

  items.push({
    kind: 'block',
    lines: wrapped,
    size,
    indent,
    width,
    padding,
    font: options.font || 'regular',
    color: options.color || PDF_COLORS.ink,
    fill: options.fill || PDF_COLORS.blueSoft,
    border: options.border || PDF_COLORS.line,
    accent: options.accent || null,
    gapBefore: options.gapBefore || 0,
    gapAfter: options.gapAfter || 0
  });
}

function pushPdfImage(items, preview, options = {}) {
  if (!preview || !preview.dataUrl || !preview.width || !preview.height) {
    return;
  }

  const maxWidth = options.maxWidth || 330;
  const maxHeight = options.maxHeight || 190;
  const scale = Math.min(maxWidth / preview.width, maxHeight / preview.height, 1);
  items.push({
    kind: 'image',
    dataUrl: preview.dataUrl,
    pixelWidth: preview.width,
    pixelHeight: preview.height,
    displayWidth: Math.max(1, preview.width * scale),
    displayHeight: Math.max(1, preview.height * scale),
    indent: options.indent || 8,
    gapBefore: options.gapBefore || 3,
    gapAfter: options.gapAfter || 7
  });
}
function pushPdfRule(items, options = {}) {
  items.push({
    kind: 'rule',
    color: options.color || PDF_COLORS.line,
    gapBefore: options.gapBefore || 3,
    gapAfter: options.gapAfter || 7
  });
}

function pushPdfPageBreak(items) {
  items.push({ kind: 'page-break' });
}

function pushPdfSection(items, title, options = {}) {
  pushPdfLine(items, title, {
    size: options.size || 14,
    font: 'bold',
    color: options.color || PDF_COLORS.ink,
    gapBefore: options.gapBefore === undefined ? 12 : options.gapBefore,
    gapAfter: 3
  });
  pushPdfRule(items, {
    color: options.ruleColor || options.color || PDF_COLORS.blue,
    gapBefore: 0,
    gapAfter: options.gapAfter === undefined ? 7 : options.gapAfter
  });
}

function formatBytes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  if (value >= 1024 * 1024) {
    return value + ' B (' + (value / 1024 / 1024).toFixed(2) + ' MB)';
  }

  if (value >= 1024) {
    return value + ' B (' + (value / 1024).toFixed(1) + ' KB)';
  }

  return value + ' B';
}

function formatFlag(value) {
  if (value === true) {
    return 'TAK';
  }
  if (value === false) {
    return 'NIE';
  }
  return 'NIE USTALONO';
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatReportDate(value) {
  if (!value) {
    return '-';
  }

  try {
    return new Date(value).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch (error) {
    return String(value);
  }
}

function groupDomain(group) {
  const value = group && (group.registrableDomain || group.hostname || group.label || group.origin);
  return value ? String(value) : 'nieznana domena';
}

function reportClassificationLabel(classification) {
  if (classification === 'third-party') {
    return 'domena zewnętrzna';
  }
  if (classification === 'same-site') {
    return 'ta sama główna domena';
  }
  if (classification === 'first-party-origin') {
    return 'domena strony';
  }
  return classification || '-';
}
function getReportPriority(summary) {
  if (summary.passwordDomains > 0) {
    return { label: 'KRYTYCZNY', color: PDF_COLORS.redDark, fill: PDF_COLORS.redSoft };
  }
  if (summary.improperAuthorizationImages > 0) {
    return {
      label: 'WYSOKI',
      detail: 'WYMAGA WERYFIKACJI TREŚCI ZDJĘĆ',
      color: PDF_COLORS.red,
      fill: PDF_COLORS.redSoft
    };
  }
  if (summary.corsPixelDomains > 0) {
    return { label: 'PODWYŻSZONY', color: PDF_COLORS.amber, fill: PDF_COLORS.amberSoft };
  }
  if (summary.thirdPartyDomains > 0) {
    return { label: 'INFORMACYJNY', color: PDF_COLORS.blue, fill: PDF_COLORS.blueSoft };
  }
  return { label: 'BRAK ALARMÓW DLA PRZEANALIZOWANYCH ZAPYTAŃ SIECIOWYCH', color: PDF_COLORS.green, fill: PDF_COLORS.greenSoft };
}

function cloneEvidenceValue(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === 'previewDataUrl' || key === 'reportPreviewJpeg') {
      return undefined;
    }
    return item;
  }));
}

function buildEvidencePayload(reportStats, summary, generatedAt, reportId) {
  const manifest = chrome.runtime.getManifest();
  const scriptTree = reportStats.scriptTree || {};
  const passwordTree = reportStats.passwordTree || {};

  return {
    schemaVersion: '2.1',
    report: {
      id: reportId,
      generatedAt: generatedAt.toISOString(),
      generatedAtLocal: formatReportDate(generatedAt),
      extensionName: manifest.name,
      extensionVersion: manifest.version
    },
    subject: {
      pageUrl: latestState && latestState.pageUrl ? latestState.pageUrl : '',
      pageOrigin: latestState && latestState.pageOrigin ? latestState.pageOrigin : '',
      pageHostname: scriptTree.pageHostname || '',
      pageRegistrableDomain: scriptTree.pageRegistrableDomain || '',
      tabId: latestState && typeof latestState.tabId === 'number' ? latestState.tabId : null
    },
    assumptions: {
      imagesContainPersonalData: true,
      verificationMethod: 'User visually verifies that reported images contain personal data before relying on the report.'
    },
    scan: {
      startedAt: latestState && latestState.scanStartedAt ? latestState.scanStartedAt : '',
      stoppedAt: latestState && latestState.scanStoppedAt ? latestState.scanStoppedAt : '',
      debuggerDetachedAt: latestState && latestState.debuggerDetachedAt ? latestState.debuggerDetachedAt : '',
      status: latestState && latestState.status ? latestState.status : '',
      statusMessage: latestState && latestState.statusMessage ? latestState.statusMessage : '',
      attachedAtReportGeneration: Boolean(latestState && latestState.attached),
      scanningAtReportGeneration: Boolean(latestState && latestState.scanning),
      passwordPollingAtReportGeneration: Boolean(latestState && latestState.passwordInputPolling),
      passwordPollIntervalMs: latestState && latestState.passwordInputPollIntervalMs ? latestState.passwordInputPollIntervalMs : null
    },
    summary: cloneEvidenceValue(summary),
    cweCatalog: cloneEvidenceValue(REPORT_CWE),
    cweMappings: {
      imageWithoutProperUserAuthorization: ['CWE-863', 'CWE-359'],
      sensitiveImageCacheWithoutNoStore: ['CWE-525'],
      googleDiscoverability: {
        weakness: null,
        consequence: 'CWE-359',
        note: 'Missing indexing directives are not a standalone CWE weakness; CWE-359 describes exposure of user-verified personal data.'
      },
      untrustedThirdPartyWebCode: ['CWE-830'],
      permissiveCrossOriginPixelAccess: ['CWE-942'],
      insufficientlyProtectedPasswordValue: ['CWE-522', 'CWE-830']
    },
    methodology: {
      imageAccess: 'Original Network response body is compared byte-for-byte by SHA-256 and length with a CDP Network.loadNetworkResource request using includeCredentials=false and disableCache=true. Both HTTP statuses must be 2xx. Returning the same image without an active user session is classified as incorrect user authorization under CWE-863; a URL token may be validated, but access is not bound to a verified user identity and entitlement.',
      responseHeaders: 'Cache-Control, X-Robots-Tag and CORS are evaluated from resource.headers returned by the no-credentials image request.',
      thirdPartyDomains: 'Only registrable domains different from the page registrable domain are reported. First-party, same-site, inline/eval/blob and browser/internal sources are excluded.',
      blockedScripts: 'ERR_BLOCKED_BY_CLIENT scripts are preserved as potential evidence and explicitly marked as not executed locally.',
      passwordAccess: 'Password fields are polled and DOM/value access is instrumented. Password values are never read into or stored by the extension.',
      indexing: 'Google exposure is assessed from X-Robots-Tag and robots.txt for the image origin.',
      cache: 'A cache concern is reported when the no-credentials response Cache-Control header does not contain no-store.',
      cweScope: 'CWE mappings classify technical weakness patterns. The report assumes that the user visually confirmed personal data in the images and that access should be restricted to an identified, entitled user. Trust boundaries still require contextual review.'
    },
    integrityModel: {
      evidencePayloadSha256: 'Calculated before the integrity field is added.',
      detachedFiles: 'The complete ZIP export contains the PDF, standalone JSON evidence and a detached SHA-256 manifest for the PDF and JSON.',
      limitation: 'SHA-256 detects changes relative to a separately preserved checksum. It is not a digital signature, trusted timestamp or proof of authorship.'
    },
    findings: {
      improperAuthorizationImages: cloneEvidenceValue(reportStats.imageFindings),
      thirdPartyDomains: cloneEvidenceValue(reportStats.scriptGroups),
      password: {
        hasPasswordInputs: Boolean(passwordTree.hasPasswordInputs),
        hasEverPasswordInputs: Boolean(passwordTree.hasEverPasswordInputs),
        passwordInputCount: formatNumber(passwordTree.passwordInputCount),
        passwordInputs: cloneEvidenceValue(passwordTree.passwordInputs || []),
        totalAccesses: formatNumber(passwordTree.totalAccesses),
        totalValueAccesses: formatNumber(passwordTree.totalValueAccesses),
        valueAccessDomainsCount: formatNumber(passwordTree.valueAccessDomainsCount),
        domSignalDomainsCount: formatNumber(passwordTree.domSignalDomainsCount),
        uniqueScripts: formatNumber(passwordTree.uniqueScripts),
        potentialScripts: formatNumber(passwordTree.potentialScripts),
        lastChecked: passwordTree.lastChecked || '',
        groups: cloneEvidenceValue(reportStats.passwordGroups)
      }
    }
  };
}

function digestToHex(digest) {
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value));
  return digestToHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function sha256Blob(blob) {
  return digestToHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

function stringifyAsciiJson(value) {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7f]/g, (char) => {
    return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

let zipCrc32Table = null;

function getZipCrc32Table() {
  if (zipCrc32Table) {
    return zipCrc32Table;
  }

  zipCrc32Table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    zipCrc32Table[index] = value >>> 0;
  }
  return zipCrc32Table;
}

function calculateZipCrc32(bytes) {
  const table = getZipCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getZipDosDateTime(date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

async function createZipBlob(files, generatedAt = new Date()) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const dos = getZipDosDateTime(generatedAt);
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc32 = calculateZipCrc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dos.time, true);
    localView.setUint16(12, dos.date, true);
    localView.setUint32(14, crc32, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dos.time, true);
    centralView.setUint16(14, dos.date, true);
    centralView.setUint32(16, crc32, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    localOffset += localHeader.length + dataBytes.length;
    centralSize += centralHeader.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

function createReportPreviewJpeg(image) {
  const source = image && image.previewDataUrl ? image.previewDataUrl : '';
  if (!source) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const probe = new Image();
    probe.decoding = 'async';

    probe.addEventListener('load', () => {
      const sourceWidth = probe.naturalWidth || 0;
      const sourceHeight = probe.naturalHeight || 0;
      if (!sourceWidth || !sourceHeight) {
        resolve(null);
        return;
      }

      const maxWidth = 720;
      const maxHeight = 480;
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        resolve(null);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(probe, 0, 0, width, height);

      try {
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.82),
          width,
          height
        });
      } catch (error) {
        resolve(null);
      }
    }, { once: true });

    probe.addEventListener('error', () => resolve(null), { once: true });
    probe.src = source;
  });
}

async function prepareReportStats(reportStats) {
  const images = await Promise.all(reportStats.imageFindings.map(async (image) => ({
    ...image,
    reportPreviewJpeg: await createReportPreviewJpeg(image)
  })));

  return {
    ...reportStats,
    imageFindings: images
  };
}
function appendReportCover(items, reportStats, summary, context) {
  const verdict = riskCopy(summary);
  const priority = getReportPriority(summary);

  pushPdfLine(items, 'RAPORT RODO - OCENA PRYWATNOŚCI', {
    size: 10,
    font: 'bold',
    color: PDF_COLORS.blue,
    gapAfter: 5
  });
  pushPdfLine(items, verdict.level, {
    size: 22,
    font: 'bold',
    color: priority.color,
    gapAfter: 6
  });
  pushPdfBlock(items, verdict.text + ' ' + verdict.meaning, {
    size: 11,
    font: 'bold',
    fill: priority.fill,
    border: priority.color,
    accent: priority.color,
    padding: 10,
    gapAfter: 10
  });

  pushPdfLine(items, 'Poziom pilności: ' + priority.label, {
    size: 10,
    font: 'bold',
    color: priority.color,
    gapAfter: 4
  });
  if (priority.detail) {
    pushPdfLine(items, priority.detail, {
      size: 9,
      font: 'bold',
      color: priority.color,
      gapAfter: 4
    });
  }
  pushPdfLine(items, 'Sprawdzana strona: ' + context.pageUrl, { size: 9, gapAfter: 2 });
  pushPdfLine(items, 'Wygenerowano: ' + formatReportDate(context.generatedAt), { size: 9 });
  pushPdfLine(items, 'Identyfikator raportu: ' + context.reportId, { size: 9, gapAfter: 10 });

  pushPdfSection(items, 'Najważniejsze ustalenia', { gapBefore: 2 });
  pushPdfBlock(items, 'BRAK POPRAWNEJ AUTORYZACJI: ' + summary.improperAuthorizationImages + ' ZDJĘĆ.\nIdentyczne pliki zostały zwrócone bez aktywnej sesji.\nCWE: ' + formatCwe(REPORT_CWE.improperAuthorization) + '; skutek dla danych osobowych: ' + formatCwe(REPORT_CWE.personalDataExposure) + '.', {
    size: 9,
    font: 'bold',
    fill: summary.improperAuthorizationImages > 0 ? PDF_COLORS.redSoft : PDF_COLORS.greenSoft,
    border: summary.improperAuthorizationImages > 0 ? PDF_COLORS.red : PDF_COLORS.green,
    accent: summary.improperAuthorizationImages > 0 ? PDF_COLORS.red : PDF_COLORS.green,
    padding: 7,
    gapAfter: 4
  });
  pushPdfBlock(items, 'ZDJĘCIA MOGĄ POZOSTAĆ NA DYSKU: ' + summary.cacheIssues + ' ZDJĘĆ.\nAplikacja nie blokuje ich zapisu w cache, co zwiększa ryzyko dostępu niepowołanych osób i aplikacji.\nCWE: ' + formatCwe(REPORT_CWE.browserCache) + '.', {
    size: 9,
    font: 'bold',
    fill: summary.cacheIssues > 0 ? PDF_COLORS.amberSoft : PDF_COLORS.greenSoft,
    border: summary.cacheIssues > 0 ? PDF_COLORS.amber : PDF_COLORS.green,
    accent: summary.cacheIssues > 0 ? PDF_COLORS.amber : PDF_COLORS.green,
    padding: 7,
    gapAfter: 4
  });
  pushPdfBlock(items, 'DOSTĘPNE DLA GOOGLE WEDŁUG WYKRYTYCH REGUŁ: ' + summary.googleIssues + ' ZDJĘĆ.\nNie wykryto blokady w X-Robots-Tag ani robots.txt.', {
    size: 9,
    font: 'bold',
    fill: summary.googleIssues > 0 ? PDF_COLORS.blueSoft : PDF_COLORS.greenSoft,
    border: summary.googleIssues > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
    accent: summary.googleIssues > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
    padding: 7,
    gapAfter: 6
  });
  pushPdfBlock(items, 'DOMENY ZEWNĘTRZNE: ' + summary.thirdPartyDomains + '. Domeny mogące odczytać piksele zdjęć: ' + summary.corsPixelDomains + '. Skrypty zewnętrzne: ' + summary.thirdPartyScripts + '.\nCWE: ' + formatCwe(REPORT_CWE.thirdPartyCode) + '; dla nadmiernie otwartego CORS: ' + formatCwe(REPORT_CWE.permissiveCors) + '.', {
    size: 10,
    font: 'bold',
    fill: summary.thirdPartyDomains > 0 ? PDF_COLORS.blueSoft : PDF_COLORS.greenSoft,
    border: summary.thirdPartyDomains > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
    accent: summary.thirdPartyDomains > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
    gapAfter: 5
  });
  pushPdfBlock(items, 'POLA HASŁA: ' + summary.passwordInputs + '. Domeny zewnętrzne przy polach: ' + summary.passwordDomains + '. Potwierdzony odczyt lub zapis wartości: ' + summary.passwordValueEvents + '.\nCWE: ' + formatCwe(REPORT_CWE.credentials) + '; kod zewnętrzny: ' + formatCwe(REPORT_CWE.thirdPartyCode) + '.', {
    size: 10,
    font: 'bold',
    fill: summary.passwordDomains > 0 ? PDF_COLORS.redSoft : PDF_COLORS.greenSoft,
    border: summary.passwordDomains > 0 ? PDF_COLORS.redDark : PDF_COLORS.green,
    accent: summary.passwordDomains > 0 ? PDF_COLORS.redDark : PDF_COLORS.green,
    gapAfter: 10
  });

  pushPdfSection(items, 'Co zrobić teraz');
  pushPdfBlock(items, verdict.actionTitle + '. ' + verdict.action, {
    size: 10,
    fill: priority.fill,
    border: priority.color,
    accent: priority.color,
    gapAfter: 7
  });
  pushPdfPageBreak(items);
}

function appendScopeSection(items, reportStats, context) {
  const scriptTree = reportStats.scriptTree || {};
  const passwordTree = reportStats.passwordTree || {};
  const manifest = chrome.runtime.getManifest();

  pushPdfSection(items, '1. Zakres i wiarygodność raportu', { gapBefore: 0 });
  pushPdfLine(items, 'Strona: ' + context.pageUrl, { size: 9 });
  pushPdfLine(items, 'Origin strony: ' + (latestState && latestState.pageOrigin ? latestState.pageOrigin : '-'), { size: 9 });
  pushPdfLine(items, 'Główna domena strony: ' + (scriptTree.pageRegistrableDomain || '-'), { size: 9 });
  pushPdfLine(items, 'Rozpoczęcie skanu: ' + formatReportDate(latestState && latestState.scanStartedAt), { size: 9 });
  pushPdfLine(items, 'Zatrzymanie skanu: ' + formatReportDate(latestState && latestState.scanStoppedAt), { size: 9 });
  pushPdfLine(items, 'Odłączenie debuggera: ' + formatReportDate(latestState && latestState.debuggerDetachedAt), { size: 9 });
  pushPdfLine(items, 'Stan przy generowaniu: ' + (latestState && latestState.status ? latestState.status : '-') + '; debugger podłączony: ' + formatFlag(Boolean(latestState && latestState.attached)), { size: 9 });
  pushPdfLine(items, 'Rozszerzenie: ' + manifest.name + ' ' + manifest.version + '; Manifest V3; Chrome DevTools Protocol przez chrome.debugger.', { size: 9 });
  pushPdfLine(items, 'Kontrola pól hasła: polling co ' + (passwordTree.pollIntervalMs || '-') + ' ms; ostatnia kontrola: ' + formatReportDate(passwordTree.lastChecked), { size: 9, gapAfter: 7 });
  pushPdfLine(items, 'Założenie treści: użytkownik potwierdził, że analizowane zdjęcia zawierają dane osobowe; OCR i automatyczna klasyfikacja osób nie są wykonywane.', { size: 9, font: 'bold', gapAfter: 7 });

}

function appendImageReportSection(items, images) {
  pushPdfSection(items, '2. Zdjęcia bez poprawnej autoryzacji - CWE-863 / CWE-359', {
    color: images.length > 0 ? PDF_COLORS.red : PDF_COLORS.green
  });

  if (images.length === 0) {
    pushPdfBlock(items, 'Dla przeanalizowanych zapytań sieciowych nie wykryto zdjęć spełniających wszystkie warunki raportu: format JPEG/JPG, identyczne body bez aktywnej sesji, statusy HTTP 2xx i dłuższy bok co najmniej ' + MIN_IMAGE_LONG_SIDE + ' px.', {
      fill: PDF_COLORS.greenSoft,
      border: PDF_COLORS.green,
      accent: PDF_COLORS.green
    });
    return;
  }

  pushPdfLine(items, 'Potwierdzenie: statusy HTTP 2xx, identyczna długość i identyczny SHA-256 odpowiedzi podczas sesji oraz bez aktywnej sesji.', {
    size: 9,
    font: 'bold',
    color: PDF_COLORS.redDark,
    gapAfter: 7
  });

  images.forEach((image, index) => {
    if (index > 0) {
      pushPdfPageBreak(items);
    }

    const comparison = image.bodyComparison || {};
    const cache = image.cache || {};
    const indexing = image.indexing || {};
    const corsPixelAccess = image.corsPixelAccess || {};
    const matchedRule = indexing.robotsTxtMatchedRule || {};
    const dimensions = image.width && image.height ? image.width + ' x ' + image.height + ' px' : '-';
    const cacheControl = image.cacheControl || cache.cacheControl || '(brak nagłówka)';
    const label = 'Z-' + String(index + 1).padStart(3, '0');

    pushPdfBlock(items, label + ' - POTWIERDZONE: brak poprawnej autoryzacji użytkownika - CWE-863 / CWE-359', {
      size: 11,
      font: 'bold',
      color: PDF_COLORS.redDark,
      fill: PDF_COLORS.redSoft,
      border: PDF_COLORS.red,
      accent: PDF_COLORS.red,
      gapBefore: index === 0 ? 2 : 10,
      gapAfter: 5
    });
    if (image.reportPreviewJpeg) {
      pushPdfImage(items, image.reportPreviewJpeg, { indent: 8, maxWidth: 330, maxHeight: 190 });
    } else {
      pushPdfLine(items, 'Podgląd nie został osadzony, ponieważ body zdjęcia nie było dostępne jako lokalna miniatura. Metadane i skróty pozostają pełnym dowodem technicznym.', {
        size: 8,
        color: PDF_COLORS.muted,
        indent: 8,
        gapAfter: 4
      });
    }
    pushPdfLine(items, 'URL: ' + image.url, { size: 8, indent: 8 });
    pushPdfLine(items, 'Domena: ' + (image.domain || '-') + '; wymiary: ' + dimensions + '; dłuższy bok: ' + (image.longSide || '-') + ' px', { size: 9, indent: 8 });
    pushPdfLine(items, 'Odpowiedź podczas sesji: HTTP ' + (image.status === null ? '-' : image.status) + '; MIME: ' + (image.mimeType || '-') + '; typ: ' + (image.resourceType || '-') + '; encodedDataLength: ' + formatBytes(image.encodedDataLength), { size: 9, indent: 8 });
    pushPdfLine(items, 'Body podczas sesji: ' + formatBytes(comparison.originalBodyLength) + '; SHA-256: ' + formatHashForPdf(comparison.originalBodySha256), { size: 8, indent: 8 });
    pushPdfLine(items, 'Body bez aktywnej sesji: HTTP ' + (comparison.noCredentialsStatus || '-') + '; ' + formatBytes(comparison.noCredentialsBodyLength) + '; SHA-256: ' + formatHashForPdf(comparison.noCredentialsBodySha256), { size: 8, indent: 8 });
    pushPdfLine(items, 'Body identyczne: ' + formatFlag(comparison.exactMatch) + '; tryb: ' + (comparison.mode || '-') + '; porównano: ' + formatReportDate(comparison.comparedAt || comparison.updatedAt), { size: 9, indent: 8 });
    pushPdfLine(items, 'Nagłówki audytowe pochodzą z: ' + (cache.headerSource || indexing.headerSource || 'nieustalone') + '.', { size: 8, font: 'bold', indent: 8 });
    pushPdfLine(items, 'Cache-Control: ' + cacheControl + '; brak no-store: ' + formatFlag(image.missingCacheNoStore === true || cache.missingNoStore === true) + '; fromDiskCache: ' + formatFlag(image.fromDiskCache) + '; fromServiceWorker: ' + formatFlag(image.fromServiceWorker) + '; CWE: ' + formatCwe(REPORT_CWE.browserCache) + '.', { size: 9, indent: 8 });
    pushPdfLine(items, 'X-Robots-Tag: ' + (indexing.xRobotsTag || '(brak)') + '; blokuje Google: ' + formatFlag(indexing.headerBlocksGoogle) + '.', { size: 9, indent: 8 });
    pushPdfLine(items, 'robots.txt: ' + (indexing.robotsTxtStatus || '-') + '; HTTP: ' + (indexing.robotsTxtHttpStatusCode || '-') + '; URL: ' + (indexing.robotsTxtUrl || '-') + '; sprawdzono: ' + formatReportDate(indexing.robotsTxtCheckedAt), { size: 8, indent: 8 });
    pushPdfLine(items, 'Dopasowana reguła robots.txt: ' + (matchedRule.directive || '-') + ' ' + (matchedRule.path || '-') + '; Google nie jest blokowany: ' + formatFlag(image.googleIndexingOpen === true || indexing.googleIndexingOpen === true), { size: 9, indent: 8 });
    pushPdfLine(items, 'Odczyt pikseli przez JavaScript możliwy: ' + formatFlag(corsPixelAccess.possible) + '; tryby: ' + ((corsPixelAccess.modes || []).join(', ') || '-') + '; ACAO: ' + (corsPixelAccess.accessControlAllowOrigin || '-') + '; źródło nagłówków: ' + (corsPixelAccess.responseHeaderSource || '-') + '; ' + getCorsCweText(corsPixelAccess), { size: 9, indent: 8 });
    pushPdfLine(items, 'Klasyfikacja: ' + formatCwe(REPORT_CWE.improperAuthorization) + '; skutek dla danych osobowych: ' + formatCwe(REPORT_CWE.personalDataExposure) + '.', { size: 8, font: 'bold', indent: 8 });
    pushPdfLine(items, 'Request ID: ' + (image.requestId || '-') + '; pierwszy zapis: ' + formatReportDate(image.timestamp), { size: 8, indent: 8, gapAfter: 4 });
  });
}
function appendScriptReportSection(items, scriptGroups) {
  const readableGroups = scriptGroups.filter((group) => group.corsPixelAccess && group.corsPixelAccess.possible);

  pushPdfSection(items, '3. Domeny zewnętrzne z dostępem do strony - CWE-830 / CWE-942', {
    color: scriptGroups.length > 0 ? PDF_COLORS.blue : PDF_COLORS.green
  });
  pushPdfLine(items, 'Unikalne domeny zewnętrzne: ' + scriptGroups.length + '; domeny z techniczną możliwością odczytu pikseli zdjęć: ' + readableGroups.length + '.', {
    size: 9,
    font: 'bold',
    gapAfter: 6
  });
  if (scriptGroups.length === 0) {
    pushPdfBlock(items, 'Nie wykryto domen zewnętrznych po odfiltrowaniu skryptów własnych, tej samej głównej domeny, inline/eval/blob oraz browser/internal.', {
      fill: PDF_COLORS.greenSoft,
      border: PDF_COLORS.green,
      accent: PDF_COLORS.green
    });
    return;
  }

  scriptGroups.forEach((group, index) => {
    const cors = group.corsPixelAccess || {};
    const scripts = Array.isArray(group.scripts) ? group.scripts : [];
    const label = 'D-' + String(index + 1).padStart(3, '0');
    const accessText = cors.possible
      ? 'MOŻLIWOŚĆ ODCZYTU PIKSELI ' + formatNumber(cors.imageCount) + ' ZDJĘĆ'
      : 'DOMENA ZEWNĘTRZNA';

    pushPdfBlock(items, label + ' - ' + groupDomain(group) + ' - ' + accessText, {
      size: 10,
      font: 'bold',
      color: cors.possible ? PDF_COLORS.blue : PDF_COLORS.ink,
      fill: PDF_COLORS.blueSoft,
      border: PDF_COLORS.blue,
      accent: PDF_COLORS.blue,
      gapBefore: index === 0 ? 2 : 9,
      gapAfter: 4
    });
    pushPdfLine(items, 'Skrypty: ' + formatNumber(group.count) + '; zablokowane lokalnie: ' + formatNumber(group.blockedCount) + '; klasyfikacja: ' + reportClassificationLabel(group.classification) + '.', { size: 9, indent: 8 });
    pushPdfLine(items, 'CORS/pixel: możliwe=' + formatFlag(cors.possible) + '; obrazy=' + formatNumber(cors.imageCount) + '; tryby=' + ((cors.modes || []).join(', ') || '-') + '; domeny zdjęć=' + ((cors.imageDomains || []).join(', ') || '-') + '.', { size: 8, indent: 8 });
    pushPdfLine(items, 'Klasyfikacja CWE: ' + formatCwe(REPORT_CWE.thirdPartyCode) + ' - warunkowo dla niezaufanego źródła; ' + getCorsCweText(cors), { size: 8, font: 'bold', indent: 8 });

    scripts.forEach((script, scriptIndex) => {
      const stateLabel = script.blockedByClient === true ? 'ZABLOKOWANY LOKALNIE' : 'URUCHOMIONY LUB ZAŁADOWANY';
      pushPdfLine(items, (scriptIndex + 1) + '. ' + stateLabel + ': ' + (script.url || script.displayName || script.filename || '-'), { size: 8, indent: 14 });
      pushPdfLine(items, '   typ=' + (script.type || '-') + '; scriptId=' + (script.scriptId || '-') + '; requestId=' + (script.requestId || '-') + '; czas=' + formatReportDate(script.timestamp) + '; błąd=' + (script.errorText || '-') + '; blockedReason=' + (script.blockedReason || '-'), { size: 7.5, indent: 14 });
    });
  });
}

function getPasswordEvidenceLabel(access) {
  if (access.blockedByClient === true) {
    return 'ZABLOKOWANY LOKALNIE - POTENCJALNA MOŻLIWOŚĆ';
  }
  if (access.observed === false) {
    return 'MOŻLIWOŚĆ DOSTĘPU';
  }
  if (access.kind === 'password.value.get') {
    return 'POTWIERDZONY ODCZYT WARTOŚCI';
  }
  if (access.kind === 'password.value.set') {
    return 'POTWIERDZONY ZAPIS WARTOŚCI';
  }
  return 'POTWIERDZONY DOSTĘP DO ELEMENTU DOM';
}

function appendPasswordReportSection(items, passwordGroups, passwordTree) {
  const tree = passwordTree || {};
  const inputs = Array.isArray(tree.passwordInputs) ? tree.passwordInputs : [];

  pushPdfSection(items, '4. Domeny zewnętrzne przy polach hasła - CWE-522 / CWE-830', {
    color: passwordGroups.length > 0 ? PDF_COLORS.redDark : PDF_COLORS.green
  });
  pushPdfLine(items, 'Pola hasła: ' + formatNumber(tree.passwordInputCount) + '; domeny zewnętrzne: ' + passwordGroups.length + '; zdarzenia przy polach: ' + formatNumber(tree.totalAccesses) + '; potwierdzony odczyt lub zapis wartości: ' + formatNumber(tree.totalValueAccesses) + '.', {
    size: 9,
    font: 'bold',
    gapAfter: 5
  });
  pushPdfLine(items, 'Rozszerzenie nie zapisuje wartości haseł. Dowód obejmuje wyłącznie rodzaj operacji, domenę i skrypt, element docelowy bez jego wartości, lokalizację w kodzie oraz czas.', {
    size: 9,
    color: PDF_COLORS.muted,
    gapAfter: 6
  });
  if (inputs.length > 0) {
    inputs.forEach((input, index) => {
      pushPdfLine(items, 'Pole H-' + String(index + 1).padStart(3, '0') + ': tag=' + (input.tagName || 'input') + '; id=' + (input.id || '-') + '; name=' + (input.name || '-') + '; autocomplete=' + (input.autocomplete || '-') + '; typ=' + (input.inputType || 'password'), {
        size: 8,
        indent: 8
      });
    });
    pushPdfRule(items, { gapBefore: 4, gapAfter: 6 });
  }

  if (passwordGroups.length === 0) {
    pushPdfBlock(items, inputs.length > 0
      ? 'Wykryto pole hasła, ale nie znaleziono domen zewnętrznych działających lub potencjalnie działających przy tym polu.'
      : 'Nie wykryto pola hasła ani domen zewnętrznych przy polu hasła.', {
      fill: PDF_COLORS.greenSoft,
      border: PDF_COLORS.green,
      accent: PDF_COLORS.green
    });
    return;
  }

  passwordGroups.forEach((group, index) => {
    if (index > 0) {
      pushPdfPageBreak(items);
    }

    const accesses = Array.isArray(group.accesses) ? group.accesses : [];
    const label = 'H-' + String(index + 1).padStart(3, '0');

    pushPdfBlock(items, label + ' - KRYTYCZNE - ' + groupDomain(group) + ' - CWE-522 / CWE-830', {
      size: 11,
      font: 'bold',
      color: PDF_COLORS.redDark,
      fill: PDF_COLORS.redSoft,
      border: PDF_COLORS.redDark,
      accent: PDF_COLORS.redDark,
      gapBefore: index === 0 ? 2 : 9,
      gapAfter: 4
    });
    pushPdfLine(items, 'Skrypty: ' + formatNumber(group.scriptCount) + '; zdarzenia: ' + formatNumber(group.eventCount) + '; odczyt/zapis wartości: ' + formatNumber(group.valueAccessCount) + '; zdarzenia DOM: ' + formatNumber(group.domSignalCount) + '; potencjalne: ' + formatNumber(group.potentialCount) + '; zablokowane lokalnie: ' + formatNumber(group.blockedCount) + '.', { size: 9, indent: 8 });
    pushPdfLine(items, 'CWE warunkowe: ' + formatCwe(REPORT_CWE.credentials) + '; ' + formatCwe(REPORT_CWE.thirdPartyCode) + '.', { size: 8, font: 'bold', indent: 8 });

    accesses.forEach((access, accessIndex) => {
      const target = access.target || {};
      pushPdfLine(items, (accessIndex + 1) + '. ' + getPasswordEvidenceLabel(access) + ': ' + (access.scriptUrl || access.scriptFilename || '-'), { size: 8, font: 'bold', indent: 14 });
      pushPdfLine(items, '   kind=' + (access.kind || '-') + '; count=' + formatNumber(access.count) + '; funkcja=' + (access.functionName || '-') + '; pozycja=' + (access.lineNumber || '-') + ':' + (access.columnNumber || '-') + '; firstSeen=' + formatReportDate(access.firstSeen) + '; lastSeen=' + formatReportDate(access.lastSeen), { size: 7.5, indent: 14 });
      pushPdfLine(items, '   cel: tag=' + (target.tagName || 'input') + '; id=' + (target.id || '-') + '; name=' + (target.name || '-') + '; autocomplete=' + (target.autocomplete || '-') + '; detail=' + (access.detail || '-') + '; błąd=' + (access.errorText || '-'), { size: 7.5, indent: 14 });
    });
  });
}

function appendMethodSection(items, context) {
  pushPdfSection(items, '5. Metoda, ograniczenia i integralność');

  pushPdfLine(items, 'Metoda badania', { size: 11, font: 'bold', gapAfter: 3 });
  pushPdfLine(items, '1. chrome.debugger rejestruje Network, Debugger, Runtime i Page od chwili podłączenia; strona jest przeładowywana bez cache.', { size: 9, indent: 8 });
  pushPdfLine(items, '2. Body zdjęcia z sesji jest porównywane z żądaniem CDP includeCredentials=false. Wynik wymaga statusów 2xx, identycznej długości i identycznego SHA-256.', { size: 9, indent: 8 });
  pushPdfLine(items, '3. Cache, X-Robots-Tag i CORS pochodzą z odpowiedzi bez aktywnej sesji; robots.txt jest sprawdzany dla originu zdjęcia.', { size: 9, indent: 8 });
  pushPdfLine(items, '4. Domeny są grupowane po głównej domenie. ERR_BLOCKED_BY_CLIENT pozostaje oznaczony jako zablokowany lokalnie.', { size: 9, indent: 8 });
  pushPdfLine(items, '5. Pola hasła są sprawdzane cyklicznie. Wartości haseł nie są przechwytywane ani zapisywane.', { size: 9, indent: 8, gapAfter: 8 });

  pushPdfLine(items, 'Ograniczenia', { size: 11, font: 'bold', gapAfter: 3 });
  pushPdfLine(items, '- Raport opisuje jedno ładowanie jednej karty. Warunkowe zasoby, inne podstrony, interakcje użytkownika i zasoby uruchamiane później mogą nie zostać wykryte.', { size: 9, indent: 8 });
  pushPdfLine(items, '- CORS/pixel access oznacza możliwość odczytu treści zdjęcia przez JavaScript, nie jest sam w sobie dowodem przesłania pikseli do konkretnej domeny.', { size: 9, indent: 8 });
  pushPdfLine(items, '- Sprawdzenie Google ocenia deklaratywne blokady pobierania i indeksowania, a nie rzeczywistą obecność zdjęcia w indeksie wyszukiwarki.', { size: 9, indent: 8 });
  pushPdfLine(items, '- Klasyfikacja głównej domeny korzysta z ograniczonej listy sufiksów, a nie pełnej Public Suffix List.', { size: 9, indent: 8, gapAfter: 8 });

  pushPdfLine(items, 'Integralność i pliki dowodowe', { size: 11, font: 'bold', gapAfter: 5 });
  pushPdfBlock(items, 'SHA-256 payloadu: ' + formatHashForPdf(context.evidenceSha256) + '.\nSHA-256 kompletnego JSON: ' + formatHashForPdf(context.attachmentSha256) + '.\nJSON jest osadzony w PDF; ZIP zawiera także osobny JSON i manifest integralności.', {
    size: 9,
    font: 'bold',
    fill: PDF_COLORS.blueSoft,
    border: PDF_COLORS.blue,
    accent: PDF_COLORS.blue,
    gapAfter: 6
  });
  pushPdfLine(items, 'SHA-256 wykrywa zmianę plików, ale nie jest podpisem cyfrowym ani zaufanym znacznikiem czasu.', {
    size: 9,
    font: 'bold',
    color: PDF_COLORS.redDark,
    gapAfter: 0
  });
}

function getFindingReportItems(reportStats, context) {
  const items = [];
  const summary = context.summary;

  appendReportCover(items, reportStats, summary, context);
  appendScopeSection(items, reportStats, context);
  pushPdfPageBreak(items);
  appendImageReportSection(items, reportStats.imageFindings);
  pushPdfPageBreak(items);
  appendScriptReportSection(items, reportStats.scriptGroups);
  pushPdfPageBreak(items);
  appendPasswordReportSection(items, reportStats.passwordGroups, reportStats.passwordTree);
  pushPdfPageBreak(items);
  appendMethodSection(items, context);

  return items;
}
function getPdfItemHeight(item) {
  if (item.kind === 'text') {
    return (item.gapBefore || 0) + Math.ceil((item.size || 10) * 1.35) + (item.gapAfter || 0);
  }

  if (item.kind === 'block') {
    const lineHeight = Math.ceil((item.size || 10) * 1.4);
    return (item.gapBefore || 0) + ((item.padding || 0) * 2) + (item.lines.length * lineHeight) + (item.gapAfter || 0);
  }

  if (item.kind === 'rule') {
    return (item.gapBefore || 0) + 1 + (item.gapAfter || 0);
  }

  if (item.kind === 'image') {
    return (item.gapBefore || 0) + item.displayHeight + (item.gapAfter || 0);
  }

  return 0;
}

function paginatePdfItems(items) {
  const pages = [];
  let page = [];
  let y = PDF_PAGE.top;

  const finishPage = () => {
    if (page.length > 0) {
      pages.push(page);
      page = [];
    }
    y = PDF_PAGE.top;
  };

  items.forEach((item) => {
    if (item.kind === 'page-break') {
      finishPage();
      return;
    }

    const itemHeight = getPdfItemHeight(item);
    if (y - itemHeight < PDF_PAGE.bottom && page.length > 0) {
      finishPage();
    }

    y -= item.gapBefore || 0;

    if (item.kind === 'text') {
      const lineHeight = Math.ceil((item.size || 10) * 1.35);
      page.push({ ...item, baseline: y - (item.size || 10) });
      y -= lineHeight;
    } else if (item.kind === 'block') {
      const lineHeight = Math.ceil((item.size || 10) * 1.4);
      const blockHeight = ((item.padding || 0) * 2) + (item.lines.length * lineHeight);
      page.push({ ...item, top: y, height: blockHeight, lineHeight });
      y -= blockHeight;
    } else if (item.kind === 'rule') {
      page.push({ ...item, y: y - 0.5 });
      y -= 1;
    } else if (item.kind === 'image') {
      page.push({ ...item, top: y });
      y -= item.displayHeight;
    }

    y -= item.gapAfter || 0;
  });

  finishPage();
  return pages.length > 0 ? pages : [[]];
}

function pdfFillColor(color) {
  return color.map((value) => Number(value).toFixed(3)).join(' ') + ' rg';
}

function pdfStrokeColor(color) {
  return color.map((value) => Number(value).toFixed(3)).join(' ') + ' RG';
}

function renderPdfText(text, x, y, size, font, color) {
  const fontName = font === 'bold' ? 'F2' : 'F1';
  return 'BT /' + fontName + ' ' + size + ' Tf ' + pdfFillColor(color || PDF_COLORS.ink) + ' 1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + escapePdfString(text) + ') Tj ET';
}

function renderPdfItem(item) {
  const x = PDF_PAGE.margin + (item.indent || 0);

  if (item.kind === 'text') {
    return renderPdfText(item.text, x, item.baseline, item.size || 10, item.font, item.color);
  }

  if (item.kind === 'rule') {
    const width = PDF_PAGE.width - (PDF_PAGE.margin * 2);
    return pdfStrokeColor(item.color || PDF_COLORS.line) + ' 1 w ' + PDF_PAGE.margin + ' ' + item.y.toFixed(2) + ' m ' + (PDF_PAGE.margin + width) + ' ' + item.y.toFixed(2) + ' l S';
  }

  if (item.kind === 'image') {
    const bottom = item.top - item.displayHeight;
    const contentWidth = PDF_PAGE.width - (PDF_PAGE.margin * 2) - (item.indent || 0);
    const imageX = x + Math.max(0, (contentWidth - item.displayWidth) / 2);
    return [
      pdfFillColor([0.97, 0.98, 0.99]) + ' ' + (imageX - 4).toFixed(2) + ' ' + (bottom - 4).toFixed(2) + ' ' + (item.displayWidth + 8).toFixed(2) + ' ' + (item.displayHeight + 8).toFixed(2) + ' re f',
      pdfStrokeColor(PDF_COLORS.line) + ' 0.8 w ' + (imageX - 4).toFixed(2) + ' ' + (bottom - 4).toFixed(2) + ' ' + (item.displayWidth + 8).toFixed(2) + ' ' + (item.displayHeight + 8).toFixed(2) + ' re S',
      'q ' + item.displayWidth.toFixed(2) + ' 0 0 ' + item.displayHeight.toFixed(2) + ' ' + imageX.toFixed(2) + ' ' + bottom.toFixed(2) + ' cm /' + item.pdfImageName + ' Do Q'
    ].join('\n');
  }

  if (item.kind === 'block') {
    const bottom = item.top - item.height;
    const commands = [
      pdfFillColor(item.fill || PDF_COLORS.blueSoft) + ' ' + x + ' ' + bottom.toFixed(2) + ' ' + item.width.toFixed(2) + ' ' + item.height.toFixed(2) + ' re f',
      pdfStrokeColor(item.border || PDF_COLORS.line) + ' 0.8 w ' + x + ' ' + bottom.toFixed(2) + ' ' + item.width.toFixed(2) + ' ' + item.height.toFixed(2) + ' re S'
    ];

    let textX = x + item.padding;
    if (item.accent) {
      commands.push(pdfFillColor(item.accent) + ' ' + x + ' ' + bottom.toFixed(2) + ' 4 ' + item.height.toFixed(2) + ' re f');
      textX += 7;
    }

    item.lines.forEach((line, index) => {
      const baseline = item.top - item.padding - (item.size || 10) - (index * item.lineHeight);
      commands.push(renderPdfText(line, textX, baseline, item.size || 10, item.font, item.color));
    });

    return commands.join('\n');
  }

  return '';
}

function jpegDataUrlToHex(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/jpeg;base64,(.+)$/i);
  if (!match) {
    return '';
  }

  const binary = atob(match[1]);
  let hex = '';
  for (let index = 0; index < binary.length; index += 1) {
    hex += binary.charCodeAt(index).toString(16).padStart(2, '0');
  }
  return hex + '>';
}
function createPdfBlob(items, options = {}) {
  const pages = paginatePdfItems(items);
  const objects = [];
  const addObject = (value) => {
    objects.push(value);
    return objects.length;
  };

  const catalogId = addObject('');
  const pagesId = addObject('');
  const encoding = getPdfFontEncoding();
  const regularFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 145 /Widths [' + PDF_FONT_WIDTHS.regular.join(' ') + '] /Encoding ' + encoding + ' >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /FirstChar 32 /LastChar 145 /Widths [' + PDF_FONT_WIDTHS.bold.join(' ') + '] /Encoding ' + encoding + ' >>');
  const pageIds = [];
  const imageResources = [];
  const imageIdsByDataUrl = new Map();

  pages.flat().filter((item) => item.kind === 'image').forEach((item) => {
    if (!imageIdsByDataUrl.has(item.dataUrl)) {
      const hex = jpegDataUrlToHex(item.dataUrl);
      if (!hex) {
        return;
      }
      const imageId = addObject('<< /Type /XObject /Subtype /Image /Width ' + item.pixelWidth + ' /Height ' + item.pixelHeight + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ' + hex.length + ' >>\nstream\n' + hex + '\nendstream');
      const imageName = 'Im' + (imageResources.length + 1);
      imageIdsByDataUrl.set(item.dataUrl, { imageId, imageName });
      imageResources.push({ imageId, imageName });
    }

    const resource = imageIdsByDataUrl.get(item.dataUrl);
    if (resource) {
      item.pdfImageName = resource.imageName;
    }
  });

  pages.forEach((page, pageIndex) => {
    const header = renderPdfText('RAPORT RODO  |  ' + (options.domain || '-'), PDF_PAGE.margin, 760, 8, 'bold', PDF_COLORS.muted);
    const headerRule = pdfStrokeColor(PDF_COLORS.line) + ' 0.7 w ' + PDF_PAGE.margin + ' 751 m ' + (PDF_PAGE.width - PDF_PAGE.margin) + ' 751 l S';
    const footerRule = pdfStrokeColor(PDF_COLORS.line) + ' 0.7 w ' + PDF_PAGE.margin + ' 39 m ' + (PDF_PAGE.width - PDF_PAGE.margin) + ' 39 l S';
    const footerId = String(options.reportId || 'Raport RODO').slice(0, 82);
    const footer = renderPdfText(footerId + '  |  strona ' + (pageIndex + 1) + ' z ' + pages.length, PDF_PAGE.margin, 24, 7.5, 'regular', PDF_COLORS.muted);
    const content = [header, headerRule]
      .concat(page.map(renderPdfItem))
      .concat([footerRule, footer])
      .join('\n');

    const contentId = addObject('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    const xObjects = imageResources.length > 0
      ? ' /XObject << ' + imageResources.map((resource) => '/' + resource.imageName + ' ' + resource.imageId + ' 0 R').join(' ') + ' >>'
      : '';
    const pageId = addObject('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + PDF_PAGE.width + ' ' + PDF_PAGE.height + '] /Resources << /Font << /F1 ' + regularFontId + ' 0 R /F2 ' + boldFontId + ' 0 R >>' + xObjects + ' >> /Contents ' + contentId + ' 0 R >>');
    pageIds.push(pageId);
  });

  let fileSpecId = null;
  let embeddedNamesId = null;
  const attachmentText = options.attachmentText || '';
  const attachmentName = options.attachmentName || 'dowody-techniczne.json';

  if (attachmentText) {
    const embeddedFileId = addObject('<< /Type /EmbeddedFile /Subtype /application#2Fjson /Params << /Size ' + attachmentText.length + ' >> /Length ' + attachmentText.length + ' >>\nstream\n' + attachmentText + '\nendstream');
    fileSpecId = addObject('<< /Type /Filespec /F (' + escapePdfString(attachmentName) + ') /UF (' + escapePdfString(attachmentName) + ') /Desc (' + escapePdfString('Pełny aneks dowodowy w formacie JSON') + ') /AFRelationship /Data /EF << /F ' + embeddedFileId + ' 0 R /UF ' + embeddedFileId + ' 0 R >> >>');
    embeddedNamesId = addObject('<< /Names [(' + escapePdfString(attachmentName) + ') ' + fileSpecId + ' 0 R] >>');
  }

  const created = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const pdfDate = 'D:' + created.getFullYear() + String(created.getMonth() + 1).padStart(2, '0') + String(created.getDate()).padStart(2, '0') + String(created.getHours()).padStart(2, '0') + String(created.getMinutes()).padStart(2, '0') + String(created.getSeconds()).padStart(2, '0');
  const infoId = addObject('<< /Title (Raport RODO - ' + escapePdfString(options.domain || '') + ') /Subject (Raport oceny prywatnosci i aneks dowodowy) /Creator (Alarm prywatnosci strony) /CreationDate (' + pdfDate + ') >>');

  const attachmentCatalog = fileSpecId && embeddedNamesId
    ? ' /Names << /EmbeddedFiles ' + embeddedNamesId + ' 0 R >> /AF [' + fileSpecId + ' 0 R]'
    : '';
  objects[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R' + attachmentCatalog + ' >>';
  objects[pagesId - 1] = '<< /Type /Pages /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';

  let pdf = '%PDF-1.7\n%RODO\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });

  const xrefOffset = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';

  return new Blob([pdf], { type: 'application/pdf' });
}

async function exportReport(downloadMode) {
  const scanInProgress = Boolean(latestState && (
    latestState.scanning === true ||
    latestState.status === 'scanning'
  ));
  if (scanInProgress) {
    const shouldStop = window.confirm('Skanowanie nadal trwa. Zakończyć skan i utworzyć raport z dotychczas zebranych wyników?');
    if (!shouldStop) {
      elements.statusText.textContent = 'Skanowanie trwa. Raport nie został utworzony.';
      return;
    }

    setBusy(true);
    elements.statusText.textContent = 'Zatrzymuję skanowanie przed utworzeniem raportu...';
    try {
      const stoppedState = await sendMessage('stopScan');
      render(stoppedState);
    } catch (error) {
      setBusy(false);
      throw error;
    }
  }

  const hasReportData = Boolean(latestState && (
    latestState.pageUrl ||
    latestState.scanStartedAt ||
    latestState.status === 'stopped' ||
    latestState.status === 'detached' ||
    latestState.status === 'error'
  ));
  if (!hasReportData) {
    setBusy(false);
    return;
  }

  const sourceReportStats = getReportStats();
  setBusy(true);
  elements.statusText.textContent = 'Tworzę raport i obliczam odcisk dowodów...';

  try {
    const reportStats = await prepareReportStats(sourceReportStats);
    const generatedAt = new Date();
    const summary = getSecuritySummary();
    const reportId = 'RODO-' + getReportPageDomain() + '-' + getFilenameTimestamp(generatedAt);
    const evidencePayload = buildEvidencePayload(reportStats, summary, generatedAt, reportId);
    const evidencePayloadText = JSON.stringify(evidencePayload);
    const evidenceSha256 = await sha256Text(evidencePayloadText);
    const evidenceAttachment = {
      ...evidencePayload,
      integrity: {
        algorithm: 'SHA-256',
        scope: 'JSON.stringify(evidencePayload) before adding integrity',
        sha256: evidenceSha256,
        limitation: 'This checksum is not a digital signature, trusted timestamp or proof of authorship.'
      }
    };
    const attachmentText = stringifyAsciiJson(evidenceAttachment);
    const attachmentSha256 = await sha256Text(attachmentText);
    const filename = getPdfReportFilename(generatedAt);
    const fileBase = filename.replace(/\.pdf$/i, '');
    const jsonFilename = fileBase + '-dowody-techniczne.json';
    const integrityFilename = fileBase + '-integralnosc.sha256.txt';
    const context = {
      reportId,
      generatedAt,
      pageUrl: latestState && latestState.pageUrl ? latestState.pageUrl : '-',
      summary,
      evidenceSha256,
      attachmentSha256
    };
    const pdf = createPdfBlob(getFindingReportItems(reportStats, context), {
      reportId,
      domain: getReportPageDomain(),
      generatedAt,
      attachmentName: 'dowody-techniczne.json',
      attachmentText
    });
    const pdfSha256 = await sha256Blob(pdf);
    const integrityText = [
      '# Raport RODO - odłączony manifest integralności SHA-256',
      '# Identyfikator: ' + reportId,
      '# Wygenerowano: ' + generatedAt.toISOString(),
      '# Przechowuj ten plik niezależnie od PDF i JSON.',
      '# SHA-256 nie jest podpisem cyfrowym ani zaufanym znacznikiem czasu.',
      pdfSha256 + '  ' + filename,
      attachmentSha256 + '  ' + jsonFilename,
      '# SHA-256 payloadu JSON przed dodaniem pola integrity:',
      evidenceSha256
    ].join('\n') + '\n';
    const jsonBlob = new Blob([attachmentText], { type: 'application/json' });
    const integrityBlob = new Blob([integrityText], { type: 'text/plain' });

    if (downloadMode === 'zip') {
      const zipFilename = fileBase + '-komplet.zip';
      const zip = await createZipBlob([
        { name: filename, blob: pdf },
        { name: jsonFilename, blob: jsonBlob },
        { name: integrityFilename, blob: integrityBlob }
      ], generatedAt);
      downloadBlob(zipFilename, zip);
      elements.statusText.textContent = 'Pobrano komplet ZIP: raport PDF, pełny JSON i manifest integralności SHA-256.';
    } else {
      downloadBlob(filename, pdf);
      elements.statusText.textContent = 'Pobrano raport PDF z osadzonym aneksem dowodowym JSON.';
    }
  } finally {
    setBusy(false);
  }
}

async function exportImagesPdf() {
  return exportReport('pdf');
}

async function exportReportZip() {
  return exportReport('zip');
}
