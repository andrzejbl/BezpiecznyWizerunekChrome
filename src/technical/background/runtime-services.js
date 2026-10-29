/** @typedef {import('../../../types/scanning.js').Clock} Clock */
/** @typedef {import('../../../types/scanning.js').Scheduler} Scheduler */

// Usługi środowiska są przekazywane do scenariuszy biznesowych; sam import nie uruchamia licznika czasu.
/** @type {Clock} */
export const clock = { nowIso: () => new Date().toISOString() };
/** @type {Scheduler} */
export const scheduler = {
  repeat: (callback, intervalMs) => setInterval(callback, intervalMs),
  cancel: (timerId) => clearInterval(timerId)
};
