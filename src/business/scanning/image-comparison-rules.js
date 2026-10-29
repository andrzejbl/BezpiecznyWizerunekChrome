// Reguła oceny bez efektów ubocznych: identyczne odpowiedzi błędu i częściowa zgodność nie potwierdzają problemu.
/**
 * @param {number|null} status
 */
function isSuccessfulHttpStatus(status) {
  return typeof status === 'number' && status >= 200 && status < 300;
}

/**
 * @param {{originalLength:number,publicLength:number,originalSha256:string,publicSha256:string,originalStatus:number|null,publicStatus:number|null}} comparison
 */
export function assessImageBodyComparison({
  originalLength,
  publicLength,
  originalSha256,
  publicSha256,
  originalStatus,
  publicStatus
}) {
  const exactMatch = originalLength === publicLength && originalSha256 === publicSha256;
  const improperAuthorization = exactMatch && isSuccessfulHttpStatus(originalStatus) && isSuccessfulHttpStatus(publicStatus);
  return { exactMatch, improperAuthorization };
}
