// Sygnatury są szczegółem renderowania, niezależnym od danych sesji i reguł biznesowych.
export function createRenderCache() {
  /** @type {import('../../../types/popup.js').RenderCache} */
  const cache = {
    imageRenderSignature: '',
    scriptRenderSignature: '',
    passwordRenderSignature: ''
  };

  function resetRenderSignatures() {
    cache.imageRenderSignature = '';
    cache.scriptRenderSignature = '';
    cache.passwordRenderSignature = '';
  }

  function resetImageRenderSignature() {
    cache.imageRenderSignature = '';
  }

  return { cache, resetRenderSignatures, resetImageRenderSignature };
}
