// Domeny zewnętrznych skryptów i ich dostęp do pikseli zdjęć.

import { PDF_COLORS } from '../pdf/theme.js';
import { REPORT_CWE, formatCwe, getCorsCweText } from '../../../business/report/cwe.js';
import {
  formatFlag,
  formatNumber,
  formatReportDate,
  groupDomain,
  reportClassificationLabel
} from '../format.js';
import { pushPdfSection, pushPdfBlock, pushPdfLine } from '../pdf/items.js';

/**
 * Dodaje treść sekcji do instrukcji dokumentu PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/popup.js").ReportStats["scriptGroups"]} scriptGroups
 */
export function appendScriptReportSection(items, scriptGroups) {
  const readableGroups = scriptGroups.filter(
    (group) => group.corsPixelAccess && group.corsPixelAccess.possible
  );

  const unknownGroups = scriptGroups.filter(
    (group) => group.corsPixelAccess && (group.corsPixelAccess.unknownScriptCount || 0) > 0
  );

  pushPdfSection(items, '3. Domeny zewnętrzne na stronie i w ramkach - CWE-830 / CWE-942', {
    color: scriptGroups.length > 0 ? PDF_COLORS.blue : PDF_COLORS.green
  });
  pushPdfLine(
    items,
    'Unikalne domeny zewnętrzne: ' +
      scriptGroups.length +
      '; domeny z techniczną możliwością odczytu pikseli zdjęć: ' +
      readableGroups.length +
      (unknownGroups.length > 0 ? '; domeny z nieustalonym dostępem do zdjęć: ' + unknownGroups.length : '') +
      '.',
    {
      size: 9,
      font: 'bold',
      gapAfter: 6
    }
  );
  if (scriptGroups.length === 0) {
    pushPdfBlock(
      items,
      'Nie wykryto domen zewnętrznych po odfiltrowaniu skryptów własnych, tej samej głównej domeny, inline/eval/blob oraz browser/internal.',
      {
        fill: PDF_COLORS.greenSoft,
        border: PDF_COLORS.green,
        accent: PDF_COLORS.green
      }
    );
    return;
  }

  scriptGroups.forEach((group, index) => {
    const cors = group.corsPixelAccess || {};
    const scripts = Array.isArray(group.scripts) ? group.scripts : [];
    const label = 'D-' + String(index + 1).padStart(3, '0');
    const unknownCount = cors.unknownScriptCount || 0;
    const accessText = cors.possible
      ? 'MOŻLIWOŚĆ ODCZYTU PIKSELI ' + formatNumber(cors.imageCount) + ' ZDJĘĆ'
      : (unknownCount > 0 ? 'DOSTĘP DO ZDJĘĆ NIEUSTALONY' : 'DOMENA ZEWNĘTRZNA');
    const unknownOnly = !cors.possible && unknownCount > 0;

    pushPdfBlock(items, label + ' - ' + groupDomain(group) + ' - ' + accessText, {
      size: 10,
      font: 'bold',
      color: unknownOnly ? PDF_COLORS.amber : (cors.possible ? PDF_COLORS.blue : PDF_COLORS.ink),
      fill: unknownOnly ? PDF_COLORS.amberSoft : PDF_COLORS.blueSoft,
      border: unknownOnly ? PDF_COLORS.amber : PDF_COLORS.blue,
      accent: unknownOnly ? PDF_COLORS.amber : PDF_COLORS.blue,
      gapBefore: index === 0 ? 2 : 9,
      gapAfter: 4
    });
    pushPdfLine(
      items,
      'Skrypty: ' +
        formatNumber(group.count) +
        '; zablokowane lokalnie: ' +
        formatNumber(group.blockedCount) +
        '; klasyfikacja: ' +
        reportClassificationLabel(group.classification) +
        '.',
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'CORS/pixel: możliwe=' +
        formatFlag(cors.possible) +
        '; obrazy=' +
        formatNumber(cors.imageCount) +
        '; tryby=' +
        ((cors.modes || []).join(', ') || '-') +
        '; domeny zdjęć=' +
        ((cors.imageDomains || []).join(', ') || '-') +
        '.',
      { size: 8, indent: 8 }
    );
    if (cors.possible) {
      pushPdfLine(
        items,
        'Możliwość wynika z oceny originów kontekstów wykonania i nagłówków odpowiedzi; dotyczy co najmniej jednego skryptu z tej domeny. Nie potwierdza odczytu zdjęć.' +
          ((cors.executionOrigins || []).length > 0 ? ' Originy wykonania: ' + (cors.executionOrigins || []).join(', ') + '.' : ''),
        { size: 8, indent: 8 }
      );
    }
    if (unknownCount > 0) {
      pushPdfLine(
        items,
        'DOSTĘP DO ZDJĘĆ NIEUSTALONY: ' + unknownCount + ' skryptów. Nie ustalono pełnego zakresu dostępu: kontekstu, originu lub dostępu do dokumentu głównego; obejmuje to skrypty zablokowane lokalnie. Uprawnienia dokumentu głównego wymagają potwierdzenia. Niezależnie ustalony dostęp jest pokazany osobno.',
        { size: 8, font: 'bold', color: PDF_COLORS.amber, indent: 8 }
      );
    }
    pushPdfLine(
      items,
      'Klasyfikacja CWE: ' +
        formatCwe(REPORT_CWE.thirdPartyCode) +
        ' - warunkowo dla niezaufanego źródła; ' +
        getCorsCweText(cors),
      { size: 8, font: 'bold', indent: 8 }
    );

    scripts.forEach((script, scriptIndex) => {
      const stateLabel =
        script.blockedByClient === true ? 'ZABLOKOWANY LOKALNIE' : 'URUCHOMIONY LUB ZAŁADOWANY';
      pushPdfLine(
        items,
        scriptIndex +
          1 +
          '. ' +
          stateLabel +
          ': ' +
          (script.url || script.displayName || script.filename || '-'),
        { size: 8, indent: 14 }
      );
      pushPdfLine(
        items,
        '   typ=' +
          (script.type || '-') +
          '; scriptId=' +
          (script.scriptId || '-') +
          '; requestId=' +
          (script.requestId || '-') +
          '; czas=' +
          formatReportDate(script.timestamp) +
          '; błąd=' +
          (script.errorText || '-') +
          '; blockedReason=' +
          (script.blockedReason || '-'),
        { size: 7.5, indent: 14 }
      );
    });
  });
}
