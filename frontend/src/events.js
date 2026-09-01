/**
 * Minimal typed event bus for cross-component communication.
 * Replaces window.dispatchEvent / addEventListener for custom events.
 *
 * @typedef {{ id: string }} TrackDeleted
 * @typedef {{ id: string, name: string }} TrackNameUpdated
 * @typedef {{}} StopElevationPolling
 * @typedef {{ state: object }} MapUrlStateChanged
 */

/** @type {Map<string, Set<Function>>} */
const _subs = new Map();

export const events = {
    /**
     * Subscribe to an event.
     * @param {string} name
     * @param {Function} fn
     */
    on(name, fn) {
        if (!_subs.has(name)) _subs.set(name, new Set());
        _subs.get(name).add(fn);
    },

    /**
     * Unsubscribe from an event.
     * @param {string} name
     * @param {Function} fn
     */
    off(name, fn) {
        _subs.get(name)?.delete(fn);
    },

    /**
     * Emit an event to all subscribers.
     * @param {string} name
     * @param {*} payload
     */
    emit(name, payload) {
        _subs.get(name)?.forEach((fn) => fn(payload));
    },

    /**
     * Remove all subscribers (for testing).
     */
    clear() {
        _subs.clear();
    }
};
