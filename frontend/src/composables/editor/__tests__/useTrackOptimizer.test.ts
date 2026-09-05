import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useTrackOptimizer } from '../useTrackOptimizer';
import type { LatLngTuple, Segment } from '@/types';

interface OptimizerStore {
    segments: Segment[];
    activeSegmentIndex: number;
    optimizerTargetRatio: number;
    optimizerPreview: {
        geometry: GeoJSON.Geometry;
        segments: LatLngTuple[][];
        waypoints: number[][];
    } | null;
    optimizerStats: {
        originalPoints: number;
        simplifiedPoints: number;
        compressionRatio: number;
        toleranceUsed: number;
    } | null;
    optimizerError: string | null;
    optimizerLoading: boolean;
    trackName: string;
    coordinateData: LatLngTuple[];
}

function createTestStore(overrides: Partial<OptimizerStore> = {}): OptimizerStore {
    return {
        segments: [],
        activeSegmentIndex: 0,
        optimizerTargetRatio: 0.1,
        optimizerPreview: null,
        optimizerStats: null,
        optimizerError: null,
        optimizerLoading: false,
        trackName: 'Test Track',
        coordinateData: [],
        ...overrides,
    };
}

describe('useTrackOptimizer', () => {
    let optimizer: ReturnType<typeof useTrackOptimizer>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        optimizer = useTrackOptimizer();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('setOptimizerTargetRatio', () => {
        it('clamps ratio to minimum bound', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.1 });
            optimizer.setOptimizerTargetRatio(store, 0.001);
            expect(store.optimizerTargetRatio).toBe(0.01);
        });

        it('clamps ratio to maximum bound', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.1 });
            optimizer.setOptimizerTargetRatio(store, 2.0);
            expect(store.optimizerTargetRatio).toBe(1.0);
        });

        it('accepts valid ratio', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.1 });
            optimizer.setOptimizerTargetRatio(store, 0.5);
            expect(store.optimizerTargetRatio).toBe(0.5);
        });

        it('ignores non-finite values', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.1 });
            optimizer.setOptimizerTargetRatio(store, NaN);
            expect(store.optimizerTargetRatio).toBe(0.1);
        });

        it('ignores Infinity', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.1 });
            optimizer.setOptimizerTargetRatio(store, Infinity);
            expect(store.optimizerTargetRatio).toBe(0.1);
        });
    });

    describe('previewOptimization', () => {
        it('returns false and sets error for empty track', async () => {
            const store = createTestStore();
            const result = await optimizer.previewOptimization(store, 0.5);
            expect(result).toBe(false);
            expect(store.optimizerError).toBe('Track needs at least 2 points to optimize.');
        });

        it('returns false when fetch is unavailable', async () => {
            const originalFetch = globalThis.fetch;
            // @ts-expect-error - intentionally removing fetch
            globalThis.fetch = undefined;

            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });
            const result = await optimizer.previewOptimization(store, 0.5);
            expect(result).toBe(false);

            globalThis.fetch = originalFetch;
        });

        it('stores preview data from backend', async () => {
            const previewResponse = {
                geometry: {
                    type: 'MultiLineString',
                    coordinates: [[[30.0, 50.0], [31.0, 51.0]]],
                },
                waypoints: [[0, 1]],
                original_points: 10,
                simplified_points: 5,
                compression_ratio: 0.5,
                tolerance_used: 0.001,
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(previewResponse),
            });

            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await optimizer.previewOptimization(store, 0.5);
            expect(result).toBe(true);
            expect(store.optimizerPreview).not.toBeNull();
            expect(store.optimizerStats).not.toBeNull();
            expect(store.optimizerStats!.originalPoints).toBe(10);
            expect(store.optimizerStats!.simplifiedPoints).toBe(5);
            expect(store.optimizerLoading).toBe(false);
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
            });

            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await optimizer.previewOptimization(store, 0.5);
            expect(result).toBe(false);
            expect(store.optimizerError).toBe('Unable to build optimization preview.');
        });

        it('handles network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await optimizer.previewOptimization(store, 0.5);
            expect(result).toBe(false);
            expect(store.optimizerError).toBe('Unable to build optimization preview.');
        });

        it('uses default ratio when not provided', async () => {
            const previewResponse = {
                geometry: { type: 'LineString', coordinates: [[30.0, 50.0], [31.0, 51.0]] },
                waypoints: [[0, 1]],
                original_points: 2,
                simplified_points: 2,
                compression_ratio: 1,
                tolerance_used: 0,
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(previewResponse),
            });

            const store = createTestStore({
                optimizerTargetRatio: 0.3,
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            await optimizer.previewOptimization(store);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/tracks/simplify-preview'),
                expect.objectContaining({
                    body: expect.stringContaining('"target_ratio":0.3'),
                }),
            );
        });
    });

    describe('applyOptimizationPreview', () => {
        it('returns false when no preview available', () => {
            const store = createTestStore();
            const result = optimizer.applyOptimizationPreview(store);
            expect(result).toBe(false);
        });

        it('applies preview to segments', () => {
            const store = createTestStore({
                optimizerPreview: {
                    geometry: { type: 'LineString', coordinates: [[30, 50], [31, 51]] },
                    segments: [[[50, 30], [51, 31]] as LatLngTuple[]],
                    waypoints: [[0, 1]],
                },
            });

            const result = optimizer.applyOptimizationPreview(store);
            expect(result).toBe(true);
            expect(store.segments).toHaveLength(1);
            expect(store.segments[0].points).toEqual([[50, 30], [51, 31]]);
            expect(store.optimizerPreview).toBeNull();
        });

        it('preserves segment name and color', () => {
            const store = createTestStore({
                segments: [{
                    points: [] as LatLngTuple[],
                    waypoints: [],
                    surfaceTypes: [],
                    name: 'Original',
                    color: '#FF0000',
                }],
                optimizerPreview: {
                    geometry: { type: 'LineString', coordinates: [[30, 50], [31, 51]] },
                    segments: [[[50, 30], [51, 31]] as LatLngTuple[]],
                    waypoints: [[0, 1]],
                },
            });

            optimizer.applyOptimizationPreview(store);
            expect(store.segments[0].name).toBe('Original');
            expect(store.segments[0].color).toBe('#FF0000');
        });

        it('handles single-point preview segments', () => {
            const store = createTestStore({
                optimizerPreview: {
                    geometry: { type: 'LineString', coordinates: [[30, 50]] },
                    segments: [[[50, 30]] as LatLngTuple[]],
                    waypoints: [[0]],
                },
            });

            const result = optimizer.applyOptimizationPreview(store);
            expect(result).toBe(true);
            expect(store.segments).toHaveLength(1);
            expect(store.segments[0].points).toHaveLength(1);
        });
    });

    describe('clearOptimizationPreview', () => {
        it('clears preview and stats', () => {
            const store = createTestStore({
                optimizerPreview: {
                    geometry: { type: 'LineString', coordinates: [[30, 50]] },
                    segments: [],
                    waypoints: [],
                },
                optimizerStats: {
                    originalPoints: 10,
                    simplifiedPoints: 5,
                    compressionRatio: 0.5,
                    toleranceUsed: 0.001,
                },
                optimizerError: 'Some error',
            });

            optimizer.clearOptimizationPreview(store);
            expect(store.optimizerPreview).toBeNull();
            expect(store.optimizerStats).toBeNull();
            expect(store.optimizerError).toBeNull();
        });

        it('keeps ratio when keepRatio is true', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.5 });
            optimizer.clearOptimizationPreview(store, { keepRatio: true });
            expect(store.optimizerTargetRatio).toBe(0.5);
        });

        it('resets ratio when keepRatio is false', () => {
            const store = createTestStore({ optimizerTargetRatio: 0.5 });
            optimizer.clearOptimizationPreview(store, { keepRatio: false });
            expect(store.optimizerTargetRatio).toBe(0.1);
        });

        it('keeps error when silent is true', () => {
            const store = createTestStore({ optimizerError: 'Some error' });
            optimizer.clearOptimizationPreview(store, { silent: true });
            expect(store.optimizerError).toBe('Some error');
        });
    });

    describe('downloadOptimizationPreview', () => {
        it('returns false when no preview available', () => {
            const store = createTestStore();
            const result = optimizer.downloadOptimizationPreview(store);
            expect(result).toBe(false);
        });

        it('returns true when preview is available', () => {
            const createObjectURL = vi.fn(() => 'blob:url');
            const revokeObjectURL = vi.fn();
            const originalURL = globalThis.URL;
            const originalBlob = globalThis.Blob;
            globalThis.URL = { createObjectURL, revokeObjectURL } as any;
            globalThis.Blob = class { constructor() {} } as any;

            const clickSpy = vi.fn();
            const appendSpy = vi.fn();
            const removeSpy = vi.fn();

            vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy as any);

            const store = createTestStore({
                optimizerPreview: {
                    geometry: { type: 'LineString', coordinates: [[30, 50]] },
                    segments: [],
                    waypoints: [],
                },
                trackName: 'My Track',
            });

            const result = optimizer.downloadOptimizationPreview(store);
            expect(result).toBe(true);
            expect(createObjectURL).toHaveBeenCalled();
            expect(clickSpy).toHaveBeenCalled();
            expect(revokeObjectURL).toHaveBeenCalled();

            globalThis.URL = originalURL;
            globalThis.Blob = originalBlob;
            vi.restoreAllMocks();
        });
    });

    describe('scheduleOptimizationPreview', () => {
        it('schedules preview with debounce', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    geometry: { type: 'LineString', coordinates: [[30, 50], [31, 51]] },
                    waypoints: [[0, 1]],
                    original_points: 2,
                    simplified_points: 2,
                    compression_ratio: 1,
                    tolerance_used: 0,
                }),
            });

            optimizer.scheduleOptimizationPreview(store, 0.5);
            expect(mockFetch).not.toHaveBeenCalled();

            vi.advanceTimersByTime(500);
            expect(mockFetch).toHaveBeenCalled();
        });
    });
});
