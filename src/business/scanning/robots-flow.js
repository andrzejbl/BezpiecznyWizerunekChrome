/** @typedef {import('../../../types/scanning.js').ScanState} ScanState */

/** @typedef {import('../../../types/scanning.js').ResourcePorts} ResourcePorts */
/** @typedef {import('../../../types/scanning.js').Clock} Clock */

/**
 * @typedef {object} RobotsPorts
 * @property {ResourcePorts['loadWithoutCredentials']} loadWithoutCredentials
 * @property {ResourcePorts['readResourceText']} readResourceText
 * @property {Clock} clock
 */

// Sprawdź raz każde zaobserwowane źródło zasobów: zapisz zadanie, pobierz robots.txt, oceń odpowiedź, odczytaj reguły.
// Tu zapadają decyzje dotyczące HTTP; pobieranie odpowiedzi i odczyt strumienia zapewniają porty.

import { parseUrl } from './urls.js';
import { getRobotsUrlForOrigin, isRobotsCheckableUrl, parseRobotsTxt } from './robots-rules.js';

/**
 * @param {RobotsPorts} ports
 */
export function createRobotsFlow({
  loadWithoutCredentials,
  readResourceText,
  clock
}) {
  // Pobierz robots.txt raz dla każdej wartości origin i zachowaj kontrole trwające oraz zakończone.

  /**
   * @param {ScanState} state
   * @param {string} origin
   */
  async function checkRobotsForOrigin(state, origin) {
    const robotsUrl = getRobotsUrlForOrigin(origin);

    if (!state.attached || !state.mainFrameId) {
      throw new Error('Debugger is not attached to a loaded frame.');
    }

    const resource = await loadWithoutCredentials(state.tabId, state.mainFrameId, robotsUrl);
    const httpStatusCode = resource.status;
    const baseResult = {
      origin,
      robotsUrl,
      httpStatusCode,
      headers: resource.headers,
      checkedAt: clock.nowIso()
    };

    if (httpStatusCode !== null && httpStatusCode >= 400 && httpStatusCode < 500 && httpStatusCode !== 429) {
      state.robotsChecksByOrigin.set(origin, {
        ...baseResult,
        status: 'not-found',
        message: `robots.txt returned HTTP ${httpStatusCode}; Google treats this as no effective robots.txt restriction.`,
        groups: []
      });
      return;
    }

    if (!resource.succeeded) {
      state.robotsChecksByOrigin.set(origin, {
        ...baseResult,
        status: 'error',
        message: resource.error || 'Could not load robots.txt.',
        groups: []
      });
      return;
    }

    if (httpStatusCode !== null && (httpStatusCode < 200 || httpStatusCode >= 300)) {
      state.robotsChecksByOrigin.set(origin, {
        ...baseResult,
        status: 'error',
        message: `robots.txt returned HTTP ${httpStatusCode}.`,
        groups: []
      });
      return;
    }

    const bodyRead = readResourceText(state.tabId, resource.body);
    // Odczyt treści zwróconej bezpośrednio pozostaje synchroniczny; odczyt strumienia zachowuje dotychczasowe await.
    const body = typeof bodyRead === 'string' ? bodyRead : await bodyRead;

    state.robotsChecksByOrigin.set(origin, {
      ...baseResult,
      status: 'loaded',
      message: '',
      groups: parseRobotsTxt(body),
      contentLength: body.length
    });
  }

  /**
   * @param {ScanState} state
   * @param {string} origin
   */
  function scheduleRobotsCheckForOrigin(state, origin) {
    if (!state || !state.attached || !state.mainFrameId || !origin) {
      return;
    }

    if (state.robotsChecksByOrigin.has(origin) || state.robotsChecksInFlight.has(origin)) {
      return;
    }

    state.robotsChecksByOrigin.set(origin, {
      origin,
      robotsUrl: getRobotsUrlForOrigin(origin),
      status: 'checking',
      message: 'Checking robots.txt...',
      checkedAt: ''
    });
    state.robotsChecksInFlight.add(origin);

    checkRobotsForOrigin(state, origin)
      .catch(/** @param {unknown} error */ (error) => {
        state.robotsChecksByOrigin.set(origin, {
          origin,
          robotsUrl: getRobotsUrlForOrigin(origin),
          status: 'error',
          message: /** @type {Error} */ (error).message,
          checkedAt: clock.nowIso(),
          groups: []
        });
      })
      .finally(() => {
        state.robotsChecksInFlight.delete(origin);
      });
  }

  /**
   * @param {ScanState} state
   * @param {string} url
   */
  function scheduleRobotsCheckForImage(state, url) {
    if (!state || !isRobotsCheckableUrl(url)) {
      return;
    }

    const parsed = parseUrl(url);
    scheduleRobotsCheckForOrigin(state, parsed.origin);
  }

  /**
   * @param {ScanState} state
   */
  function scheduleRobotsChecks(state) {
    if (!state || !state.attached || !state.mainFrameId) {
      return;
    }

    state.images.forEach((image) => scheduleRobotsCheckForImage(state, image.url));
  }

  return { scheduleRobotsCheckForImage, scheduleRobotsChecks };
}
