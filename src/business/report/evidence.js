// Model dowodów: jakie dane trafiają do raportu i w jakiej kolejności.
// Kolejność pól jest częścią kontraktu skrótu integralności eksportu.

import { REPORT_CWE } from './cwe.js';
import { reportCount as formatNumber } from './rules.js';

// Lokalne podglądy służą wyłącznie ilustracji PDF, nie należą do danych dowodowych.
/**
 * Pomija obrazy podglądu w dowodach JSON.
 * @param {string} key
 */
export function shouldOmitEvidenceField(key) {
  return key === 'previewDataUrl' || key === 'reportPreviewJpeg';
}

/**
 * Buduje dane dowodowe; kolejność pól musi pozostać stabilna dla SHA-256.
 * @param {import("../../../types/report.js").PreparedReportStats} reportStats
 * @param {import("../../../types/popup.js").SecuritySummary} summary
 * @param {Date} generatedAt
 * @param {string} reportId
 * @param {import("../../../types/scanning.js").ScanSnapshot | null} latestState
 * @param {import("../../../types/report.js").EvidenceFormat} evidenceFormat
 */
export function buildEvidencePayload(reportStats, summary, generatedAt, reportId, latestState, evidenceFormat) {
  const { manifest, cloneEvidenceValue, formatReportDate } = evidenceFormat;
  /** @type {Partial<import('../../../types/scanning.js').ScriptTree>} */
  const scriptTree = reportStats.scriptTree || {};
  /** @type {Partial<import('../../../types/scanning.js').PasswordAccessTree>} */
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
      verificationMethod:
        'User visually verifies that reported images contain personal data before relying on the report.'
    },
    scan: {
      startedAt: latestState && latestState.scanStartedAt ? latestState.scanStartedAt : '',
      stoppedAt: latestState && latestState.scanStoppedAt ? latestState.scanStoppedAt : '',
      debuggerDetachedAt:
        latestState && latestState.debuggerDetachedAt ? latestState.debuggerDetachedAt : '',
      status: latestState && latestState.status ? latestState.status : '',
      statusMessage: latestState && latestState.statusMessage ? latestState.statusMessage : '',
      attachedAtReportGeneration: Boolean(latestState && latestState.attached),
      scanningAtReportGeneration: Boolean(latestState && latestState.scanning),
      passwordPollingAtReportGeneration: Boolean(latestState && latestState.passwordInputPolling),
      passwordPollIntervalMs:
        latestState && latestState.passwordInputPollIntervalMs
          ? latestState.passwordInputPollIntervalMs
          : null
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
      imageAccess:
        'Original Network response body is compared byte-for-byte by SHA-256 and length with a CDP Network.loadNetworkResource request using includeCredentials=false and disableCache=true. Both HTTP statuses must be 2xx. Returning the same image without an active user session is classified as incorrect user authorization under CWE-863; a URL token may be validated, but access is not bound to a verified user identity and entitlement.',
      responseHeaders:
        'Cache-Control, X-Robots-Tag and CORS are evaluated from resource.headers returned by the no-credentials image request.',
      imagePixelAccess:
        'Potential image pixel access is evaluated separately for each live script execution context using its security origin and the image response headers. Other contexts are probed for their origin and access to top.document without reading images. The main document origin is considered only for its default context or confirmed document access; an isolated frame may still have independent access through its own origin or CORS. Missing contexts, incomplete checks and locally blocked scripts are reported as unknown; independently justified access may coexist with an incomplete check. Retired contexts do not receive potential access. Group counts combine images available to at least one assessed origin, not every script in the group. This is a header-based capability assessment, not an observed image read.',
      thirdPartyDomains:
        'Only registrable domains different from the page registrable domain are reported. First-party, same-site, inline/eval/blob and browser/internal sources are excluded.',
      blockedScripts:
        'ERR_BLOCKED_BY_CLIENT scripts are preserved as potential evidence and explicitly marked as not executed locally.',
      passwordAccess:
        'Password fields are polled in the main document and DOM/value access is instrumented. Potential access is tied to execution contexts: the main default context is accessible, other known contexts are probed for access to top.document without reading password values. Isolated contexts are excluded from potential access; missing or failed context checks are reported as unknown. Observed events remain separate and may concern fields inside frames. Password values are never read into or stored by the extension.',
      indexing:
        'Google exposure is assessed from X-Robots-Tag and robots.txt for the image origin.',
      cache:
        'A cache concern is reported when the no-credentials response Cache-Control header does not contain no-store.',
      cweScope:
        'CWE mappings classify technical weakness patterns. The report assumes that the user visually confirmed personal data in the images and that access should be restricted to an identified, entitled user. Trust boundaries still require contextual review.'
    },
    integrityModel: {
      evidencePayloadSha256: 'Calculated before the integrity field is added.',
      detachedFiles:
        'The complete ZIP export contains the PDF, standalone JSON evidence and a detached SHA-256 manifest for the PDF and JSON.',
      limitation:
        'SHA-256 detects changes relative to a separately preserved checksum. It is not a digital signature, trusted timestamp or proof of authorship.'
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
        unknownScripts: formatNumber(passwordTree.unknownScripts),
        unknownDomainsCount: formatNumber(passwordTree.unknownDomainsCount),
        lastChecked: passwordTree.lastChecked || '',
        groups: cloneEvidenceValue(reportStats.passwordGroups)
      }
    }
  };
}

// Skrót dotyczy danych dowodowych sprzed dodania metadanych integralności.
/**
 * Dołącza metadane skrótu obliczonego dla danych dowodowych.
 * @param {import("../../../types/report.js").EvidencePayload} evidencePayload
 * @param {string} evidenceSha256
 */
export function attachEvidenceIntegrity(evidencePayload, evidenceSha256) {
  return {
    ...evidencePayload,
    integrity: {
      algorithm: 'SHA-256',
      scope: 'JSON.stringify(evidencePayload) before adding integrity',
      sha256: evidenceSha256,
      limitation:
        'This checksum is not a digital signature, trusted timestamp or proof of authorship.'
    }
  };
}

/**
 * Tworzy manifest ze skrótami gotowych plików PDF i JSON.
 * @param {import("../../../types/report.js").Report} report
 * @param {import("../../../types/report.js").ReportFileNames} names
 * @param {string} pdfSha256
 */
export function buildIntegrityManifest(report, names, pdfSha256) {
  const { reportId, generatedAt, evidence } = report;
  return [
    '# Raport RODO - odłączony manifest integralności SHA-256',
    '# Identyfikator: ' + reportId,
    '# Wygenerowano: ' + generatedAt.toISOString(),
    '# Przechowuj ten plik niezależnie od PDF i JSON.',
    '# SHA-256 nie jest podpisem cyfrowym ani zaufanym znacznikiem czasu.',
    pdfSha256 + '  ' + names.pdf,
    evidence.attachmentSha256 + '  ' + names.json,
    '# SHA-256 payloadu JSON przed dodaniem pola integrity:',
    evidence.evidenceSha256
  ].join('\n') + '\n';
}
