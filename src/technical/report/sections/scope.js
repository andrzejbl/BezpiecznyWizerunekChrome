// Zakres, znaczniki czasu skanu i deklarowane założenia.

import { formatFlag, formatReportDate } from '../format.js';
import { pushPdfSection, pushPdfLine } from '../pdf/items.js';

/**
 * Dodaje treść sekcji do instrukcji dokumentu PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/report.js").PreparedReportStats} reportStats
 * @param {import("../../../../types/report.js").ReportContext} context
 * @param {import("../../../../types/scanning.js").ScanSnapshot | null} latestState
 * @param {import("../../../../types/report.js").ExtensionManifest} manifest
 */
export function appendScopeSection(items, reportStats, context, latestState, manifest) {
  /** @type {Partial<import('../../../../types/scanning.js').ScriptTree>} */
  const scriptTree = reportStats.scriptTree || {};
  /** @type {Partial<import('../../../../types/scanning.js').PasswordAccessTree>} */
  const passwordTree = reportStats.passwordTree || {};

  pushPdfSection(items, '1. Zakres i wiarygodność raportu', { gapBefore: 0 });
  pushPdfLine(items, 'Strona: ' + context.pageUrl, { size: 9 });
  pushPdfLine(
    items,
    'Origin strony: ' + (latestState && latestState.pageOrigin ? latestState.pageOrigin : '-'),
    { size: 9 }
  );
  pushPdfLine(items, 'Główna domena strony: ' + (scriptTree.pageRegistrableDomain || '-'), {
    size: 9
  });
  pushPdfLine(
    items,
    'Rozpoczęcie skanu: ' + formatReportDate(latestState && latestState.scanStartedAt),
    { size: 9 }
  );
  pushPdfLine(
    items,
    'Zatrzymanie skanu: ' + formatReportDate(latestState && latestState.scanStoppedAt),
    { size: 9 }
  );
  pushPdfLine(
    items,
    'Odłączenie debuggera: ' + formatReportDate(latestState && latestState.debuggerDetachedAt),
    { size: 9 }
  );
  pushPdfLine(
    items,
    'Stan przy generowaniu: ' +
      (latestState && latestState.status ? latestState.status : '-') +
      '; debugger podłączony: ' +
      formatFlag(Boolean(latestState && latestState.attached)),
    { size: 9 }
  );
  pushPdfLine(
    items,
    'Rozszerzenie: ' +
      manifest.name +
      ' ' +
      manifest.version +
      '; Manifest V3; Chrome DevTools Protocol przez chrome.debugger.',
    { size: 9 }
  );
  pushPdfLine(
    items,
    'Kontrola pól hasła: polling co ' +
      (passwordTree.pollIntervalMs || '-') +
      ' ms; ostatnia kontrola: ' +
      formatReportDate(passwordTree.lastChecked),
    { size: 9, gapAfter: 7 }
  );
  pushPdfLine(
    items,
    'Założenie treści: użytkownik potwierdził, że analizowane zdjęcia zawierają dane osobowe; OCR i automatyczna klasyfikacja osób nie są wykonywane.',
    { size: 9, font: 'bold', gapAfter: 7 }
  );
}
