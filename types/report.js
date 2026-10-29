// Kontrakty scenariusza raportowania. Porty opisują potrzeby biznesu,
// a adaptery przeglądarki i formatów plików są wybierane w composition/report.js.

/** @typedef {import('./popup.js').ReportStats} ReportStats */
/** @typedef {import('./popup.js').SecuritySummary} SecuritySummary */
/** @typedef {import('./scanning.js').ScanSnapshot} ScanSnapshot */
/** @typedef {import('./pdf.js').PdfItem} PdfItem */
/** @typedef {import('./pdf.js').PdfPreview} PdfPreview */
/** @typedef {import('./popup.js').VisibleImage & {reportPreviewJpeg?: PdfPreview | null}} ReportImage */
/** @typedef {Omit<ReportStats, 'imageFindings'> & {imageFindings: ReportImage[]}} PreparedReportStats */

/**
 * Tekst JSON wspólny dla pliku i załącznika oraz skróty obu etapów serializacji.
 * @typedef {object} ReportEvidence
 * @property {string} evidenceSha256 Skrót danych dowodowych przed dodaniem pola integrity.
 * @property {string} attachmentText Pełny JSON zawierający metadane integralności.
 * @property {string} attachmentSha256 Skrót dokładnego tekstu załącznika.
 */
/**
 * Dane przygotowane do raportu; evidence powstaje po obliczeniu skrótów.
 * @typedef {object} ReportDraft
 * @property {PreparedReportStats} reportStats
 * @property {Date} generatedAt
 * @property {SecuritySummary} summary
 * @property {string} reportId
 * @property {ReportEvidence} [evidence]
 */
/** @typedef {ReportDraft & {evidence: ReportEvidence}} Report */

/**
 * Dane wspólne dla wszystkich sekcji gotowego dokumentu.
 * @typedef {object} ReportContext
 * @property {string} reportId
 * @property {Date} generatedAt
 * @property {string} pageUrl
 * @property {SecuritySummary} summary
 * @property {string} evidenceSha256
 * @property {string} attachmentSha256
 */
/** @typedef {{kind: 'cover', reportStats: PreparedReportStats, summary: SecuritySummary}} CoverSection */
/** @typedef {{kind: 'scope', reportStats: PreparedReportStats}} ScopeSection */
/** @typedef {{kind: 'images', findings: ReportImage[]}} ImagesSection */
/** @typedef {{kind: 'scripts', groups: ReportStats['scriptGroups']}} ScriptsSection */
/** @typedef {{kind: 'passwords', groups: ReportStats['passwordGroups'], tree: ReportStats['passwordTree']}} PasswordsSection */
/** @typedef {{kind: 'method'}} MethodSection */
/** @typedef {CoverSection | ScopeSection | ImagesSection | ScriptsSection | PasswordsSection | MethodSection} ReportSection */

/**
 * Model biznesowy dokumentu, bez rozmiarów i instrukcji rysowania PDF.
 * @typedef {object} ReportModel
 * @property {ReportContext} context
 * @property {ReportSection[]} sections Kolejność sekcji jest kolejnością dokumentu.
 */
/** @typedef {{pdf: string, json: string, integrity: string, zip: string}} ReportFileNames */
/**
 * Komplet plików przed wyborem pobrania PDF albo archiwum ZIP.
 * @typedef {object} ReportFiles
 * @property {ReportFileNames} names
 * @property {Blob} pdf
 * @property {Blob} json
 * @property {Blob} integrity
 * @property {Date} generatedAt
 */
/** @typedef {{name: string, blob: Blob}} ZipEntry */
/** @typedef {{date: number, time: number}} ZipDosDateTime */
/** @typedef {{id: string, name: string, description: string}} CweEntry */
/**
 * @typedef {object} ReportPriority
 * @property {'critical' | 'high' | 'elevated' | 'informational' | 'clear'} level
 * @property {string} label
 * @property {string} [detail]
 */
