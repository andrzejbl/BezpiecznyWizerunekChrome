// Składanie obiektów PDF, osadzonych dowodów i tabeli pozycji bajtowych.

import { PDF_PAGE, PDF_COLORS } from './theme.js';
import { PDF_FONT_WIDTHS } from './fonts.js';
import { escapePdfString, getPdfFontEncoding } from './text.js';
import { paginatePdfItems } from './layout.js';
import { renderPdfText, renderPdfItem, pdfStrokeColor } from './drawing.js';

/**
 * Koduje JPEG na potrzeby strumienia ASCIIHexDecode.
 * @param {string} dataUrl
 */
export function jpegDataUrlToHex(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/jpeg;base64,(.+)$/i);
  if (!match) {
    return '';
  }

  const binary = atob(match[1]);
  let hex = '';
  for (let index = 0; index < binary.length; index += 1) {
    hex += binary.charCodeAt(index).toString(16).padStart(2, '0');
  }
  return hex + '>';
}

// Każdy odrębny JPEG jest zapisany raz, a odwołania używają jego nazwy zasobu.
/**
 * Rejestruje każdy unikalny JPEG tylko raz.
 * @param {import("../../../../types/pdf.js").PdfPages} pages
 * @param {import("../../../../types/pdf.js").AddPdfObject} addObject
 */
function appendImageObjects(pages, addObject) {
  /** @type {import('../../../../types/pdf.js').PdfImageResource[]} */
  const imageResources = [];
  /** @type {Map<string, import('../../../../types/pdf.js').PdfImageResource>} */
  const imageIdsByDataUrl = new Map();

  pages
    .flat()
    .filter((item) => item.kind === 'image')
    .forEach((item) => {
      if (!imageIdsByDataUrl.has(item.dataUrl)) {
        const hex = jpegDataUrlToHex(item.dataUrl);
        if (!hex) {
          return;
        }
        const imageId = addObject(
          '<< /Type /XObject /Subtype /Image /Width ' +
            item.pixelWidth +
            ' /Height ' +
            item.pixelHeight +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ' +
            hex.length +
            ' >>\nstream\n' +
            hex +
            '\nendstream'
        );
        const imageName = 'Im' + (imageResources.length + 1);
        imageIdsByDataUrl.set(item.dataUrl, { imageId, imageName });
        imageResources.push({ imageId, imageName });
      }

      const resource = imageIdsByDataUrl.get(item.dataUrl);
      if (resource) {
        item.pdfImageName = resource.imageName;
      }
    });

  return imageResources;
}

/**
 * Zapisuje strony wraz ze wspólnymi zasobami i stopką.
 * @param {import("../../../../types/pdf.js").PdfPages} pages
 * @param {import("../../../../types/pdf.js").PdfOptions} options
 * @param {import("../../../../types/pdf.js").PdfResources} resources
 * @param {import("../../../../types/pdf.js").AddPdfObject} addObject
 */
function appendPageObjects(pages, options, resources, addObject) {
  const { pagesId, regularFontId, boldFontId, imageResources } = resources;
  /** @type {number[]} */
  const pageIds = [];
  pages.forEach((page, pageIndex) => {
    const header = renderPdfText(
      'RAPORT RODO  |  ' + (options.domain || '-'),
      PDF_PAGE.margin,
      760,
      8,
      'bold',
      PDF_COLORS.muted
    );
    const headerRule =
      pdfStrokeColor(PDF_COLORS.line) +
      ' 0.7 w ' +
      PDF_PAGE.margin +
      ' 751 m ' +
      (PDF_PAGE.width - PDF_PAGE.margin) +
      ' 751 l S';
    const footerRule =
      pdfStrokeColor(PDF_COLORS.line) +
      ' 0.7 w ' +
      PDF_PAGE.margin +
      ' 39 m ' +
      (PDF_PAGE.width - PDF_PAGE.margin) +
      ' 39 l S';
    const footerId = String(options.reportId || 'Raport RODO').slice(0, 82);
    const footer = renderPdfText(
      footerId + '  |  strona ' + (pageIndex + 1) + ' z ' + pages.length,
      PDF_PAGE.margin,
      24,
      7.5,
      'regular',
      PDF_COLORS.muted
    );
    const content = [header, headerRule]
      .concat(page.map(renderPdfItem))
      .concat([footerRule, footer])
      .join('\n');

    const contentId = addObject(
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'
    );
    const xObjects =
      imageResources.length > 0
        ? ' /XObject << ' +
          imageResources
            .map((resource) => '/' + resource.imageName + ' ' + resource.imageId + ' 0 R')
            .join(' ') +
          ' >>'
        : '';
    const pageId = addObject(
      '<< /Type /Page /Parent ' +
        pagesId +
        ' 0 R /MediaBox [0 0 ' +
        PDF_PAGE.width +
        ' ' +
        PDF_PAGE.height +
        '] /Resources << /Font << /F1 ' +
        regularFontId +
        ' 0 R /F2 ' +
        boldFontId +
        ' 0 R >>' +
        xObjects +
        ' >> /Contents ' +
        contentId +
        ' 0 R >>'
    );
    pageIds.push(pageId);
  });

  return pageIds;
}

