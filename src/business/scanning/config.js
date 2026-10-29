// Zasady skanowania: rozpoznawanie zasobów, limity kontroli i częstotliwość obserwacji.

export const IMAGE_EXTENSION_RE = /\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)$/i;
export const PASSWORD_INPUT_POLL_INTERVAL_MS = 1000;
export const ROBOTS_READ_LIMIT_BYTES = 262144;
export const IMAGE_BODY_COMPARE_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_BODY_COMPARE_CONCURRENCY = 2;
export const GOOGLE_IMAGE_USER_AGENTS = ['googlebot-image', 'googlebot', '*'];
