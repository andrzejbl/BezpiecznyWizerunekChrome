// Katalog i etykiety CWE wspólne dla dowodów JSON oraz sekcji dokumentu.

export const REPORT_CWE = Object.freeze({
  improperAuthorization: {
    id: 'CWE-863',
    name: 'Incorrect Authorization',
    description:
      'Serwer wydaje zdjęcie bez powiązania dostępu z potwierdzoną tożsamością i uprawnieniem osoby pobierającej; poprawny token URL może wystarczać każdemu jego posiadaczowi.'
  },
  personalDataExposure: {
    id: 'CWE-359',
    name: 'Exposure of Private Personal Information to an Unauthorized Actor',
    description:
      'Ma zastosowanie, ponieważ raport zakłada wcześniejszą weryfikację użytkownika, że zdjęcie zawiera prywatne dane osobowe.'
  },
  browserCache: {
    id: 'CWE-525',
    name: 'Use of Web Browser Cache Containing Sensitive Information',
    description:
      'Ma zastosowanie, gdy odpowiedź zawierająca wrażliwe zdjęcie może zostać zachowana przez cache.'
  },
  thirdPartyCode: {
    id: 'CWE-830',
    name: 'Inclusion of Web Functionality from an Untrusted Source',
    description:
      'Ma zastosowanie po potwierdzeniu, że zewnętrzne źródło nie powinno działać w zaufanym kontekście strony.'
  },
  permissiveCors: {
    id: 'CWE-942',
    name: 'Permissive Cross-domain Policy with Untrusted Domains',
    description:
      'Ma zastosowanie do nadmiernie otwartej polityki CORS, jeżeli umożliwia odczyt niezaufanej domenie.'
  },
  credentials: {
    id: 'CWE-522',
    name: 'Insufficiently Protected Credentials',
    description:
      'Ma zastosowanie, gdy dane uwierzytelniające są podatne na nieuprawnione przechwycenie lub odczyt.'
  }
});

/**
 * Wyświetlana etykieta wpisu katalogu CWE.
 * @param {import("../../../types/report.js").CweEntry} cwe
 */
export function formatCwe(cwe) {
  return cwe.id + ' - ' + cwe.name;
}

/**
 * Klasyfikacja CWE wynikająca z trybów dostępu CORS.
 * @param {{modes?: string[]} | null | undefined} cors
 */
export function getCorsCweText(cors) {
  const modes = cors && Array.isArray(cors.modes) ? cors.modes : [];
  return modes.some((mode) => String(mode).startsWith('cors-'))
    ? formatCwe(REPORT_CWE.permissiveCors)
    : 'Brak osobnego CWE dla CORS: wykryty tryb nie przekracza granicy originu.';
}
