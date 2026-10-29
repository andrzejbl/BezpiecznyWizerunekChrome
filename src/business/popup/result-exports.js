// Scenariusze eksportu wyników: wybór danych, format i komunikat po zakończeniu.
// Porty clipboard/files wykonują operacje systemowe; display przekazuje komunikat użytkownikowi.
/** @param {import('../../../types/popup.js').ResultExportPorts} ports */
export function createResultExports({ session, clipboard, files, display }) {
  async function copyImageLinks() {
    if (session.visibleImages.length === 0) {
      return;
    }

    const urls = session.visibleImages.map((image) => image.url).join('\n');
    await clipboard.writeText(urls);
    display.setStatusText(`Skopiowano linki do zdjęć bez poprawnej autoryzacji: ${session.visibleImages.length}.`);
  }

  function exportImagesJson() {
    if (session.visibleImages.length === 0) {
      return;
    }

    const exportRows = session.visibleImages.map(({ previewDataUrl, ...metadata }) => metadata);
    files.downloadJson('image-network-urls.json', exportRows);
    display.setStatusText(`Wyeksportowano rekordy zdjęć bez poprawnej autoryzacji: ${session.visibleImages.length}.`);
  }

  function getThirdPartyListText() {
    const tree = session.latestState && session.latestState.scriptTree ? session.latestState.scriptTree : null;
    if (!tree || tree.thirdPartyGroups.length === 0) {
      return '';
    }

    return tree.thirdPartyGroups
      .map((group) => {
        const blockedSuffix = group.blockedCount ? `, zablokowane: ${group.blockedCount}` : '';
        return `${group.hostname} (${group.count}${blockedSuffix})`;
      })
      .join('\n');
  }

  async function copyThirdPartyList() {
    const text = getThirdPartyListText();
    if (!text) {
      return;
    }

    await clipboard.writeText(text);
    display.setStatusText('Skopiowano unikalne domeny zewnętrzne.');
  }

  function exportScriptsJson() {
    const tree = session.latestState && session.latestState.scriptTree ? session.latestState.scriptTree : null;
    const scripts = session.latestState && Array.isArray(session.latestState.scripts) ? session.latestState.scripts : [];
    if (!tree || scripts.length === 0) {
      return;
    }

    files.downloadJson('script-sources-tree.json', { tree, scripts });
    display.setStatusText(`Wyeksportowano rekordy skryptów: ${scripts.length}.`);
  }

  function exportScriptsCsv() {
    const scripts = session.latestState && Array.isArray(session.latestState.scripts) ? session.latestState.scripts : [];
    if (scripts.length === 0) {
      return;
    }

    /** @type {(keyof import('../../../types/scanning.js').ScriptRecord)[]} */
    const headers = [
      'classification',
      'hostname',
      'registrableDomain',
      'type',
      'filename',
      'url',
      'sourceMapURL',
      'origin',
      'protocol',
      'pathname',
      'query',
      'scriptId',
      'executionContextId',
      'startLine',
      'endLine',
      'isModule',
      'hash',
      'embedderName',
      'blockedByClient',
      'errorText',
      'blockedReason',
      'requestId',
      'networkResourceType'
    ];

    const rows = scripts.map((script) => headers.map((header) => script[header]));
    files.downloadCsv('script-sources-tree.csv', headers, rows);
    display.setStatusText(`Wyeksportowano wiersze skryptów CSV: ${scripts.length}.`);
  }

  return { copyImageLinks, exportImagesJson, copyThirdPartyList, exportScriptsJson, exportScriptsCsv };
}
