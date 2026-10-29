// Kodowanie JSON i SHA-256: implementacja formatu dowodowego.

import { shouldOmitEvidenceField } from '../../business/report/evidence.js';

/**
 * Kopiuje serializowalne dane z pominięciem lokalnych podglądów.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneEvidenceValue(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (shouldOmitEvidenceField(key)) {
        return undefined;
      }
      return item;
    })
  );
}

/**
 * Koduje bajty skrótu jako tekst szesnastkowy.
 * @param {ArrayBuffer} digest
 */
export function digestToHex(digest) {
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Liczy SHA-256 z tekstu kodowanego UTF-8.
 * @param {string} value
 */
export async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value));
  return digestToHex(await crypto.subtle.digest('SHA-256', bytes));
}

/**
 * Liczy SHA-256 z dokładnych bajtów gotowego pliku.
 * @param {Blob} blob
 */
export async function sha256Blob(blob) {
  return digestToHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

/**
 * Tworzy JSON ASCII, aby pozycje znaków odpowiadały pozycjom bajtowym w PDF.
 * @param {object} value
 */
export function stringifyAsciiJson(value) {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7f]/g, (char) => {
    return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
  });
}
/**
 * Zapisuje dane dowodowe jako tekst JSON w ustalonej kolejności pól.
 * @param {object} value
 */
export function stringifyEvidencePayload(value) {
  return JSON.stringify(value);
}

/**
 * Opakowuje wspólny tekst załącznika jako plik JSON.
 * @param {string} text
 */
export function createJsonBlob(text) {
  return new Blob([text], { type: 'application/json' });
}

/**
 * Opakowuje manifest integralności jako plik tekstowy.
 * @param {string} text
 */
export function createTextBlob(text) {
  return new Blob([text], { type: 'text/plain' });
}