/**
 * Osadza niezmieniony JSON dowodów jako załącznik PDF.
 * @param {import("../../../../types/pdf.js").PdfOptions} options
 * @param {import("../../../../types/pdf.js").AddPdfObject} addObject
 */
function appendEvidenceAttachment(options, addObject) {
  let fileSpecId = null;
  let embeddedNamesId = null;
  const attachmentText = options.attachmentText || '';
  const attachmentName = options.attachmentName || 'dowody-techniczne.json';

  if (attachmentText) {
    const embeddedFileId = addObject(
      '<< /Type /EmbeddedFile /Subtype /application#2Fjson /Params << /Size ' +
        attachmentText.length +
        ' >> /Length ' +
        attachmentText.length +
        ' >>\nstream\n' +
        attachmentText +
        '\nendstream'
    );
    fileSpecId = addObject(
      '<< /Type /Filespec /F (' +
        escapePdfString(attachmentName) +
        ') /UF (' +
        escapePdfString(attachmentName) +
        ') /Desc (' +
        escapePdfString('Pełny aneks dowodowy w formacie JSON') +
        ') /AFRelationship /Data /EF << /F ' +
        embeddedFileId +
        ' 0 R /UF ' +
        embeddedFileId +
        ' 0 R >> >>'
    );
    embeddedNamesId = addObject(
      '<< /Names [(' + escapePdfString(attachmentName) + ') ' + fileSpecId + ' 0 R] >>'
    );
  }

  return { fileSpecId, embeddedNamesId };
}

/**
 * Dodaje identyfikację i czas utworzenia dokumentu.
 * @param {import("../../../../types/pdf.js").PdfOptions} options
 * @param {import("../../../../types/pdf.js").AddPdfObject} addObject
 */
function appendDocumentMetadata(options, addObject) {
  const created = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const pdfDate =
    'D:' +
    created.getFullYear() +
    String(created.getMonth() + 1).padStart(2, '0') +
    String(created.getDate()).padStart(2, '0') +
    String(created.getHours()).padStart(2, '0') +
    String(created.getMinutes()).padStart(2, '0') +
    String(created.getSeconds()).padStart(2, '0');
  const infoId = addObject(
    '<< /Title (Raport RODO - ' +
      escapePdfString(options.domain || '') +
      ') /Subject (Raport oceny prywatnosci i aneks dowodowy) /Creator (Alarm prywatnosci strony) /CreationDate (' +
      pdfDate +
      ') >>'
  );

  return infoId;
}

// Tekst, obrazy i JSON są przed zapisem kodowane jako ASCII, więc pozycje
// znaków są również pozycjami bajtowymi zapisanymi w tabeli odsyłaczy PDF.
/**
 * Zapisuje obiekty i ich dokładne pozycje bajtowe.
 * @param {string[]} objects
 * @param {number} catalogId
 * @param {number} infoId
 */
function serializePdfObjects(objects, catalogId, infoId) {
  let pdf = '%PDF-1.7\n%RODO\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += index + 1 + ' 0 obj\n' + object + '\nendobj\n';
  });

  const xrefOffset = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  pdf +=
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root ' +
    catalogId +
    ' 0 R /Info ' +
    infoId +
    ' 0 R >>\nstartxref\n' +
    xrefOffset +
    '\n%%EOF\n';

  return new Blob([pdf], { type: 'application/pdf' });
}

/**
 * Składa instrukcje dokumentu w kompletny plik PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/pdf.js").PdfOptions} options
 */
export function createPdfBlob(items, options = {}) {
  const pages = paginatePdfItems(items);
  const objects = [];
  /** @type {import('../../../../types/pdf.js').AddPdfObject} */
  const addObject = (value) => {
    objects.push(value);
    return objects.length;
  };

  const catalogId = addObject('');
  const pagesId = addObject('');
  const encoding = getPdfFontEncoding();
  const regularFontId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 145 /Widths [' +
      PDF_FONT_WIDTHS.regular.join(' ') +
      '] /Encoding ' +
      encoding +
      ' >>'
  );
  const boldFontId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /FirstChar 32 /LastChar 145 /Widths [' +
      PDF_FONT_WIDTHS.bold.join(' ') +
      '] /Encoding ' +
      encoding +
      ' >>'
  );

  const imageResources = appendImageObjects(pages, addObject);
  const pageIds = appendPageObjects(
    pages,
    options,
    { pagesId, regularFontId, boldFontId, imageResources },
    addObject
  );
  const { fileSpecId, embeddedNamesId } = appendEvidenceAttachment(options, addObject);
  const infoId = appendDocumentMetadata(options, addObject);

  const attachmentCatalog =
    fileSpecId && embeddedNamesId
      ? ' /Names << /EmbeddedFiles ' + embeddedNamesId + ' 0 R >> /AF [' + fileSpecId + ' 0 R]'
      : '';
  objects[catalogId - 1] =
    '<< /Type /Catalog /Pages ' + pagesId + ' 0 R' + attachmentCatalog + ' >>';
  objects[pagesId - 1] =
    '<< /Type /Pages /Kids [' +
    pageIds.map((id) => id + ' 0 R').join(' ') +
    '] /Count ' +
    pageIds.length +
    ' >>';

  return serializePdfObjects(objects, catalogId, infoId);
}
