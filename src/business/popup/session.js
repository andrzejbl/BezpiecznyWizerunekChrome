// Dane jednego otwarcia okna rozszerzenia; szczegóły buforowania DOM należą do warstwy technicznej.
/** @returns {import('../../../types/popup.js').PopupSession} */
export function createPopupSession() {
  return {
    latestState: null,
    visibleImages: [],
    activeView: 'images',
    busy: false,
    pendingAction: ''
  };
}
