// Budowanie uporządkowanych instrukcji rysowania, z których powstaje układ PDF.

import { PDF_PAGE, PDF_COLORS } from './theme.js';
import { wrapText } from './text.js';

/**
 * Szacuje szerokość wiersza w znakach dla zawijania tekstu.
 * @param {number} size
 * @param {number | undefined} indent
 * @param {number | undefined} width
 */
export function getPdfMaxCharacters(size, indent, width) {
  const availableWidth = width || PDF_PAGE.width - PDF_PAGE.margin * 2 - (indent || 0);
  return Math.max(24, Math.floor(availableWidth / Math.max(4.4, size * 0.51)));
}

/**
 * Dodaje wiersze tekstu po zawinięciu.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {unknown} text
 * @param {import("../../../../types/pdf.js").PdfTextOptions} options
 */
export function pushPdfLine(items, text, options = {}) {
  const size = options.size || 10;
  const indent = options.indent || 0;
  const wrapped = wrapText(
    text,
    options.maxLength || getPdfMaxCharacters(size, indent, options.width)
  );

  wrapped.forEach((line, index) => {
    items.push({
      kind: 'text',
      text: line,
      size,
      indent,
      font: options.font || 'regular',
      color: options.color || PDF_COLORS.ink,
      gapBefore: index === 0 ? options.gapBefore || 0 : 0,
      gapAfter: index === wrapped.length - 1 ? options.gapAfter || 0 : 0
    });
  });
}

/**
 * Dodaje blok tekstu z tłem i opcjonalnym akcentem.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {unknown} text
 * @param {import("../../../../types/pdf.js").PdfBlockOptions} options
 */
export function pushPdfBlock(items, text, options = {}) {
  const size = options.size || 10;
  const indent = options.indent || 0;
  const width = options.width || PDF_PAGE.width - PDF_PAGE.margin * 2 - indent;
  const padding = options.padding === undefined ? 8 : options.padding;
  const textWidth = Math.max(80, width - padding * 2 - (options.accent ? 7 : 0));
  const maxLength = options.maxLength || getPdfMaxCharacters(size, 0, textWidth);
  const wrapped = String(text)
    .split(/\r?\n/)
    .flatMap((line) => wrapText(line, maxLength));

  items.push({
    kind: 'block',
    lines: wrapped,
    size,
    indent,
    width,
    padding,
    font: options.font || 'regular',
    color: options.color || PDF_COLORS.ink,
    fill: options.fill || PDF_COLORS.blueSoft,
    border: options.border || PDF_COLORS.line,
    accent: options.accent || null,
    gapBefore: options.gapBefore || 0,
    gapAfter: options.gapAfter || 0
  });
}

/**
 * Dodaje podgląd z zachowaniem proporcji obrazu.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/pdf.js").PdfPreview | null | undefined} preview
 * @param {import("../../../../types/pdf.js").PdfImageOptions} options
 */
export function pushPdfImage(items, preview, options = {}) {
  if (!preview || !preview.dataUrl || !preview.width || !preview.height) {
    return;
  }

  const maxWidth = options.maxWidth || 330;
  const maxHeight = options.maxHeight || 190;
  const scale = Math.min(maxWidth / preview.width, maxHeight / preview.height, 1);
  items.push({
    kind: 'image',
    dataUrl: preview.dataUrl,
    pixelWidth: preview.width,
    pixelHeight: preview.height,
    displayWidth: Math.max(1, preview.width * scale),
    displayHeight: Math.max(1, preview.height * scale),
    indent: options.indent || 8,
    gapBefore: options.gapBefore || 3,
    gapAfter: options.gapAfter || 7
  });
}
/**
 * Dodaje separator sekcji.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/pdf.js").PdfRuleOptions} options
 */
export function pushPdfRule(items, options = {}) {
  items.push({
    kind: 'rule',
    color: options.color || PDF_COLORS.line,
    gapBefore: options.gapBefore || 3,
    gapAfter: options.gapAfter || 7
  });
}

/**
 * Kończy stronę przed kolejną sekcją.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 */
export function pushPdfPageBreak(items) {
  items.push({ kind: 'page-break' });
}

/**
 * Dodaje tytuł sekcji i separator.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {string} title
 * @param {import("../../../../types/pdf.js").PdfSectionOptions} options
 */
export function pushPdfSection(items, title, options = {}) {
  pushPdfLine(items, title, {
    size: options.size || 14,
    font: 'bold',
    color: options.color || PDF_COLORS.ink,
    gapBefore: options.gapBefore === undefined ? 12 : options.gapBefore,
    gapAfter: 3
  });
  pushPdfRule(items, {
    color: options.ruleColor || options.color || PDF_COLORS.blue,
    gapBefore: 0,
    gapAfter: options.gapAfter === undefined ? 7 : options.gapAfter
  });
}
