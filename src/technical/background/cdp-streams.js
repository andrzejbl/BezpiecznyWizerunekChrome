/** @typedef {import('../../../types/cdp.js').StreamChunk} StreamChunk */

// Odczytuj i zamykaj strumienie CDP oraz przekształcaj reprezentację odpowiedzi bez zmiany jej bajtów.

import { ROBOTS_READ_LIMIT_BYTES } from '../../business/scanning/config.js';
import { sendDebuggerCommand } from './chrome-api.js';

/**
 * @param {number} tabId
 * @param {string} streamHandle
 */
export async function readCdpStream(tabId, streamHandle) {
  let text = '';

  try {
    while (text.length < ROBOTS_READ_LIMIT_BYTES) {
      const chunk = /** @type {StreamChunk} */ (await sendDebuggerCommand(tabId, 'IO.read', { handle: streamHandle }));
      if (chunk.data) {
        text += chunk.base64Encoded ? atob(chunk.data) : chunk.data;
      }

      if (chunk.eof === true) {
        break;
      }
    }
  } finally {
    try {
      await sendDebuggerCommand(tabId, 'IO.close', { handle: streamHandle });
    } catch (error) {
      // Nieudane zamknięcie strumienia nie unieważnia uzyskanego wyniku kontroli.
    }
  }

  return text;
}

/**
 * @param {string} body
 * @param {boolean} base64Encoded
 */
export function decodeCdpBodyToBytes(body, base64Encoded) {
  if (!body) {
    return new Uint8Array();
  }

  if (!base64Encoded) {
    return new TextEncoder().encode(String(body));
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * @param {Uint8Array<ArrayBuffer>} bytes
 */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * @param {Uint8Array<ArrayBuffer>[]} chunks
 * @param {number} totalLength
 */
function concatByteChunks(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

/**
 * @param {Uint8Array<ArrayBuffer>} bytes
 */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {number} tabId
 * @param {string} streamHandle
 * @param {number} maxBytes
 */
export async function readCdpStreamBytes(tabId, streamHandle, maxBytes) {
  /** @type {Uint8Array<ArrayBuffer>[]} */
  const chunks = [];
  let totalLength = 0;

  try {
    while (true) {
      const chunk = /** @type {StreamChunk} */ (await sendDebuggerCommand(tabId, 'IO.read', { handle: streamHandle }));
      const bytes = decodeCdpBodyToBytes(chunk.data || '', chunk.base64Encoded === true);

      if (bytes.length > 0) {
        totalLength += bytes.length;
        if (totalLength > maxBytes) {
          throw new Error(`Body is larger than ${maxBytes} bytes.`);
        }
        chunks.push(bytes);
      }

      if (chunk.eof === true) {
        break;
      }
    }
  } finally {
    try {
      await sendDebuggerCommand(tabId, 'IO.close', { handle: streamHandle });
    } catch (error) {
      // Nieudane zamknięcie strumienia nie unieważnia uzyskanego wyniku porównania.
    }
  }

  return concatByteChunks(chunks, totalLength);
}
