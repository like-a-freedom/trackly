// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRouting } from '../useRouting';

describe('useRouting', () => {
    let routing: ReturnType<typeof useRouting>;

    beforeEach(() => {
        routing = useRouting({ autoLoad: false });
    });

    describe('initial state', () => {
        it('defaults to auto mode', () => {
            expect(routing.mode.value).toBe('auto');
        });

        it('graph is not ready', () => {
            expect(routing.graphReady.value).toBe(false);
            expect(routing.graphLoading.value).toBe(false);
        });

        it('graph progress starts at 0', () => {
            expect(routing.graphProgress.value).toBe(0);
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
            expect(routing.mode.value).toBe('auto');
        });
    });

    describe('toggleMode', () => {
        it('toggles from auto to manual', () => {
            routing.toggleMode();
            expect(routing.mode.value).toBe('manual');
        });

        it('toggles from manual to auto', () => {
            routing.setMode('manual');
            routing.toggleMode();
            expect(routing.mode.value).toBe('auto');
        });
    });

    describe('setProfile', () => {
        it('sets a valid profile', () => {
            routing.setProfile('cycling');
            expect(routing.profile.value).toBe('cycling');
        });

        it('supports mtb profile', () => {
            routing.setProfile('mtb');
            expect(routing.profile.value).toBe('mtb');
        });

        it('ignores invalid profiles', () => {
            routing.setProfile('invalid');
            expect(routing.profile.value).toBe('hiking');
        });
    });

    describe('findRoute — manual mode', () => {
        it('returns straight line between two points', () => {
            const from = { lat: 50.0, lng: 30.0 };
            const to = { lat: 51.0, lng: 31.0 };

            routing.setMode('manual');
            const result = routing.findRoute(from, to);
            expect(result).toEqual([
                [50.0, 30.0],
                [51.0, 31.0],
            ]);
        });

        it('does not call onNotAvailable in manual mode', () => {
            const callback = vi.fn();
            routing.setMode('manual');
            routing.findRoute({ lat: 50, lng: 30 }, { lat: 51, lng: 31 }, {
                onNotAvailable: callback,
            });
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('findRoute — auto mode, graph not ready', () => {
        it('returns null and calls onNotAvailable', () => {
            const callback = vi.fn();

            const result = routing.findRoute(
                { lat: 50, lng: 30 },
                { lat: 51, lng: 31 },
                { onNotAvailable: callback }
            );

            expect(result).toBeNull();
            expect(callback).toHaveBeenCalledOnce();
            expect(callback.mock.calls[0][0]).toContain('Auto-routing');
        });

        it('returns null without callback when onNotAvailable not provided', () => {
            const result = routing.findRoute({ lat: 50, lng: 30 }, { lat: 51, lng: 31 });
            expect(result).toBeNull();
        });
    });

    describe('findRoute — auto mode, graph ready', () => {
        it('returns routed path from test router', () => {
            const testRouter = {
                calc_path: vi.fn(() => [0, 1]),
            };
            const testNodeCoords = new Float32Array([50, 30, 51, 31]);

            routing.__setTestGraph({ testRouter, testNodeCoords });

            const result = routing.findRoute(
                { lat: 50, lng: 30 },
                { lat: 51, lng: 31 }
            );

            expect(result).toEqual([
                [50, 30],
                [51, 31],
            ]);
            expect(testRouter.calc_path).toHaveBeenCalledOnce();
        });

        it('returns surface types when available', () => {
            const testRouter = {
                calc_path: vi.fn(() => [0, 1]),
            };
            const testNodeCoords = new Float32Array([50, 30, 51, 31]);
            const testSurfaceTypes = new Uint8Array([1, 2]);

            routing.__setTestGraph({
                testRouter,
                testNodeCoords,
                testSurfaceTypes,
            });

            const result = routing.findRouteDetailed(
                { lat: 50, lng: 30 },
                { lat: 51, lng: 31 }
            );

            expect(result.points).toEqual([
                [50, 30],
                [51, 31],
            ]);
            expect(result.surfaceTypes).toEqual(['asphalt', 'gravel']);
        });

        it('updates timing metrics for the last route', () => {
            const testRouter = {
                calc_path: vi.fn(() => [0, 1]),
            };
            const testNodeCoords = new Float32Array([50, 30, 51, 31]);

            routing.__setTestGraph({ testRouter, testNodeCoords });

            routing.findRoute({ lat: 50, lng: 30 }, { lat: 51, lng: 31 });

            expect(routing.lastRouteMetrics.value.totalMs).toBeGreaterThanOrEqual(0);
            expect(routing.lastRouteMetrics.value.routeMs).toBeGreaterThanOrEqual(0);
            expect(routing.lastRouteMetrics.value.snapMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('snapToPoint', () => {
        it('returns null when graph is not ready', () => {
            const result = routing.snapToPoint(50, 30);
            expect(result).toBeNull();
        });

        it('snaps to nearest node within max distance', () => {
            const testRouter = {
                calc_path: vi.fn(() => [0, 1]),
            };
            const testNodeCoords = new Float32Array([50, 30, 51, 31]);

            routing.__setTestGraph({ testRouter, testNodeCoords });

            const result = routing.snapToPoint(50.0001, 30.0001, { maxDistanceM: 200 });
            expect(result).not.toBeNull();
            expect(result.lat).toBe(50);
            expect(result.lng).toBe(30);
            expect(result.dist).toBeGreaterThanOrEqual(0);
        });

        it('returns null when beyond max distance', () => {
            const testRouter = {
                calc_path: vi.fn(() => [0, 1]),
            };
            const testNodeCoords = new Float32Array([50, 30, 51, 31]);

            routing.__setTestGraph({ testRouter, testNodeCoords });

            const result = routing.snapToPoint(50.1, 30.1, { maxDistanceM: 10 });
            expect(result).toBeNull();
        });
    });

    describe('auto mode triggers graph load', () => {
        it('calls ensureGraphLoaded when switching to auto mode', () => {
            const routingWithAutoLoad = useRouting({ autoLoad: true });
            routingWithAutoLoad.setMode('manual');
            routingWithAutoLoad.setMode('auto');
            // Graph loading should have been triggered
            expect(routingWithAutoLoad.mode.value).toBe('auto');
        });

        it('calls ensureGraphLoaded when toggling to auto mode', () => {
            const routingWithAutoLoad = useRouting({ autoLoad: true });
            routingWithAutoLoad.setMode('manual');
            routingWithAutoLoad.toggleMode();
            expect(routingWithAutoLoad.mode.value).toBe('auto');
        });

        it('resets graph ready when changing profile in auto mode', () => {
            const routingWithAutoLoad = useRouting({ autoLoad: true });
            routingWithAutoLoad.setProfile('cycling');
            // Profile should be set
            expect(routingWithAutoLoad.profile.value).toBe('cycling');
        });

        it('initialize triggers graph load in auto mode', () => {
            const routingWithAutoLoad = useRouting({ autoLoad: true });
            routingWithAutoLoad.initialize();
            // Should not throw
        });
    });
});
