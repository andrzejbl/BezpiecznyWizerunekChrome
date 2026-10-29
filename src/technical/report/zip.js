// Zapis archiwum ZIP bez kompresji, z nazwami plików w UTF-8 i katalogiem centralnym.

/** @type {Uint32Array | null} */
let zipCrc32Table = null;

export function getZipCrc32Table() {
  if (zipCrc32Table) {
    return zipCrc32Table;
  }

  zipCrc32Table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    zipCrc32Table[index] = value >>> 0;
  }
  return zipCrc32Table;
}

/**
 * Liczy sumę CRC-32 wpisu archiwum.
 * @param {Uint8Array} bytes
 */
export function calculateZipCrc32(bytes) {
  const table = getZipCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Koduje znacznik czasu zgodnie z formatem ZIP.
 * @param {Date} date
 * @returns {import("../../../types/report.js").ZipDosDateTime}
 */
export function getZipDosDateTime(date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

/**
 * Zapisuje nagłówek poprzedzający dane pliku.
 * @param {Uint8Array} nameBytes
 * @param {Uint8Array} dataBytes
 * @param {number} crc32
 * @param {import("../../../types/report.js").ZipDosDateTime} dos
 */
function createLocalFileHeader(nameBytes, dataBytes, crc32, dos) {
  const localHeader = new Uint8Array(30 + nameBytes.length);
  const localView = new DataView(localHeader.buffer);
  // Lokalny nagłówek pliku: sygnatura, wersja potrzebna do odczytu, flaga UTF-8 i metoda bez kompresji.
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0x0800, true);
  localView.setUint16(8, 0, true);
  // Znacznik czasu DOS, suma kontrolna i rozmiary pliku bez kompresji.
  localView.setUint16(10, dos.time, true);
  localView.setUint16(12, dos.date, true);
  localView.setUint32(14, crc32, true);
  localView.setUint32(18, dataBytes.length, true);
  localView.setUint32(22, dataBytes.length, true);
  // Długość nazwy pliku, puste pole dodatkowe i bajty nazwy w UTF-8.
  localView.setUint16(26, nameBytes.length, true);
  localView.setUint16(28, 0, true);
  localHeader.set(nameBytes, 30);
  return localHeader;
}

/**
 * Zapisuje pozycję pliku w katalogu archiwum.
 * @param {Uint8Array} nameBytes
 * @param {Uint8Array} dataBytes
 * @param {number} crc32
 * @param {import("../../../types/report.js").ZipDosDateTime} dos
 * @param {number} localOffset
 */
function createCentralDirectoryHeader(nameBytes, dataBytes, crc32, dos, localOffset) {
  const centralHeader = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(centralHeader.buffer);
  // Nagłówek katalogu centralnego opisujący odpowiadający mu lokalny wpis pliku.
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0x0800, true);
  centralView.setUint16(10, 0, true);
  // Znacznik czasu DOS, suma kontrolna i rozmiary pliku bez kompresji.
  centralView.setUint16(12, dos.time, true);
  centralView.setUint16(14, dos.date, true);
  centralView.setUint32(16, crc32, true);
  centralView.setUint32(20, dataBytes.length, true);
  centralView.setUint32(24, dataBytes.length, true);
  // Nazwa pliku, pole dodatkowe, komentarz, numer dysku i atrybuty.
  centralView.setUint16(28, nameBytes.length, true);
  centralView.setUint16(30, 0, true);
  centralView.setUint16(32, 0, true);
  centralView.setUint16(34, 0, true);
  centralView.setUint16(36, 0, true);
  centralView.setUint32(38, 0, true);
  // Pozycja lokalnego nagłówka tego pliku, liczona w bajtach od początku archiwum.
  centralView.setUint32(42, localOffset, true);
  centralHeader.set(nameBytes, 46);
  return centralHeader;
}

/**
 * Kończy katalog wpisów ZIP.
 * @param {number} fileCount
 * @param {number} centralSize
 * @param {number} localOffset
 */
function createEndOfCentralDirectory(fileCount, centralSize, localOffset) {
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  // Koniec katalogu centralnego: jeden dysk, liczby wpisów, rozmiar katalogu i jego pozycja.
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, fileCount, true);
  endView.setUint16(10, fileCount, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return endRecord;
}

/**
 * Tworzy archiwum bez kompresji, zachowując kolejność plików.
 * @param {import("../../../types/report.js").ZipEntry[]} files
 * @param {Date} generatedAt
 */
export async function createZipBlob(files, generatedAt = new Date()) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const dos = getZipDosDateTime(generatedAt);
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc32 = calculateZipCrc32(dataBytes);
    const localHeader = createLocalFileHeader(nameBytes, dataBytes, crc32, dos);
    localParts.push(localHeader, dataBytes);

    const centralHeader = createCentralDirectoryHeader(
      nameBytes,
      dataBytes,
      crc32,
      dos,
      localOffset
    );
    centralParts.push(centralHeader);

    localOffset += localHeader.length + dataBytes.length;
    centralSize += centralHeader.length;
  }

  const endRecord = createEndOfCentralDirectory(files.length, centralSize, localOffset);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}
