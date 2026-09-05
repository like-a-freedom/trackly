/**
 * Minimal typed event bus for cross-component communication.
 * Replaces window.dispatchEvent / addEventListener for custom events.
 */

const _subs = new Map<string, Set<(payload: unknown) => void>>();

export const events = {
    /**
     * Subscribe to an event.
     */
    on(name: string, fn: (payload: unknown) => void): void {
        if (!_subs.has(name)) _subs.set(name, new Set());
        _subs.get(name)!.add(fn);
    },

    /**
     * Unsubscribe from an event.
     */
    off(name: string, fn: (payload: unknown) => void): void {
        _subs.get(name)?.delete(fn);
    },

    /**
     * Emit an event to all subscribers.
     */
    emit(name: string, payload: unknown): void {
        _subs.get(name)?.forEach((fn) => fn(payload));
    },

    /**
     * Remove all subscribers (for testing).
     */
    clear(): void {
        _subs.clear();
    }
};
