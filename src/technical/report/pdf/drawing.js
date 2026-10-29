// Zamiana elementów z ustalonym położeniem na polecenia rysowania PDF.

import { PDF_PAGE, PDF_COLORS } from './theme.js';
import { escapePdfString } from './text.js';

/**
 * Koduje kolor wypełnienia jako instrukcję PDF.
 * @param {import("../../../../types/pdf.js").PdfColor} color
 */
export function pdfFillColor(color) {
  return color.map((value) => Number(value).toFixed(3)).join(' ') + ' rg';
}

/**
 * Koduje kolor obrysu jako instrukcję PDF.
 * @param {import("../../../../types/pdf.js").PdfColor} color
 */
export function pdfStrokeColor(color) {
  return color.map((value) => Number(value).toFixed(3)).join(' ') + ' RG';
}

/**
 * Rysuje pojedynczy wiersz tekstu w podanej pozycji.
 * @param {unknown} text
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {import("../../../../types/pdf.js").PdfFont} font
 * @param {import("../../../../types/pdf.js").PdfColor} color
 */
export function renderPdfText(text, x, y, size, font, color) {
  const fontName = font === 'bold' ? 'F2' : 'F1';
  return (
    'BT /' +
    fontName +
    ' ' +
    size +
    ' Tf ' +
    pdfFillColor(color || PDF_COLORS.ink) +
    ' 1 0 0 1 ' +
    x.toFixed(2) +
    ' ' +
    y.toFixed(2) +
    ' Tm (' +
    escapePdfString(text) +
    ') Tj ET'
  );
}

/**
 * Tłumaczy element po podziale dokumentu na strony na instrukcje rysowania.
 * @param {import("../../../../types/pdf.js").PositionedPdfItem} item
 */
export function renderPdfItem(item) {
  const x = PDF_PAGE.margin + (item.indent || 0);

  if (item.kind === 'text') {
    return renderPdfText(item.text, x, item.baseline, item.size || 10, item.font, item.color);
  }

  if (item.kind === 'rule') {
    const width = PDF_PAGE.width - PDF_PAGE.margin * 2;
    return (
      pdfStrokeColor(item.color || PDF_COLORS.line) +
      ' 1 w ' +
      PDF_PAGE.margin +
      ' ' +
      item.y.toFixed(2) +
      ' m ' +
      (PDF_PAGE.margin + width) +
      ' ' +
      item.y.toFixed(2) +
      ' l S'
    );
  }

  if (item.kind === 'image') {
    const bottom = item.top - item.displayHeight;
    const contentWidth = PDF_PAGE.width - PDF_PAGE.margin * 2 - (item.indent || 0);
    const imageX = x + Math.max(0, (contentWidth - item.displayWidth) / 2);
    return [
      pdfFillColor([0.97, 0.98, 0.99]) +
        ' ' +
        (imageX - 4).toFixed(2) +
        ' ' +
        (bottom - 4).toFixed(2) +
        ' ' +
        (item.displayWidth + 8).toFixed(2) +
        ' ' +
        (item.displayHeight + 8).toFixed(2) +
        ' re f',
      pdfStrokeColor(PDF_COLORS.line) +
        ' 0.8 w ' +
        (imageX - 4).toFixed(2) +
        ' ' +
        (bottom - 4).toFixed(2) +
        ' ' +
        (item.displayWidth + 8).toFixed(2) +
        ' ' +
        (item.displayHeight + 8).toFixed(2) +
        ' re S',
      'q ' +
        item.displayWidth.toFixed(2) +
        ' 0 0 ' +
        item.displayHeight.toFixed(2) +
        ' ' +
        imageX.toFixed(2) +
        ' ' +
        bottom.toFixed(2) +
        ' cm /' +
        item.pdfImageName +
        ' Do Q'
    ].join('\n');
  }

  if (item.kind === 'block') {
    const bottom = item.top - item.height;
    const commands = [
      pdfFillColor(item.fill || PDF_COLORS.blueSoft) +
        ' ' +
        x +
        ' ' +
        bottom.toFixed(2) +
        ' ' +
        item.width.toFixed(2) +
        ' ' +
        item.height.toFixed(2) +
        ' re f',
      pdfStrokeColor(item.border || PDF_COLORS.line) +
        ' 0.8 w ' +
        x +
        ' ' +
        bottom.toFixed(2) +
        ' ' +
        item.width.toFixed(2) +
        ' ' +
        item.height.toFixed(2) +
        ' re S'
    ];

    let textX = x + item.padding;
    if (item.accent) {
      commands.push(
        pdfFillColor(item.accent) +
          ' ' +
          x +
          ' ' +
          bottom.toFixed(2) +
          ' 4 ' +
          item.height.toFixed(2) +
          ' re f'
      );
      textX += 7;
    }

    item.lines.forEach((line, index) => {
      const baseline = item.top - item.padding - (item.size || 10) - index * item.lineHeight;
      commands.push(renderPdfText(line, textX, baseline, item.size || 10, item.font, item.color));
    });

    return commands.join('\n');
  }

  return '';
}
