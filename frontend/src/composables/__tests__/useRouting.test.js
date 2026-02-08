import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRouting } from '../useRouting';

describe('useRouting', () => {
    let routing;

    beforeEach(() => {
        routing = useRouting();
    });

    describe('initial state', () => {
        it('defaults to manual mode', () => {
            expect(routing.mode.value).toBe('manual');
        });

        it('graph is not ready', () => {
            expect(routing.graphReady.value).toBe(false);
            expect(routing.graphLoading.value).toBe(false);
        });
    });

    describe('setMode', () => {
        it('switches to auto mode', () => {
            routing.setMode('auto');
            expect(routing.mode.value).toBe('auto');
        });

        it('switches back to manual', () => {
            routing.setMode('auto');
            routing.setMode('manual');
            expect(routing.mode.value).toBe('manual');
        });

        it('ignores invalid mode', () => {
            routing.setMode('invalid');
            expect(routing.mode.value).toBe('manual');
        });
    });

    describe('toggleMode', () => {
        it('toggles from manual to auto', () => {
            routing.toggleMode();
            expect(routing.mode.value).toBe('auto');
        });

        it('toggles from auto to manual', () => {
            routing.setMode('auto');
            routing.toggleMode();
            expect(routing.mode.value).toBe('manual');
        });
    });

    describe('findRoute — manual mode', () => {
        it('returns straight line between two points', () => {
            const from = { lat: 50.0, lng: 30.0 };
            const to = { lat: 51.0, lng: 31.0 };

            const result = routing.findRoute(from, to);
            expect(result).toEqual([
                [50.0, 30.0],
                [51.0, 31.0],
            ]);
        });

        it('does not call onNotAvailable in manual mode', () => {
            const callback = vi.fn();
            routing.findRoute({ lat: 50, lng: 30 }, { lat: 51, lng: 31 }, {
                onNotAvailable: callback,
            });
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('findRoute — auto mode, graph not ready', () => {
        it('returns null and calls onNotAvailable', () => {
            routing.setMode('auto');
            const callback = vi.fn();

            const result = routing.findRoute(
                { lat: 50, lng: 30 },
                { lat: 51, lng: 31 },
                { onNotAvailable: callback }
            );

            expect(result).toBeNull();
            expect(callback).toHaveBeenCalledOnce();
            expect(callback.mock.calls[0][0]).toContain('unavailable');
        });

        it('returns null without callback when onNotAvailable not provided', () => {
            routing.setMode('auto');
            const result = routing.findRoute({ lat: 50, lng: 30 }, { lat: 51, lng: 31 });
            expect(result).toBeNull();
        });
    });

    describe('findRoute — auto mode, graph ready (stub)', () => {
        it('returns null and calls onNotAvailable (WASM not yet implemented)', () => {
            routing.setMode('auto');
            routing.graphReady.value = true;
            const callback = vi.fn();

            const result = routing.findRoute(
                { lat: 50, lng: 30 },
                { lat: 51, lng: 31 },
                { onNotAvailable: callback }
            );

            expect(result).toBeNull();
            expect(callback).toHaveBeenCalledOnce();
            expect(callback.mock.calls[0][0]).toContain('not yet implemented');
        });
    });
});
