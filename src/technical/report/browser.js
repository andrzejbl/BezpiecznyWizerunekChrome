// Dostęp do środowiska przeglądarki używany przez scenariusz raportowania.

export function getExtensionManifest() {
  return chrome.runtime.getManifest();
}

export function confirmStopScan() {
  return window.confirm(
    'Skanowanie nadal trwa. Zakończyć skan i utworzyć raport z dotychczas zebranych wyników?'
  );
}

export function reportGenerationTime() {
  return new Date();
}
