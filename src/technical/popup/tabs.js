// Wyłącznie klasy CSS i atrybuty dostępności istniejących zakładek.
/** @param {{elements: import('../../../types/popup.js').PopupElements}} dependencies */
export function createTabsView({ elements }) {
  /** @param {import('../../../types/popup.js').PopupView} view */
  function showActiveView(view) {
    const imagesActive = view === 'images';
    const scriptsActive = view === 'scripts';
    const passwordActive = view === 'password';

    elements.imagesTab.classList.toggle('active', imagesActive);
    elements.scriptsTab.classList.toggle('active', scriptsActive);
    elements.passwordTab.classList.toggle('active', passwordActive);
    elements.imagesTab.setAttribute('aria-pressed', String(imagesActive));
    elements.scriptsTab.setAttribute('aria-pressed', String(scriptsActive));
    elements.passwordTab.setAttribute('aria-pressed', String(passwordActive));
    elements.imagesView.classList.toggle('active', imagesActive);
    elements.scriptsView.classList.toggle('active', scriptsActive);
    elements.passwordView.classList.toggle('active', passwordActive);
  }

  return { showActiveView };
}
