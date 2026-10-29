// Adaptery API przeglądarki; szczegóły transportu nie trafiają do scenariuszy.
/** @param {import('../../../types/popup.js').ScannerCommand} type @returns {Promise<import('../../../types/scanning.js').ScanSnapshot>} */
export function sendMessage(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (/** @type {import('../../../types/popup.js').ScannerResponse|undefined} */ response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response || response.ok !== true) {
        reject(new Error((response && response.error) || 'Nieznany błąd rozszerzenia.'));
        return;
      }

      resolve(response.state);
    });
  });
}

/** @type {import('../../../types/popup.js').ClipboardPort} */
export const clipboard = {
  writeText: (text) => navigator.clipboard.writeText(text)
};

/** @type {import('../../../types/popup.js').ConfirmationPort} */
export const confirmation = {
  confirmRestart: (message) => window.confirm(message)
};

/**
 * Okno rozszerzenia pobiera stan od razu i zleca kolejne odczyty co sekundę, także po zatrzymaniu skanu.
 * Moduł tła odpowiada na getState; nie wysyła tutaj samodzielnych powiadomień o zmianie wyników.
 * @param {() => Promise<void>} refreshState
 */
export function beginStatePolling(refreshState) {
  refreshState();
  setInterval(refreshState, 1000);
}

export function currentTime() {
  return new Date();
}
