// Model dokumentu określa treść i kolejność sekcji, bez pojęć związanych z PDF.

/**
 * Ustala treść i kolejność sekcji bez zależności od PDF.
 * @param {import("../../../types/report.js").PreparedReportStats} reportStats
 * @param {import("../../../types/report.js").ReportContext} context
 * @returns {import("../../../types/report.js").ReportModel}
 */
export function createReportModel(reportStats, context) {
  return {
    context,
    sections: [
      { kind: 'cover', reportStats, summary: context.summary },
      { kind: 'scope', reportStats },
      { kind: 'images', findings: reportStats.imageFindings },
      { kind: 'scripts', groups: reportStats.scriptGroups },
      { kind: 'passwords', groups: reportStats.passwordGroups, tree: reportStats.passwordTree },
      { kind: 'method' }
    ]
  };
}

/**
 * Wspólny zestaw nazw plików jednego eksportu.
 * @param {string} pdfFilename
 * @returns {import("../../../types/report.js").ReportFileNames}
 */
export function reportFileNames(pdfFilename) {
  const base = pdfFilename.replace(/\.pdf$/i, '');
  return {
    pdf: pdfFilename,
    json: base + '-dowody-techniczne.json',
    integrity: base + '-integralnosc.sha256.txt',
    zip: base + '-komplet.zip'
  };
}
