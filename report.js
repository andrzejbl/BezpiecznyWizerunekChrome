// Publiczny interfejs raportowania używany przez okno rozszerzenia.
// Scenariusz biznesowy i adaptery techniczne łączą się w composition/report.js.
export { exportReport, exportImagesPdf, exportReportZip } from './src/composition/report.js';