/** @typedef {{name: string, version: string}} ExtensionManifest */
/** @typedef {<T>(value: T) => T} CloneEvidenceValue Kopia JSON z usuniętymi podglądami. */
/** @typedef {(value: Date | string | number | null | undefined) => string} FormatReportDate */
/**
 * Operacje potrzebne do zbudowania danych dowodowych przed zapisem JSON i obliczeniem skrótu.
 * @typedef {object} EvidenceFormat
 * @property {ExtensionManifest} manifest
 * @property {CloneEvidenceValue} cloneEvidenceValue
 * @property {FormatReportDate} formatReportDate
 */
/** @typedef {ReturnType<typeof import('../src/business/report/evidence.js').buildEvidencePayload>} EvidencePayload */

/**
 * Dane i działania dostarczane przez okno rozszerzenia przy składaniu raportu.
 * @typedef {object} ReportDependencies
 * @property {() => ScanSnapshot | null} getLatestState
 * @property {() => ReportStats} getReportStats
 * @property {() => SecuritySummary} getSecuritySummary
 * @property {() => string} getReportPageDomain
 * @property {(date: Date) => string} getFilenameTimestamp
 * @property {(date: Date) => string} getPdfReportFilename
 * @property {(busy: boolean) => void} setBusy
 * @property {(text: string) => void} setStatusText
 * @property {(type: 'stopScan') => Promise<ScanSnapshot>} sendMessage
 * @property {(state: ScanSnapshot) => void} render
 * @property {(filename: string, blob: Blob) => void} downloadBlob
 * @property {(summary: SecuritySummary) => import('./popup.js').RiskCopy} riskCopy
 * @property {number} minImageLongSide
 */

/**
 * Pełny kontrakt scenariusza: odczyt danych, przygotowanie dowodów i pobranie pliku.
 * Wszystkie efekty uboczne są jawnie nazwane, aby scenariusz nie zależał od Chrome/DOM.
 * @typedef {object} ReportPorts
 * @property {ReportDependencies['getLatestState']} getLatestState
 * @property {ReportDependencies['getReportStats']} getReportStats
 * @property {ReportDependencies['getSecuritySummary']} getSecuritySummary
 * @property {ReportDependencies['getReportPageDomain']} getReportPageDomain
 * @property {ReportDependencies['getFilenameTimestamp']} getFilenameTimestamp
 * @property {ReportDependencies['getPdfReportFilename']} getPdfReportFilename
 * @property {ReportDependencies['setBusy']} setBusy
 * @property {ReportDependencies['setStatusText']} setStatusText
 * @property {ReportDependencies['render']} render
 * @property {ReportDependencies['downloadBlob']} downloadBlob
 * @property {() => Promise<ScanSnapshot>} stopScan
 * @property {() => boolean} confirmStopScan
 * @property {() => Date} now
 * @property {() => ExtensionManifest} getExtensionManifest
 * @property {(image: import('./popup.js').VisibleImage) => Promise<PdfPreview | null>} createImagePreview
 * @property {CloneEvidenceValue} cloneEvidenceValue
 * @property {FormatReportDate} formatReportDate
 * @property {(value: EvidencePayload) => string} serializeEvidencePayload
 * @property {(value: object) => string} serializeEvidenceAttachment
 * @property {(text: string) => Promise<string>} hashText
 * @property {(blob: Blob) => Promise<string>} hashFile
 * @property {(model: ReportModel) => PdfItem[]} renderReportDocument
 * @property {(items: PdfItem[], options: import('./pdf.js').PdfOptions) => Blob} createPdf
 * @property {(text: string) => Blob} createJsonFile
 * @property {(text: string) => Blob} createTextFile
 * @property {(files: ZipEntry[], generatedAt: Date) => Promise<Blob>} createArchive
 */
/**
 * Zależności tworzenia instrukcji sekcji, używane dopiero w adapterze dokumentu.
 * @typedef {object} ReportDocumentDependencies
 * @property {ReportDependencies['getLatestState']} getLatestState
 * @property {ReportDependencies['riskCopy']} riskCopy
 * @property {number} minImageLongSide
 * @property {() => ExtensionManifest} getExtensionManifest
 */

export {};
