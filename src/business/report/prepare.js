// Przygotowanie danych raportu: podglądy, dowody i ich integralność.

import { buildEvidencePayload, attachEvidenceIntegrity } from './evidence.js';

/**
 * Dodaje lokalne podglądy, zachowując oryginalne ustalenia.
 * @param {import("../../../types/popup.js").ReportStats} reportStats
 * @param {import("../../../types/report.js").ReportPorts["createImagePreview"]} createImagePreview
 * @returns {Promise<import("../../../types/report.js").PreparedReportStats>}
 */
export async function prepareReportFindings(reportStats, createImagePreview) {
  const images = await Promise.all(
    reportStats.imageFindings.map(async (image) => ({
      ...image,
      reportPreviewJpeg: await createImagePreview(image)
    }))
  );
  return { ...reportStats, imageFindings: images };
}

/**
 * Utrwala wspólny JSON dla PDF i ZIP oraz oba skróty integralności.
 * @param {import("../../../types/report.js").ReportDraft} report
 * @param {import("../../../types/report.js").ReportPorts} ports
 * @returns {Promise<import("../../../types/report.js").ReportEvidence>}
 */
export async function prepareReportEvidence(report, ports) {
  const { reportStats, summary, generatedAt, reportId } = report;
  // Metadane skanu czytamy po utworzeniu podglądów. Ustalenia i podsumowanie
  // pochodzą z wcześniejszych kroków exportReport; nie pobieramy ich tu ponownie.
  const latestState = ports.getLatestState();
  const evidencePayload = buildEvidencePayload(
    reportStats, summary, generatedAt, reportId, latestState, {
      manifest: ports.getExtensionManifest(),
      cloneEvidenceValue: ports.cloneEvidenceValue,
      formatReportDate: ports.formatReportDate
    }
  );
  // Pierwszy skrót: dane dowodowe bez pola integrity, zapisane przez
  // JSON.stringify bez wcięć i zakodowane jako UTF-8.
  const payloadText = ports.serializeEvidencePayload(evidencePayload);
  const evidenceSha256 = await ports.hashText(payloadText);
  const attachment = attachEvidenceIntegrity(evidencePayload, evidenceSha256);
  // Załącznik PDF i samodzielny JSON muszą zawierać ten sam tekst.
  // Drugi skrót obejmuje JSON z integrity, wcięciami i znakami spoza ASCII
  // zapisanymi jako sekwencje Unicode. Nie jest skrótem pierwszej serializacji.
  const attachmentText = ports.serializeEvidenceAttachment(attachment);
  const attachmentSha256 = await ports.hashText(attachmentText);
  return { evidenceSha256, attachmentText, attachmentSha256 };
}
