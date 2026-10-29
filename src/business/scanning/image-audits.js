/** @typedef {import('../../../types/scanning.js').ImageRecord} ImageRecord */
/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */
/** @typedef {import('../../../types/scanning.js').BodyComparison} BodyComparison */

// Połącz dowody dotyczące pamięci podręcznej i indeksowania bez nowych żądań sieciowych.

import {
  getHeaderValue,
  getImageResponseHeaderEvidence,
  hasCacheNoStore,
  hasMeaningfulResponseMetadata,
  getGoogleRobotsHeaderBlock
} from './headers.js';
import { getRobotsResultForImage } from './robots-rules.js';

/**
 * @param {ImageRecord} image
 * @param {ScanState} state
 */
export function getImageAuditInfo(image, state) {
  const headerEvidence = getImageResponseHeaderEvidence(image);
  const headers = headerEvidence.headers;
  /** @type {BodyComparison} */
  const comparison = image && image.bodyComparison ? image.bodyComparison : {};
  const cacheChecked = headerEvidence.source === 'no-credentials-request'
    ? comparison.noCredentialsStatus !== null && comparison.noCredentialsStatus !== undefined
    : hasMeaningfulResponseMetadata(image);
  const cacheHasNoStore = hasCacheNoStore(headers);
  const headerBlock = getGoogleRobotsHeaderBlock(headers);
  const robotsResult = getRobotsResultForImage(image, state);
  const robotsCheckAllowsGoogle = robotsResult.status === 'allowed' || robotsResult.status === 'not-found';
  const googleBlocked = headerBlock.blocked || robotsResult.blocked === true;
  const googleNotBlocked = !googleBlocked && robotsCheckAllowsGoogle;

  return {
    cache: {
      checked: cacheChecked,
      headerSource: headerEvidence.source,
      cacheControl: getHeaderValue(headers, 'cache-control'),
      hasNoStore: cacheHasNoStore,
      missingNoStore: cacheChecked && !cacheHasNoStore
    },
    indexing: {
      xRobotsTag: headerBlock.header,
      headerSource: headerEvidence.source,
      xRobotsDirectives: headerBlock.directives,
      headerBlocksGoogle: headerBlock.blocked,
      robotsTxtStatus: robotsResult.status,
      robotsTxtCheckedAt: robotsResult.checkedAt || '',
      robotsTxtUrl: robotsResult.robotsUrl,
      robotsTxtBlocksGoogle: robotsResult.blocked === true,
      robotsTxtMatchedRule: robotsResult.matchedRule || null,
      robotsTxtMessage: robotsResult.message || '',
      robotsTxtHttpStatusCode: robotsResult.httpStatusCode || null,
      googleBlocked,
      googleNotBlocked,
      googleIndexingOpen: googleNotBlocked
    }
  };
}
