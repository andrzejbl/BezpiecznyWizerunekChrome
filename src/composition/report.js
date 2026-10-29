// Jedno miejsce połączenia scenariusza raportowania z przeglądarką i formatami plików.
// Okno rozszerzenia przekazuje odczyt własnego stanu i obsługę komunikatów; resztę zapewniają adaptery.

import { exportReport as runReportExport } from '../business/report/export.js';
import { buildEvidencePayload as createEvidencePayload } from '../business/report/evidence.js';
import { getExtensionManifest, confirmStopScan, reportGenerationTime } from '../technical/report/browser.js';
import { createReportPreviewJpeg } from '../technical/report/previews.js';
import { formatReportDate } from '../technical/report/format.js';
import {
  cloneEvidenceValue, stringifyEvidencePayload, stringifyAsciiJson,
  sha256Text, sha256Blob, createJsonBlob, createTextBlob
} from '../technical/report/serialization.js';
import { renderReportDocument } from '../technical/report/document.js';
import { createPdfBlob } from '../technical/report/pdf/encoder.js';
import { createZipBlob } from '../technical/report/zip.js';

/**
 * Łączy nazwane potrzeby scenariusza z adapterami technicznymi.
 * @param {import("../../types/report.js").ReportDependencies} dependencies
 * @returns {import("../../types/report.js").ReportPorts}
 */
export function createReportPorts(dependencies) {
  return {
    // Odczyt sesji okna rozszerzenia i nazwy plików.
    getLatestState: dependencies.getLatestState,
    getReportStats: dependencies.getReportStats,
    getSecuritySummary: dependencies.getSecuritySummary,
    getReportPageDomain: dependencies.getReportPageDomain,
    getFilenameTimestamp: dependencies.getFilenameTimestamp,
    getPdfReportFilename: dependencies.getPdfReportFilename,
    // Postęp, odświeżenie sesji, pobranie i zakończenie skanu.
    setBusy: dependencies.setBusy,
    setStatusText: dependencies.setStatusText,
    render: dependencies.render,
    downloadBlob: dependencies.downloadBlob,
    stopScan: () => dependencies.sendMessage('stopScan'),
    confirmStopScan,
    // Przygotowanie podglądów, metadanych, tekstu JSON i skrótów.
    now: reportGenerationTime,
    getExtensionManifest,
    createImagePreview: createReportPreviewJpeg,
    cloneEvidenceValue,
    formatReportDate,
    serializeEvidencePayload: stringifyEvidencePayload,
    serializeEvidenceAttachment: stringifyAsciiJson,
    hashText: sha256Text,
    hashFile: sha256Blob,
    // Model sekcji -> instrukcje dokumentu -> gotowe pliki.
    renderReportDocument: (model) => renderReportDocument(model, {
      getLatestState: dependencies.getLatestState,
      riskCopy: dependencies.riskCopy,
      minImageLongSide: dependencies.minImageLongSide,
      getExtensionManifest
    }),
    createPdf: createPdfBlob,
    createJsonFile: createJsonBlob,
    createTextFile: createTextBlob,
    createArchive: createZipBlob
  };
}

/**
 * Uruchamia eksport z zależnościami dostarczonymi przez okno rozszerzenia.
 * @param {"pdf" | "zip"} downloadMode
 * @param {import("../../types/report.js").ReportDependencies} dependencies
 */
export async function exportReport(downloadMode, dependencies) {
  return runReportExport(downloadMode, createReportPorts(dependencies));
}

/**
 * Eksportuje PDF z osadzonym załącznikiem JSON.
 * Historyczna nazwa: PDF obejmuje cały raport, także domeny i pola hasła.
 * @param {import("../../types/report.js").ReportDependencies} dependencies
 */
export async function exportImagesPdf(dependencies) {
  return exportReport('pdf', dependencies);
}

/**
 * Eksportuje ZIP z PDF, JSON i manifestem.
 * @param {import("../../types/report.js").ReportDependencies} dependencies
 */
export async function exportReportZip(dependencies) {
  return exportReport('zip', dependencies);
}

// Zachowany podpis pomocniczy do kontroli zgodności formatu dowodowego.
// Główny eksport używa business/report/prepare.js, a nie tego pomocniczego wejścia.
/**
 * Adapter pomocniczy zachowujący kontrakt dowodów.
 * @param {import("../../types/report.js").PreparedReportStats} reportStats
 * @param {import("../../types/popup.js").SecuritySummary} summary
 * @param {Date} generatedAt
 * @param {string} reportId
 * @param {import("../../types/scanning.js").ScanSnapshot | null} latestState
 */
export function buildEvidencePayload(reportStats, summary, generatedAt, reportId, latestState) {
  return createEvidencePayload(reportStats, summary, generatedAt, reportId, latestState, {
    manifest: getExtensionManifest(), cloneEvidenceValue, formatReportDate
  });
}
