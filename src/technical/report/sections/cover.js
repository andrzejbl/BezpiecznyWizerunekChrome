// Werdykt na okładce, karty podsumowania i zalecane działanie.

import { reportPriority } from '../../../business/report/rules.js';
import { PDF_COLORS } from '../pdf/theme.js';
import { REPORT_CWE, formatCwe } from '../../../business/report/cwe.js';
import { formatReportDate } from '../format.js';
import { pushPdfLine, pushPdfBlock, pushPdfSection, pushPdfPageBreak } from '../pdf/items.js';

// Tylko prezentacja priorytetu; decyzja o jego poziomie należy do biznesu.
const PRIORITY_STYLE = {
  critical: { color: PDF_COLORS.redDark, fill: PDF_COLORS.redSoft },
  high: { color: PDF_COLORS.red, fill: PDF_COLORS.redSoft },
  elevated: { color: PDF_COLORS.amber, fill: PDF_COLORS.amberSoft },
  informational: { color: PDF_COLORS.blue, fill: PDF_COLORS.blueSoft },
  clear: { color: PDF_COLORS.green, fill: PDF_COLORS.greenSoft }
};

/**
 * Dodaje treść sekcji do instrukcji dokumentu PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/report.js").PreparedReportStats} reportStats
 * @param {import("../../../../types/popup.js").SecuritySummary} summary
 * @param {import("../../../../types/report.js").ReportContext} context
 * @param {import("../../../../types/report.js").ReportDependencies["riskCopy"]} riskCopy
 */
export function appendReportCover(items, reportStats, summary, context, riskCopy) {
  const verdict = riskCopy(summary);
  const classification = reportPriority(summary);
  const priority = { ...classification, ...PRIORITY_STYLE[classification.level] };

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
  pushPdfBlock(
    items,
    'BRAK POPRAWNEJ AUTORYZACJI: ' +
      summary.improperAuthorizationImages +
      ' ZDJĘĆ.\nIdentyczne pliki zostały zwrócone bez aktywnej sesji.\nCWE: ' +
      formatCwe(REPORT_CWE.improperAuthorization) +
      '; skutek dla danych osobowych: ' +
      formatCwe(REPORT_CWE.personalDataExposure) +
      '.',
    {
      size: 9,
      font: 'bold',
      fill: summary.improperAuthorizationImages > 0 ? PDF_COLORS.redSoft : PDF_COLORS.greenSoft,
      border: summary.improperAuthorizationImages > 0 ? PDF_COLORS.red : PDF_COLORS.green,
      accent: summary.improperAuthorizationImages > 0 ? PDF_COLORS.red : PDF_COLORS.green,
      padding: 7,
      gapAfter: 4
    }
  );
  pushPdfBlock(
    items,
    'ZDJĘCIA MOGĄ POZOSTAĆ NA DYSKU: ' +
      summary.cacheIssues +
      ' ZDJĘĆ.\nAplikacja nie blokuje ich zapisu w cache, co zwiększa ryzyko dostępu niepowołanych osób i aplikacji.\nCWE: ' +
      formatCwe(REPORT_CWE.browserCache) +
      '.',
    {
      size: 9,
      font: 'bold',
      fill: summary.cacheIssues > 0 ? PDF_COLORS.amberSoft : PDF_COLORS.greenSoft,
      border: summary.cacheIssues > 0 ? PDF_COLORS.amber : PDF_COLORS.green,
      accent: summary.cacheIssues > 0 ? PDF_COLORS.amber : PDF_COLORS.green,
      padding: 7,
      gapAfter: 4
    }
  );
  pushPdfBlock(
    items,
    'DOSTĘPNE DLA GOOGLE WEDŁUG WYKRYTYCH REGUŁ: ' +
      summary.googleIssues +
      ' ZDJĘĆ.\nNie wykryto blokady w X-Robots-Tag ani robots.txt.',
    {
      size: 9,
      font: 'bold',
      fill: summary.googleIssues > 0 ? PDF_COLORS.blueSoft : PDF_COLORS.greenSoft,
      border: summary.googleIssues > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
      accent: summary.googleIssues > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
      padding: 7,
      gapAfter: 6
    }
  );
  pushPdfBlock(
    items,
    'DOMENY ZEWNĘTRZNE: ' +
      summary.thirdPartyDomains +
      '. Domeny mogące odczytać piksele zdjęć: ' +
      summary.corsPixelDomains +
      '. Skrypty zewnętrzne: ' +
      summary.thirdPartyScripts +
      '.\nCWE: ' +
      formatCwe(REPORT_CWE.thirdPartyCode) +
      '; dla nadmiernie otwartego CORS: ' +
      formatCwe(REPORT_CWE.permissiveCors) +
      '.',
    {
      size: 10,
      font: 'bold',
      fill: summary.thirdPartyDomains > 0 ? PDF_COLORS.blueSoft : PDF_COLORS.greenSoft,
      border: summary.thirdPartyDomains > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
      accent: summary.thirdPartyDomains > 0 ? PDF_COLORS.blue : PDF_COLORS.green,
      gapAfter: 5
    }
  );
  pushPdfBlock(
    items,
    'POLA HASŁA: ' +
      summary.passwordInputs +
      '. Domeny zewnętrzne przy polach: ' +
      summary.passwordDomains +
      '. Potwierdzony odczyt lub zapis wartości: ' +
      summary.passwordValueEvents +
      (summary.passwordUnknownDomains > 0 ? '. Dostęp nieustalony dla domen: ' + summary.passwordUnknownDomains : '') +
      '.\nCWE: ' +
      formatCwe(REPORT_CWE.credentials) +
      '; kod zewnętrzny: ' +
      formatCwe(REPORT_CWE.thirdPartyCode) +
      '.',
    {
      size: 10,
      font: 'bold',
      fill: summary.passwordDomains > 0 ? PDF_COLORS.redSoft : (summary.passwordUnknownDomains > 0 ? PDF_COLORS.amberSoft : PDF_COLORS.greenSoft),
      border: summary.passwordDomains > 0 ? PDF_COLORS.redDark : (summary.passwordUnknownDomains > 0 ? PDF_COLORS.amber : PDF_COLORS.green),
      accent: summary.passwordDomains > 0 ? PDF_COLORS.redDark : (summary.passwordUnknownDomains > 0 ? PDF_COLORS.amber : PDF_COLORS.green),
      gapAfter: 10
    }
  );

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
