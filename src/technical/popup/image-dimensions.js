// Pomiar przez Image i grupowanie powiadomień w jednym obrocie kolejki zdarzeń.
import { MIN_IMAGE_LONG_SIDE, getImageDisplaySource, getImageDimensionKey } from '../../business/popup/image-rules.js';

/** @param {{onDimensionsChanged: () => void}} callbacks @returns {import('../../../types/popup.js').ImageDimensionsPort} */
export function createImageDimensions({ onDimensionsChanged }) {
  /** @type {Map<string, import('../../../types/popup.js').ImageDimensions>} */
  const dimensionCache = new Map();
  let dimensionRenderQueued = false;

  function scheduleDimensionRender() {
    if (dimensionRenderQueued) {
      return;
    }

    dimensionRenderQueued = true;
    setTimeout(() => {
      dimensionRenderQueued = false;

      onDimensionsChanged();
    }, 0);
  }

  /**
   * Odczytuje istniejący pomiar albo rozpoczyna ładowanie obrazu i zwraca rekord pending.
   * Brak podglądu i URL daje od razu rekord failed.
   * Kolejne odczyty zwracają ten sam rekord; load/error uzupełnia go i zleca renderowanie.
   * Sam odczyt bez rozpoczęcia pomiaru zapewnia getKnownRecord. Przebieg: docs/flows/README.md.
   * @param {import('../../../types/scanning.js').ImageFinding} image
   * @returns {import('../../../types/popup.js').ImageDimensions}
   */
  function getDimensionRecord(image) {
    const key = getImageDimensionKey(image);
    const cached = dimensionCache.get(key);
    if (cached) {
      return cached;
    }

    /** @type {import('../../../types/popup.js').ImageDimensions} */
    const record = {
      state: 'pending',
      width: null,
      height: null,
      longSide: null,
      passes: false,
      probe: null
    };

    const source = getImageDisplaySource(image);
    if (!source) {
      record.state = 'failed';
      dimensionCache.set(key, record);
      return record;
    }

    const probe = new Image();
    record.probe = probe;
    probe.decoding = 'async';
    probe.referrerPolicy = 'no-referrer';

    probe.addEventListener('load', () => {
      record.width = probe.naturalWidth || 0;
      record.height = probe.naturalHeight || 0;
      record.longSide = Math.max(record.width, record.height);
      record.passes = record.longSide >= MIN_IMAGE_LONG_SIDE;
      record.state = 'loaded';
      record.probe = null;
      scheduleDimensionRender();
    }, { once: true });

    probe.addEventListener('error', () => {
      record.state = 'failed';
      record.passes = false;
      record.probe = null;
      scheduleDimensionRender();
    }, { once: true });

    probe.src = source;
    dimensionCache.set(key, record);

    return record;
  }

  /** @param {import('../../../types/scanning.js').ImageFinding[]} images */
  function pruneDimensionCache(images) {
    const currentKeys = new Set(images.map(getImageDimensionKey));

    for (const key of dimensionCache.keys()) {
      if (!currentKeys.has(key)) {
        dimensionCache.delete(key);
      }
    }
  }

  return {
    getRecord: getDimensionRecord,
    getKnownRecord: (image) => dimensionCache.get(getImageDimensionKey(image)),
    prune: pruneDimensionCache
  };
}
