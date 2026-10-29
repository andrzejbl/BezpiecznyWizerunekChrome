// Opis metody, ograniczeń i integralności raportu.

import { PDF_COLORS } from '../pdf/theme.js';
import { formatHashForPdf } from '../format.js';
import { pushPdfSection, pushPdfBlock, pushPdfLine } from '../pdf/items.js';

/**
 * Dodaje treść sekcji do instrukcji dokumentu PDF.
 * @param {import("../../../../types/pdf.js").PdfItem[]} items
 * @param {import("../../../../types/report.js").ReportContext} context
 */
export function appendMethodSection(items, context) {
  pushPdfSection(items, '5. Metoda, ograniczenia i integralność');

  pushPdfLine(items, 'Metoda badania', { size: 11, font: 'bold', gapAfter: 3 });
  pushPdfLine(
    items,
    '1. chrome.debugger rejestruje Network, Debugger, Runtime i Page od chwili podłączenia; strona jest przeładowywana bez cache.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '2. Body zdjęcia z sesji jest porównywane z żądaniem CDP includeCredentials=false. Wynik wymaga statusów 2xx, identycznej długości i identycznego SHA-256.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '3. Cache, X-Robots-Tag i CORS pochodzą z odpowiedzi bez aktywnej sesji; robots.txt jest sprawdzany dla originu zdjęcia.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '4. Domeny są grupowane po głównej domenie. ERR_BLOCKED_BY_CLIENT pozostaje oznaczony jako zablokowany lokalnie.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '5. Pola hasła są sprawdzane cyklicznie. Wartości haseł nie są przechwytywane ani zapisywane.',
    { size: 9, indent: 8, gapAfter: 8 }
  );

  pushPdfLine(items, 'Ograniczenia', { size: 11, font: 'bold', gapAfter: 3 });
  pushPdfLine(
    items,
    '- Raport opisuje jedno ładowanie jednej karty. Warunkowe zasoby, inne podstrony, interakcje użytkownika i zasoby uruchamiane później mogą nie zostać wykryte.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '- CORS/pixel access oznacza możliwość odczytu treści zdjęcia przez JavaScript, nie jest sam w sobie dowodem przesłania pikseli do konkretnej domeny.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '- Sprawdzenie Google ocenia deklaratywne blokady pobierania i indeksowania, a nie rzeczywistą obecność zdjęcia w indeksie wyszukiwarki.',
    { size: 9, indent: 8 }
  );
  pushPdfLine(
    items,
    '- Klasyfikacja głównej domeny korzysta z ograniczonej listy sufiksów, a nie pełnej Public Suffix List.',
    { size: 9, indent: 8, gapAfter: 8 }
  );

  pushPdfLine(items, 'Integralność i pliki dowodowe', { size: 11, font: 'bold', gapAfter: 5 });
  pushPdfBlock(
    items,
    'SHA-256 payloadu: ' +
      formatHashForPdf(context.evidenceSha256) +
      '.\nSHA-256 kompletnego JSON: ' +
      formatHashForPdf(context.attachmentSha256) +
      '.\nJSON jest osadzony w PDF; ZIP zawiera także osobny JSON i manifest integralności.',
    {
      size: 9,
      font: 'bold',
      fill: PDF_COLORS.blueSoft,
      border: PDF_COLORS.blue,
      accent: PDF_COLORS.blue,
      gapAfter: 6
    }
  );
  pushPdfLine(
    items,
    'SHA-256 wykrywa zmianę plików, ale nie jest podpisem cyfrowym ani zaufanym znacznikiem czasu.',
    {
      size: 9,
      font: 'bold',
      color: PDF_COLORS.redDark,
      gapAfter: 0
    }
  );
}
