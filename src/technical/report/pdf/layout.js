// Rozmieszczanie elementów dokumentu na stronach z zachowaniem odstępów i podziałów stron.

import { PDF_PAGE } from './theme.js';

/**
 * Oblicza wysokość elementu wraz z odstępami.
 * @param {import("../../../../types/pdf.js").PdfItem} item
 */
export function getPdfItemHeight(item) {
  if (item.kind === 'text') {
    return (item.gapBefore || 0) + Math.ceil((item.size || 10) * 1.35) + (item.gapAfter || 0);
  }

  if (item.kind === 'block') {
    const lineHeight = Math.ceil((item.size || 10) * 1.4);
    return (
      (item.gapBefore || 0) +
      (item.padding || 0) * 2 +
      item.lines.length * lineHeight +
      (item.gapAfter || 0)
    );
  }

  if (item.kind === 'rule') {
    return (item.gapBefore || 0) + 1 + (item.gapAfter || 0);
  }

  if (item.kind === 'image') {
    return (item.gapBefore || 0) + item.displayHeight + (item.gapAfter || 0);
  }

  return 0;
}

/**
 * Przypisuje współrzędne i strony poszczególnym rodzajom elementów.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @returns {import("../../../../types/pdf.js").PdfPages}
 */
export function paginatePdfItems(items) {
  /** @type {import('../../../../types/pdf.js').PdfPages} */
  const pages = [];
  /** @type {import('../../../../types/pdf.js').PositionedPdfItem[]} */
  let page = [];
  let y = PDF_PAGE.top;

  const finishPage = () => {
    if (page.length > 0) {
      pages.push(page);
      page = [];
    }
    y = PDF_PAGE.top;
  };

  items.forEach((item) => {
    if (item.kind === 'page-break') {
      finishPage();
      return;
    }

    const itemHeight = getPdfItemHeight(item);
    if (y - itemHeight < PDF_PAGE.bottom && page.length > 0) {
      finishPage();
    }

    y -= item.gapBefore || 0;

    if (item.kind === 'text') {
      const lineHeight = Math.ceil((item.size || 10) * 1.35);
      page.push({ ...item, baseline: y - (item.size || 10) });
      y -= lineHeight;
    } else if (item.kind === 'block') {
      const lineHeight = Math.ceil((item.size || 10) * 1.4);
      const blockHeight = (item.padding || 0) * 2 + item.lines.length * lineHeight;
      page.push({ ...item, top: y, height: blockHeight, lineHeight });
      y -= blockHeight;
    } else if (item.kind === 'rule') {
      page.push({ ...item, y: y - 0.5 });
      y -= 1;
    } else if (item.kind === 'image') {
      page.push({ ...item, top: y });
      y -= item.displayHeight;
    }

    y -= item.gapAfter || 0;
  });

  finishPage();
  return pages.length > 0 ? pages : [[]];
}
