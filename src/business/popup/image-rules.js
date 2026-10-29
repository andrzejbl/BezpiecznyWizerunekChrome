// Reguły kwalifikowania zdjęć do wyników. Odczyt wymiarów jest dostarczany jako port.

export const MIN_IMAGE_LONG_SIDE = 200;

/** @param {import('../../../types/scanning.js').ImageFinding|null} image */
export function getImageDisplaySource(image) {
  if (!image) {
    return '';
  }
  return image.previewDataUrl || image.url || '';
}

/** @param {import('../../../types/scanning.js').ImageFinding|null} image */
export function getImageDimensionKey(image) {
  const comparison = image && image.bodyComparison ? image.bodyComparison : {};
  const previewSignature = image && image.previewDataUrl
    ? `preview:${comparison.originalBodySha256 || image.previewDataUrl.length}`
    : 'url';

  return `${image && image.url ? image.url : ''}\u0000${previewSignature}`;
}

/** @param {import('../../../types/scanning.js').ImageFinding} image */
export function isExcludedImageFormat(image) {
  const mimeType = String(image.mimeType || '').toLowerCase();
  if (mimeType) {
    return mimeType !== 'image/jpeg' && mimeType !== 'image/jpg' && mimeType !== 'image/pjpeg' && mimeType !== 'image/png';
  }

  try {
    const pathname = new URL(image.url).pathname.toLowerCase();
    return !/\.(?:jpe?g|png)$/i.test(pathname);
  } catch (error) {
    return !/\.(?:jpe?g|png)(?:[?#]|$)/i.test(String(image.url || ''));
  }
}

/** @param {import('../../../types/scanning.js').ImageFinding|null} image */
export function hasImproperImageAuthorization(image) {
  const bodyComparison = image && image.bodyComparison ? image.bodyComparison : {};
  return image && (image.improperImageAuthorization === true || bodyComparison.improperAuthorization === true);
}

/**
 * @param {import('../../../types/scanning.js').ImageFinding[]} images
 * @param {import('../../../types/popup.js').ImageDimensionsPort['getRecord']} getDimensionRecord
 * @returns {{rows: import('../../../types/popup.js').ImageRow[], pendingCount: number}}
 */
export function getFilteredImageRows(images, getDimensionRecord) {
  let pendingCount = 0;
  /** @type {import('../../../types/popup.js').ImageRow[]} */
  const rows = [];

  images.forEach((image) => {
    if (isExcludedImageFormat(image) || !hasImproperImageAuthorization(image)) {
      return;
    }

    const dimensions = getDimensionRecord(image);

    if (dimensions.state === 'pending') {
      pendingCount += 1;
      return;
    }

    if (!dimensions.passes) {
      return;
    }

    rows.push({ image, dimensions });
  });

  return { rows, pendingCount };
}

/** @param {import('../../../types/popup.js').ImageRow[]} rows @returns {import('../../../types/popup.js').VisibleImage[]} */
export function buildVisibleImages(rows) {
  return rows.map(({ image, dimensions }) => ({
    ...image,
    width: dimensions.width,
    height: dimensions.height,
    longSide: dimensions.longSide
  }));
}
