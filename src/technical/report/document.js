// Przekład modelu raportu na elementy układu PDF. Treść i kolejność sekcji
// wyznacza model biznesowy; tutaj znajdują się granice stron i funkcje budujące instrukcje.

import { createReportModel } from '../../business/report/model.js';
import { getExtensionManifest } from './browser.js';
import { pushPdfPageBreak } from './pdf/items.js';
import { appendReportCover } from './sections/cover.js';
import { appendScopeSection } from './sections/scope.js';
import { appendImageReportSection } from './sections/images.js';
import { appendScriptReportSection } from './sections/scripts.js';
import { appendPasswordReportSection } from './sections/passwords.js';
import { appendMethodSection } from './sections/method.js';

/**
 * Tłumaczy sekcje biznesowe na uporządkowane instrukcje PDF.
 * @param {import("../../../types/report.js").ReportModel} model
 * @param {import("../../../types/report.js").ReportDocumentDependencies} dependencies
 * @returns {import("../../../types/pdf.js").PdfItem[]}
 */
export function renderReportDocument(model, dependencies) {
  /** @type {import('../../../types/pdf.js').PdfItem[]} */
  const items = [];
  const { context } = model;
  for (const section of model.sections) {
    switch (section.kind) {
      case 'cover':
        appendReportCover(items, section.reportStats, section.summary, context, dependencies.riskCopy);
        break;
      case 'scope':
        // Stan czytamy w tym miejscu, po okładce, tak jak podczas dotychczasowego eksportu.
        appendScopeSection(
          items, section.reportStats, context,
          dependencies.getLatestState(), dependencies.getExtensionManifest()
        );
        break;
      case 'images':
        pushPdfPageBreak(items);
        appendImageReportSection(items, section.findings, dependencies.minImageLongSide);
        break;
      case 'scripts':
        pushPdfPageBreak(items);
        appendScriptReportSection(items, section.groups);
        break;
      case 'passwords':
        pushPdfPageBreak(items);
        appendPasswordReportSection(items, section.groups, section.tree);
        break;
      case 'method':
        pushPdfPageBreak(items);
        appendMethodSection(items, context);
        break;
    }
  }
  return items;
}

// Pomocniczy interfejs do porównania układu ze wcześniejszymi raportami.
/**
 * Pomocnicze wejście do zamiany modelu raportu na instrukcje dokumentu.
 * @param {import("../../../types/report.js").PreparedReportStats} reportStats
 * @param {import("../../../types/report.js").ReportContext} context
 * @param {Omit<import("../../../types/report.js").ReportDocumentDependencies, "getExtensionManifest"> & {getExtensionManifest?: import("../../../types/report.js").ReportDocumentDependencies["getExtensionManifest"]}} dependencies
 */
export function getFindingReportItems(reportStats, context, dependencies) {
  return renderReportDocument(createReportModel(reportStats, context), {
    ...dependencies,
    getExtensionManifest: dependencies.getExtensionManifest || getExtensionManifest
  });
}
