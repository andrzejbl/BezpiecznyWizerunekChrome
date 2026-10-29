// Kontrakty elementów dokumentu: treść → pozycje na stronach → obiekty PDF.
// Plik jest używany tylko przez JSDoc i nie jest ładowany przez rozszerzenie.

/** @typedef {number[]} PdfColor Składowe RGB w przedziale 0–1. */
/** @typedef {'regular' | 'bold'} PdfFont */
/** @typedef {{dataUrl: string, width: number, height: number}} PdfPreview Lokalny JPEG. */
/** @typedef {{indent?: number, gapBefore?: number, gapAfter?: number}} PdfSpacing */
/**
 * Opcje formatowania; brak wartości wybiera dotychczasowy styl domyślny.
 * @typedef {object} PdfTextOptions
 * @property {number} [indent]
 * @property {number} [gapBefore]
 * @property {number} [gapAfter]
 * @property {number} [size]
 * @property {PdfFont} [font]
 * @property {PdfColor} [color]
 * @property {number} [width]
 * @property {number} [maxLength]
 */
/**
 * @typedef {object} PdfBlockStyle
 * @property {number} [padding]
 * @property {PdfColor} [fill]
 * @property {PdfColor} [border]
 * @property {PdfColor | null} [accent]
 */
/** @typedef {PdfTextOptions & PdfBlockStyle} PdfBlockOptions */
/** @typedef {PdfSpacing & {maxWidth?: number, maxHeight?: number}} PdfImageOptions */
/** @typedef {PdfSpacing & {color?: PdfColor}} PdfRuleOptions */
/** @typedef {PdfTextOptions & {ruleColor?: PdfColor}} PdfSectionOptions */

/**
 * @typedef {object} PdfTextContent
 * @property {'text'} kind
 * @property {string} text
 * @property {number} size
 * @property {PdfFont} font
 * @property {PdfColor} color
 */
/** @typedef {PdfSpacing & PdfTextContent} PdfText */
/**
 * @typedef {object} PdfBlockContent
 * @property {'block'} kind
 * @property {string[]} lines
 * @property {number} size
 * @property {number} width
 * @property {number} padding
 * @property {PdfFont} font
 * @property {PdfColor} color
 * @property {PdfColor} fill
 * @property {PdfColor} border
 * @property {PdfColor | null} accent
 */
/** @typedef {PdfSpacing & PdfBlockContent} PdfBlock */
/**
 * @typedef {object} PdfImageContent
 * @property {'image'} kind
 * @property {string} dataUrl
 * @property {number} pixelWidth
 * @property {number} pixelHeight
 * @property {number} displayWidth
 * @property {number} displayHeight
 * @property {string} [pdfImageName] Nadawana podczas rejestracji zasobów PDF.
 */
/** @typedef {PdfSpacing & PdfImageContent} PdfImage */
/** @typedef {PdfSpacing & {kind: 'rule', color: PdfColor}} PdfRule */
/** @typedef {{kind: 'page-break'}} PdfPageBreak */
/** @typedef {PdfText | PdfBlock | PdfImage | PdfRule | PdfPageBreak} PdfItem */
/** @typedef {PdfText & {baseline: number}} PositionedPdfText */
/** @typedef {PdfBlock & {top: number, height: number, lineHeight: number}} PositionedPdfBlock */
/** @typedef {PdfImage & {top: number}} PositionedPdfImage */
/** @typedef {PdfRule & {y: number}} PositionedPdfRule */
/** @typedef {PositionedPdfText | PositionedPdfBlock | PositionedPdfImage | PositionedPdfRule} PositionedPdfItem */
/** @typedef {PositionedPdfItem[][]} PdfPages */

/**
 * Metadane i załącznik są opcjonalne również dla samodzielnego modułu zapisującego PDF.
 * @typedef {object} PdfOptions
 * @property {string} [reportId]
 * @property {string} [domain]
 * @property {Date} [generatedAt]
 * @property {string} [attachmentName]
 * @property {string} [attachmentText]
 */
/** @typedef {(value: string) => number} AddPdfObject Zwraca numer zapisanego obiektu. */
/** @typedef {{imageId: number, imageName: string}} PdfImageResource */
/**
 * @typedef {object} PdfResources
 * @property {number} pagesId
 * @property {number} regularFontId
 * @property {number} boldFontId
 * @property {PdfImageResource[]} imageResources
 */

export {};
