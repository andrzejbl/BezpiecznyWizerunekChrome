// Implementacja pobrania w przeglądarce. Nazwy i treść wybiera warstwa biznesowa.
/** @param {string} filename @param {string} type @param {string} text */
export function downloadText(filename, type, text) {
  const blob = new Blob([text], { type });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/** @param {string} filename @param {Blob} blob */
export function downloadBlob(filename, blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

// Serializacja jest szczegółem formatu pliku; port przyjmuje wybrane wcześniej dane.
/** @param {string} filename @param {unknown} data */
export function downloadJson(filename, data) {
  downloadText(filename, 'application/json', JSON.stringify(data, null, 2));
}

/** @param {unknown} value */
function csvEscape(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

/** @param {string} filename @param {string[]} headers @param {unknown[][]} rows */
export function downloadCsv(filename, headers, rows) {
  const serializedRows = rows.map((row) => row.map(csvEscape).join(','));
  downloadText(filename, 'text/csv', `${headers.join(',')}\n${serializedRows.join('\n')}`);
}
