// Metadane pól hasła i zaobserwowany lub możliwy dostęp skryptów.

import { getPasswordEvidenceLabel } from '../../../business/report/rules.js';
import { PDF_COLORS } from '../pdf/theme.js';
import { REPORT_CWE, formatCwe } from '../../../business/report/cwe.js';
import { formatNumber, formatReportDate, groupDomain } from '../format.js';
import {
  pushPdfSection,
  pushPdfBlock,
  pushPdfLine,
  pushPdfRule,
  pushPdfPageBreak
} from '../pdf/items.js';

/**
 * Dodaje treść sekcji do instrukcji dokumentu PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/popup.js").ReportStats["passwordGroups"]} passwordGroups
 * @param {import("../../../../types/scanning.js").PasswordAccessTree | null} passwordTree
 */
export function appendPasswordReportSection(items, passwordGroups, passwordTree) {
  /** @type {Partial<import('../../../../types/scanning.js').PasswordAccessTree>} */
  const tree = passwordTree || {};
  const inputs = Array.isArray(tree.passwordInputs) ? tree.passwordInputs : [];
  const unknownDomains = passwordGroups.filter((group) => group.accessScope === 'unknown').length;
  const accessibleDomains = passwordGroups.length - unknownDomains;

  pushPdfSection(items, '4. Domeny zewnętrzne przy polach hasła - CWE-522 / CWE-830', {
    color: accessibleDomains > 0 ? PDF_COLORS.redDark : (unknownDomains > 0 ? PDF_COLORS.amber : PDF_COLORS.green)
  });
  pushPdfLine(
    items,
    'Pola hasła: ' +
      formatNumber(tree.passwordInputCount) +
      '; domeny zewnętrzne: ' +
      passwordGroups.length +
      '; zdarzenia przy polach: ' +
      formatNumber(tree.totalAccesses) +
      '; potwierdzony odczyt lub zapis wartości: ' +
      formatNumber(tree.totalValueAccesses) +
      (unknownDomains > 0 ? '; domeny z nieustalonym dostępem: ' + unknownDomains : '') +
      '.',
    {
      size: 9,
      font: 'bold',
      gapAfter: 5
    }
  );
  pushPdfLine(
    items,
    'Rozszerzenie nie zapisuje wartości haseł. Dowód obejmuje wyłącznie rodzaj operacji, domenę i skrypt, element docelowy bez jego wartości, lokalizację w kodzie oraz czas.',
    {
      size: 9,
      color: PDF_COLORS.muted,
      gapAfter: 6
    }
  );
  if (inputs.length > 0) {
    inputs.forEach((input, index) => {
      pushPdfLine(
        items,
        'Pole H-' +
          String(index + 1).padStart(3, '0') +
          ': tag=' +
          (input.tagName || 'input') +
          '; id=' +
          (input.id || '-') +
          '; name=' +
          (input.name || '-') +
          '; autocomplete=' +
          (input.autocomplete || '-') +
          '; typ=' +
          (input.inputType || 'password'),
        {
          size: 8,
          indent: 8
        }
      );
    });
    pushPdfRule(items, { gapBefore: 4, gapAfter: 6 });
  }

  if (passwordGroups.length === 0) {
    pushPdfBlock(
      items,
      inputs.length > 0
        ? 'Wykryto pole hasła, ale nie znaleziono domen zewnętrznych działających lub potencjalnie działających przy tym polu.'
        : 'Nie wykryto pola hasła ani domen zewnętrznych przy polu hasła.',
      {
        fill: PDF_COLORS.greenSoft,
        border: PDF_COLORS.green,
        accent: PDF_COLORS.green
      }
    );
    return;
  }

  passwordGroups.forEach((group, index) => {
    if (index > 0) {
      pushPdfPageBreak(items);
    }

    const accesses = Array.isArray(group.accesses) ? group.accesses : [];
    const label = 'H-' + String(index + 1).padStart(3, '0');
    const unknownAccess = group.accessScope === 'unknown';
    const groupColor = unknownAccess ? PDF_COLORS.amber : PDF_COLORS.redDark;

    pushPdfBlock(items, label + (unknownAccess ? ' - DOSTĘP NIEUSTALONY - ' : ' - KRYTYCZNE - ') + groupDomain(group) +
      (unknownAccess ? '' : ' - CWE-522 / CWE-830'), {
      size: 11,
      font: 'bold',
      color: groupColor,
      fill: unknownAccess ? PDF_COLORS.amberSoft : PDF_COLORS.redSoft,
      border: groupColor,
      accent: groupColor,
      gapBefore: index === 0 ? 2 : 9,
      gapAfter: 4
    });
    pushPdfLine(
      items,
      'Skrypty: ' +
        formatNumber(group.scriptCount) +
        '; zdarzenia: ' +
        formatNumber(group.eventCount) +
        '; odczyt/zapis wartości: ' +
        formatNumber(group.valueAccessCount) +
        '; zdarzenia DOM: ' +
        formatNumber(group.domSignalCount) +
        '; potencjalne: ' +
        formatNumber(group.potentialCount) +
        '; zablokowane lokalnie: ' +
        formatNumber(group.blockedCount) +
        ((group.unknownCount || 0) > 0 ? '; dostęp nieustalony: ' + group.unknownCount : '') +
        '.',
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      unknownAccess
        ? 'Brak danych pozwalających powiązać kontekst wykonania skryptu z dokumentem pola hasła. Nie potwierdzono możliwości dostępu.'
        : 'CWE warunkowe: ' +
        formatCwe(REPORT_CWE.credentials) +
        '; ' +
        formatCwe(REPORT_CWE.thirdPartyCode) +
        '.',
      { size: 8, font: 'bold', indent: 8 }
    );

    accesses.forEach((access, accessIndex) => {
      const target = access.target || {};
      pushPdfLine(
        items,
        accessIndex +
          1 +
          '. ' +
          getPasswordEvidenceLabel(access) +
          ': ' +
          (access.scriptUrl || access.scriptFilename || '-'),
        { size: 8, font: 'bold', indent: 14 }
      );
      pushPdfLine(
        items,
        '   kind=' +
          (access.kind || '-') +
          '; count=' +
          formatNumber(access.count) +
          '; funkcja=' +
          (access.functionName || '-') +
          '; pozycja=' +
          (access.lineNumber || '-') +
          ':' +
          (access.columnNumber || '-') +
          '; firstSeen=' +
          formatReportDate(access.firstSeen) +
          '; lastSeen=' +
          formatReportDate(access.lastSeen),
        { size: 7.5, indent: 14 }
      );
      pushPdfLine(
        items,
        '   cel: tag=' +
          (target.tagName || 'input') +
          '; id=' +
          (target.id || '-') +
          '; name=' +
          (target.name || '-') +
          '; autocomplete=' +
          (target.autocomplete || '-') +
          '; detail=' +
          (access.detail || '-') +
          '; błąd=' +
          (access.errorText || '-'),
        { size: 7.5, indent: 14 }
      );
    });
  });
}
