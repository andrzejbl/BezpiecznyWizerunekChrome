// Polityka eksportu: PDF z załącznikiem oraz komplet PDF + JSON + integralność.

import { createReportModel, reportFileNames } from './model.js';
import { buildIntegrityManifest } from './evidence.js';

/**
 * Tworzy komplet dokumentu, danych dowodowych i manifestu.
 * @param {import("../../../types/report.js").Report} report
 * @param {import("../../../types/report.js").ReportPorts} ports
 */
export async function createReportFiles(report, ports) {
  const { reportStats, summary, generatedAt, reportId, evidence } = report;
  const names = reportFileNames(ports.getPdfReportFilename(generatedAt));
  // Bieżący adres pobieramy po asynchronicznym przygotowaniu dowodów.
  const latestState = ports.getLatestState();
  const context = {
    reportId,
    generatedAt,
    pageUrl: latestState && latestState.pageUrl ? latestState.pageUrl : '-',
    summary,
    evidenceSha256: evidence.evidenceSha256,
    attachmentSha256: evidence.attachmentSha256
  };
  // Model wybiera sekcje; funkcja budująca instrukcje zwraca PdfItem[], jeszcze bez bajtów pliku.
  const documentItems = ports.renderReportDocument(createReportModel(reportStats, context));
  // Dopiero moduł zapisujący PDF rozmieszcza elementy na stronach i tworzy obiekt Blob.
  const pdf = ports.createPdf(documentItems, {
    reportId,
    domain: ports.getReportPageDomain(),
    generatedAt,
    attachmentName: 'dowody-techniczne.json',
    attachmentText: evidence.attachmentText
  });
  // Trzeci skrót obejmuje bajty gotowego PDF z osadzonym JSON. Manifest jest
  // osobnym plikiem, więc dopisanie go nie zmienia skrótu PDF ani JSON.
  const pdfSha256 = await ports.hashFile(pdf);
  const integrityText = buildIntegrityManifest(report, names, pdfSha256);
  const json = ports.createJsonFile(evidence.attachmentText);
  const integrity = ports.createTextFile(integrityText);
  return { names, pdf, json, integrity, generatedAt };
}

/**
 * Wybiera plik odpowiadający formatowi wskazanemu przez użytkownika.
 * @param {"pdf" | "zip"} downloadMode
 * @param {import("../../../types/report.js").ReportFiles} files
 * @param {import("../../../types/report.js").ReportPorts["createArchive"]} createArchive
 */
export async function chooseReportDownload(downloadMode, files, createArchive) {
  // Oba tryby otrzymują ten sam komplet plików; dopiero tutaj wybieramy pobranie.
  const { names, pdf, json, integrity, generatedAt } = files;
  if (downloadMode === 'zip') {
    const zip = await createArchive([
      { name: names.pdf, blob: pdf },
      { name: names.json, blob: json },
      { name: names.integrity, blob: integrity }
    ], generatedAt);
    return {
      filename: names.zip,
      file: zip,
      statusText: 'Pobrano komplet ZIP: raport PDF, pełny JSON i manifest integralności SHA-256.'
    };
  }
  return {
    filename: names.pdf,
    file: pdf,
    statusText: 'Pobrano raport PDF z osadzonym aneksem dowodowym JSON.'
  };
}
