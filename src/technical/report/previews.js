// Tworzenie lokalnych podglądów JPEG osadzanych w raporcie PDF.

/**
 * Tworzy lokalny JPEG do PDF; brak podglądu nie blokuje dowodów.
 * @param {import("../../../types/popup.js").VisibleImage} image
 * @returns {Promise<import("../../../types/pdf.js").PdfPreview | null>}
 */
export function createReportPreviewJpeg(image) {
  const source = image && image.previewDataUrl ? image.previewDataUrl : '';
  if (!source) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const probe = new Image();
    probe.decoding = 'async';

    probe.addEventListener(
      'load',
      () => {
        const sourceWidth = probe.naturalWidth || 0;
        const sourceHeight = probe.naturalHeight || 0;
        if (!sourceWidth || !sourceHeight) {
          resolve(null);
          return;
        }

        const maxWidth = 720;
        const maxHeight = 480;
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          resolve(null);
          return;
        }

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(probe, 0, 0, width, height);

        try {
          resolve({
            dataUrl: canvas.toDataURL('image/jpeg', 0.82),
            width,
            height
          });
        } catch (error) {
          resolve(null);
        }
      },
      { once: true }
    );

    probe.addEventListener('error', () => resolve(null), { once: true });
    probe.src = source;
  });
}

