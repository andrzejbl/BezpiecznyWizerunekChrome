// Ustalenia dotyczące zdjęć oraz dowody z odpowiedzi, pamięci podręcznej, indeksowania i CORS.

import { PDF_COLORS } from '../pdf/theme.js';
import { REPORT_CWE, formatCwe, getCorsCweText } from '../../../business/report/cwe.js';
import { formatBytes, formatFlag, formatHashForPdf, formatReportDate } from '../format.js';
import {
  pushPdfSection,
  pushPdfBlock,
  pushPdfLine,
  pushPdfPageBreak,
  pushPdfImage
} from '../pdf/items.js';

/**
 * Dodaje treść sekcji do instrukcji dokumentu PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/report.js").ReportImage[]} images
 * @param {number} minImageLongSide
 */
export function appendImageReportSection(items, images, minImageLongSide) {
  pushPdfSection(items, '2. Zdjęcia bez poprawnej autoryzacji - CWE-863 / CWE-359', {
    color: images.length > 0 ? PDF_COLORS.red : PDF_COLORS.green
  });

  if (images.length === 0) {
    pushPdfBlock(
      items,
      'Dla przeanalizowanych zapytań sieciowych nie wykryto zdjęć spełniających wszystkie warunki raportu: format JPEG/JPG lub PNG, identyczne body bez aktywnej sesji, statusy HTTP 2xx i dłuższy bok co najmniej ' +
        minImageLongSide +
        ' px.',
      {
        fill: PDF_COLORS.greenSoft,
        border: PDF_COLORS.green,
        accent: PDF_COLORS.green
      }
    );
    return;
  }

  pushPdfLine(
    items,
    'Potwierdzenie: statusy HTTP 2xx, identyczna długość i identyczny SHA-256 odpowiedzi podczas sesji oraz bez aktywnej sesji.',
    {
      size: 9,
      font: 'bold',
      color: PDF_COLORS.redDark,
      gapAfter: 7
    }
  );

  images.forEach((image, index) => {
    if (index > 0) {
      pushPdfPageBreak(items);
    }

    const comparison = image.bodyComparison || {};
    /** @type {Partial<import('../../../../types/scanning.js').CacheAudit>} */
    const cache = image.cache || {};
    /** @type {Partial<import('../../../../types/scanning.js').IndexingAudit>} */
    const indexing = image.indexing || {};
    /** @type {Partial<import('../../../../types/scanning.js').CorsPixelAccess>} */
    const corsPixelAccess = image.corsPixelAccess || {};
    /** @type {Partial<import('../../../../types/scanning.js').RobotsRule>} */
    const matchedRule = indexing.robotsTxtMatchedRule || {};
    const dimensions =
      image.width && image.height ? image.width + ' x ' + image.height + ' px' : '-';
    const cacheControl = image.cacheControl || cache.cacheControl || '(brak nagłówka)';
    const label = 'Z-' + String(index + 1).padStart(3, '0');

    pushPdfBlock(
      items,
      label + ' - POTWIERDZONE: brak poprawnej autoryzacji użytkownika - CWE-863 / CWE-359',
      {
        size: 11,
        font: 'bold',
        color: PDF_COLORS.redDark,
        fill: PDF_COLORS.redSoft,
        border: PDF_COLORS.red,
        accent: PDF_COLORS.red,
        gapBefore: index === 0 ? 2 : 10,
        gapAfter: 5
      }
    );
    if (image.reportPreviewJpeg) {
      pushPdfImage(items, image.reportPreviewJpeg, { indent: 8, maxWidth: 330, maxHeight: 190 });
    } else {
      pushPdfLine(
        items,
        'Podgląd nie został osadzony, ponieważ body zdjęcia nie było dostępne jako lokalna miniatura. Metadane i skróty pozostają pełnym dowodem technicznym.',
        {
          size: 8,
          color: PDF_COLORS.muted,
          indent: 8,
          gapAfter: 4
        }
      );
    }
    pushPdfLine(items, 'URL: ' + image.url, { size: 8, indent: 8 });
    pushPdfLine(
      items,
      'Domena: ' +
        (image.domain || '-') +
        '; wymiary: ' +
        dimensions +
        '; dłuższy bok: ' +
        (image.longSide || '-') +
        ' px',
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'Odpowiedź podczas sesji: HTTP ' +
        (image.status === null ? '-' : image.status) +
        '; MIME: ' +
        (image.mimeType || '-') +
        '; typ: ' +
        (image.resourceType || '-') +
        '; encodedDataLength: ' +
        formatBytes(image.encodedDataLength),
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'Body podczas sesji: ' +
        formatBytes(comparison.originalBodyLength) +
        '; SHA-256: ' +
        formatHashForPdf(comparison.originalBodySha256),
      { size: 8, indent: 8 }
    );
    pushPdfLine(
      items,
      'Body bez aktywnej sesji: HTTP ' +
        (comparison.noCredentialsStatus || '-') +
        '; ' +
        formatBytes(comparison.noCredentialsBodyLength) +
        '; SHA-256: ' +
        formatHashForPdf(comparison.noCredentialsBodySha256),
      { size: 8, indent: 8 }
    );
    pushPdfLine(
      items,
      'Body identyczne: ' +
        formatFlag(comparison.exactMatch) +
        '; tryb: ' +
        (comparison.mode || '-') +
        '; porównano: ' +
        formatReportDate(comparison.comparedAt || comparison.updatedAt),
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'Nagłówki audytowe pochodzą z: ' +
        (cache.headerSource || indexing.headerSource || 'nieustalone') +
        '.',
      { size: 8, font: 'bold', indent: 8 }
    );
    pushPdfLine(
      items,
      'Cache-Control: ' +
        cacheControl +
        '; brak no-store: ' +
        formatFlag(image.missingCacheNoStore === true || cache.missingNoStore === true) +
        '; fromDiskCache: ' +
        formatFlag(image.fromDiskCache) +
        '; fromServiceWorker: ' +
        formatFlag(image.fromServiceWorker) +
        '; CWE: ' +
        formatCwe(REPORT_CWE.browserCache) +
        '.',
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'X-Robots-Tag: ' +
        (indexing.xRobotsTag || '(brak)') +
        '; blokuje Google: ' +
        formatFlag(indexing.headerBlocksGoogle) +
        '.',
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'robots.txt: ' +
        (indexing.robotsTxtStatus || '-') +
        '; HTTP: ' +
        (indexing.robotsTxtHttpStatusCode || '-') +
        '; URL: ' +
        (indexing.robotsTxtUrl || '-') +
        '; sprawdzono: ' +
        formatReportDate(indexing.robotsTxtCheckedAt),
      { size: 8, indent: 8 }
    );
    pushPdfLine(
      items,
      'Dopasowana reguła robots.txt: ' +
        (matchedRule.directive || '-') +
        ' ' +
        (matchedRule.path || '-') +
        '; Google nie jest blokowany: ' +
        formatFlag(image.googleIndexingOpen === true || indexing.googleIndexingOpen === true),
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'Odczyt pikseli przez JavaScript możliwy: ' +
        formatFlag(corsPixelAccess.possible) +
        '; tryby: ' +
        ((corsPixelAccess.modes || []).join(', ') || '-') +
        '; ACAO: ' +
        (corsPixelAccess.accessControlAllowOrigin || '-') +
        '; źródło nagłówków: ' +
        (corsPixelAccess.responseHeaderSource || '-') +
        '; ' +
        getCorsCweText(corsPixelAccess),
      { size: 9, indent: 8 }
    );
    pushPdfLine(
      items,
      'Klasyfikacja: ' +
        formatCwe(REPORT_CWE.improperAuthorization) +
        '; skutek dla danych osobowych: ' +
        formatCwe(REPORT_CWE.personalDataExposure) +
        '.',
      { size: 8, font: 'bold', indent: 8 }
    );
    pushPdfLine(
      items,
      'Request ID: ' +
        (image.requestId || '-') +
        '; pierwszy zapis: ' +
        formatReportDate(image.timestamp),
      { size: 8, indent: 8, gapAfter: 4 }
    );
  });
}
