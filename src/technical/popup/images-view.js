// Budowa kafelków DOM i pomijanie niezmienionych renderów.
import { getImageDisplaySource, MIN_IMAGE_LONG_SIDE } from '../../business/popup/image-rules.js';
import { getImageIssueBadges } from '../../business/popup/image-evidence.js';
import { clearElement, appendEmptyState } from './dom.js';

/** @param {import('../../../types/popup.js').CachedViewDependencies & {dimensions: import('../../../types/popup.js').ImageDimensionsPort}} dependencies */
export function createImagesView({ elements, renderCache, dimensions: imageDimensions }) {
  /** @param {HTMLAnchorElement} link @param {import('../../../types/scanning.js').ImageFinding} image */
  function appendImageIssueBar(link, image) {
    const badges = getImageIssueBadges(image);
    if (badges.length === 0) {
      return;
    }

    const issueBar = document.createElement('div');
    issueBar.className = 'image-issues';
    issueBar.setAttribute('aria-label', 'Sygnały ryzyka dla zdjęcia');

    badges.forEach((badge) => {
      const item = document.createElement('span');
      item.className = `image-issue image-issue-${badge.key}`;
      item.title = badge.title;
      item.setAttribute('aria-label', `${badge.label}: ${badge.title}`);

      const icon = document.createElement('span');
      icon.className = 'image-issue-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\u{1F44E}';

      const label = document.createElement('span');
      label.textContent = badge.label;

      item.append(icon, label);
      issueBar.appendChild(item);
    });

    link.appendChild(issueBar);
  }

  /** @param {import('../../../types/popup.js').ImageRow} rowData */
  function appendImageTile(rowData) {
    const { image } = rowData;

    const link = document.createElement('a');
    link.className = 'image-tile';
    link.href = image.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.setAttribute('aria-label', 'Otwórz zdjęcie będące dowodem ryzyka');

    const imageElement = document.createElement('img');
    imageElement.src = getImageDisplaySource(image);
    imageElement.alt = '';
    imageElement.loading = 'lazy';
    imageElement.decoding = 'async';
    imageElement.referrerPolicy = 'no-referrer';

    imageElement.addEventListener('error', () => {
      link.remove();
    }, { once: true });

    link.appendChild(imageElement);
    appendImageIssueBar(link, image);
    elements.resultsGrid.appendChild(link);
  }

  /**
   * @param {import('../../../types/scanning.js').ImageFinding[]} images
   * @param {import('../../../types/popup.js').ImageRow[]} rows
   * @param {number} pendingCount
   */
  function getImageRenderSignature(images, rows, pendingCount) {
    const imageSignature = images
      .map((image) => {
        const dimensions = imageDimensions.getKnownRecord(image);
        const dimensionSignature = dimensions
          ? [dimensions.state, dimensions.width, dimensions.height, dimensions.passes].join('\u0000')
          : 'unknown';

        /** @type {Partial<import('../../../types/scanning.js').CacheAudit>} */
        const cache = image.cache || {};
        /** @type {Partial<import('../../../types/scanning.js').IndexingAudit>} */
        const indexing = image.indexing || {};
        const bodyComparison = image.bodyComparison || {};
        /** @type {Partial<import('../../../types/scanning.js').RobotsRule>} */
        const matchedRule = indexing.robotsTxtMatchedRule || {};

        return [
          image.url,
          image.previewDataUrl ? image.previewDataUrl.length : 0,
          image.status,
          image.mimeType,
          image.encodedDataLength,
          image.cacheControl || cache.cacheControl || '',
          image.missingCacheNoStore === true || cache.missingNoStore === true,
          image.improperImageAuthorization === true || bodyComparison.improperAuthorization === true,
          bodyComparison.status || '',
          bodyComparison.exactMatch === true,
          bodyComparison.originalBodySha256 || '',
          bodyComparison.noCredentialsBodySha256 || '',
          image.googleIndexingNotBlocked === true || image.googleIndexingOpen === true || indexing.googleNotBlocked === true || indexing.googleIndexingOpen === true,
          image.googleIndexingBlocked === true || indexing.googleBlocked === true,
          indexing.headerBlocksGoogle === true,
          indexing.robotsTxtBlocksGoogle === true,
          indexing.robotsTxtStatus || '',
          indexing.xRobotsTag || '',
          matchedRule.directive || '',
          matchedRule.path || '',
          dimensionSignature
        ].join('\u0000');
      })
      .join('\u0001');

    return `${imageSignature}\u0002${rows.length}\u0002${pendingCount}`;
  }

  /** @param {import('../../../types/popup.js').ImageRenderModel} model */
  function renderImages({ images, rows, pendingCount }) {
    const nextSignature = getImageRenderSignature(images, rows, pendingCount);
    if (nextSignature !== renderCache.imageRenderSignature) {
      clearElement(elements.resultsGrid);

      if (images.length === 0) {
        appendEmptyState(elements.resultsGrid, 'Nie zebrano jeszcze zdjęć.');
      } else if (rows.length === 0 && pendingCount > 0) {
        appendEmptyState(elements.resultsGrid, `Sprawdzam wymiary. Pokazuję tylko zdjęcia JPEG/JPG lub PNG z dłuższym bokiem co najmniej ${MIN_IMAGE_LONG_SIDE}px.`);
      } else if (rows.length === 0) {
        appendEmptyState(elements.resultsGrid, `Nie znaleziono zdjęć JPEG/JPG lub PNG z dłuższym bokiem co najmniej ${MIN_IMAGE_LONG_SIDE}px.`);
      } else {
        rows.forEach(appendImageTile);
      }

      renderCache.imageRenderSignature = nextSignature;
    }
  }

  return { renderImages };
}
