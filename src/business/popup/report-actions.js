// Obsługa błędów eksportu raportu należy do scenariusza użytkownika.
/** @param {import('../../../types/popup.js').ReportActionPorts} ports */
export function createReportActions({ reports, display }) {
  function exportImagesPdf() {
    return reports.exportImagesPdf().catch((error) => {
      display.setStatusText('Nie udało się utworzyć raportu: ' + error.message);
      display.setBusy(false);
    });
  }

  function exportReportZip() {
    return reports.exportReportZip().catch((error) => {
      display.setStatusText('Nie udało się utworzyć kompletu ZIP: ' + error.message);
      display.setBusy(false);
    });
  }

  return { exportImagesPdf, exportReportZip };
}
