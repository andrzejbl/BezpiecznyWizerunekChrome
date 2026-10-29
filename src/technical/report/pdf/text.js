// Normalizacja tekstu, kodowanie znaków specjalnych ciągów PDF i zawijanie wierszy.

import { PDF_POLISH_GLYPHS } from './fonts.js';

/**
 * Normalizuje znaki obsługiwane przez osadzoną mapę znaków czcionki.
 * @param {unknown} value
 */
export function sanitizePdfText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7eąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '?')
    .trim();
}

/**
 * Koduje polskie glify i znaki specjalne ciągów PDF.
 * @param {unknown} value
 */
export function escapePdfString(value) {
  let output = '';

  for (const char of sanitizePdfText(value)) {
    const glyph = PDF_POLISH_GLYPHS[char];
    if (glyph) {
      output += '\\' + glyph.code.toString(8).padStart(3, '0');
    } else if (char === '\\' || char === '(' || char === ')') {
      output += '\\' + char;
    } else {
      output += char;
    }
  }

  return output;
}

export function getPdfFontEncoding() {
  const differences = Object.values(PDF_POLISH_GLYPHS)
    .sort((a, b) => a.code - b.code)
    .map((glyph, index, glyphs) => {
      const previous = index > 0 ? glyphs[index - 1] : null;
      const codePrefix = !previous || glyph.code !== previous.code + 1 ? glyph.code + ' ' : '';
      return codePrefix + '/' + glyph.name;
    })
    .join(' ');

  return '<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [' + differences + '] >>';
}

/**
 * Dzieli tekst na wiersze ograniczone liczbą znaków.
 * @param {unknown} value
 * @param {number} maxLength
 */
export function wrapText(value, maxLength) {
  const text = sanitizePdfText(value);
  if (!text) {
    return [''];
  }

  const lines = [];
  let current = '';

  text.split(' ').forEach((word) => {
    if (word.length > maxLength) {
      if (current) {
        lines.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      return;
    }

    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}
