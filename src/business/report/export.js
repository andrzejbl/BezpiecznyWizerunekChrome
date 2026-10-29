// Scenariusz użytkownika. Czytaj od góry: zakończ skan, pobierz ustalenia,
// przygotuj dowody, utwórz pliki i pobierz wybrany raport.
// Wszystkie operacje przeglądarki i formatów plików są nazwanymi portami.
// Mapę danych od przycisku do pobrania opisuje docs/flows/report.md.

import { scanIsInProgress, hasReportData } from './rules.js';
import { prepareReportFindings, prepareReportEvidence } from './prepare.js';
import { createReportFiles, chooseReportDownload } from './files.js';

/**
 * Porty są zwykłymi funkcjami przekazanymi w composition/report.js.
 * getLatestState pozostaje funkcją odczytującą stan, który może się zmienić podczas oczekiwania.
 * @param {'pdf' | 'zip'} downloadMode
 * @param {import('../../../types/report.js').ReportPorts} ports Odczyt ustaleń, zakończenie skanu, prezentacja postępu i pliki.
 * @returns {Promise<void>}
 */
export async function exportReport(downloadMode, ports) {
  // 1. Raport opisuje zakończony skan lub wyniki zebrane przed jego zatrzymaniem.
  if (scanIsInProgress(ports.getLatestState())) {
    if (!ports.confirmStopScan()) {
      ports.setStatusText('Skanowanie trwa. Raport nie został utworzony.');
      return;
    }
    ports.setBusy(true);
    ports.setStatusText('Zatrzymuję skanowanie przed utworzeniem raportu...');
    try {
      const stoppedState = await ports.stopScan();
      // render aktualizuje sesję okna rozszerzenia; kolejne odczyty korzystają już z tego stanu.
      ports.render(stoppedState);
    } catch (error) {
      ports.setBusy(false);
      throw error;
    }
  }

  // 2. Pobierz aktualne ustalenia dopiero po ewentualnym zakończeniu skanu.
  if (!hasReportData(ports.getLatestState())) {
    ports.setBusy(false);
    return;
  }
  const sourceReportStats = ports.getReportStats();
  ports.setBusy(true);
  ports.setStatusText('Tworzę raport i obliczam odcisk dowodów...');

  try {
    // 3. Podglądy i dowody powstają przed utworzeniem dokumentu.
    const reportStats = await prepareReportFindings(sourceReportStats, ports.createImagePreview);
    // Dopiero po await odczytujemy podsumowanie i domenę. Eksport nie tworzy
    // jednego, głęboko zamrożonego obrazu całej sesji na początku operacji.
    const generatedAt = ports.now();
    const summary = ports.getSecuritySummary();
    const reportId = 'RODO-' + ports.getReportPageDomain() + '-' +
      ports.getFilenameTimestamp(generatedAt);
    /** @type {import('../../../types/report.js').ReportDraft} */
    const report = { reportStats, generatedAt, summary, reportId };
    report.evidence = await prepareReportEvidence(report, ports);

    // 4. Utwórz PDF i towarzyszące mu dowody, a następnie wybierz PDF lub ZIP.
    const files = await createReportFiles(/** @type {import('../../../types/report.js').Report} */ (report), ports);
    const download = await chooseReportDownload(downloadMode, files, ports.createArchive);

    // 5. Pobierz gotowy plik i zakończ prezentację postępu.
    ports.downloadBlob(download.filename, download.file);
    ports.setStatusText(download.statusText);
  } finally {
    // Komunikat o błędzie ustawia wywołujący scenariusz popup/report-actions.js.
    ports.setBusy(false);
  }
}
