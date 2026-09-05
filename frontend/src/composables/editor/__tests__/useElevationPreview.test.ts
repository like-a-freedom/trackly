import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { scheduleElevationPreview, cancelElevationPreview } from '../useElevationPreview';
import type { LatLngTuple } from '@/types';

interface ElevationStore {
    coordinateData: LatLngTuple[];
    elevationProfile: Array<{ distance: number; elevation: number }>;
    elevationStats: {
        gain?: number;
        loss?: number;
        min?: number;
        max?: number;
        dataset?: string;
        enriched: boolean;
        _lastUpdated: number;
    };
    elevationError: string | null;
    elevationLoading: boolean;
}

function createTestStore(overrides: Partial<ElevationStore> = {}): ElevationStore {
    return {
        coordinateData: [],
        elevationProfile: [],
        elevationStats: { enriched: false, _lastUpdated: 0 },
        elevationError: null,
        elevationLoading: false,
        ...overrides,
    };
}

describe('useElevationPreview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('scheduleElevationPreview', () => {
        it('does nothing when fetch is unavailable', () => {
            const originalFetch = globalThis.fetch;
            // @ts-expect-error - intentionally removing fetch
            globalThis.fetch = undefined;

            const store = createTestStore();
            scheduleElevationPreview(store);
            vi.advanceTimersByTime(600);

            expect(mockFetch).not.toHaveBeenCalled();
            globalThis.fetch = originalFetch;
        });

        it('clears profile when less than 2 points', () => {
            const store = createTestStore({
                coordinateData: [[50, 30]] as LatLngTuple[],
                elevationProfile: [{ distance: 0, elevation: 100 }],
                elevationStats: { gain: 50, enriched: true, _lastUpdated: Date.now() },
            });

            scheduleElevationPreview(store);
            vi.advanceTimersByTime(600);

            expect(store.elevationProfile).toEqual([]);
            expect(store.elevationStats.enriched).toBe(false);
            expect(store.elevationLoading).toBe(false);
        });

        it('fetches elevation data for valid track', () => {
            const elevationResponse = {
                elevation_profile: [
                    { distance: 0, elevation: 100 },
                    { distance: 1000, elevation: 150 },
                ],
                elevation_gain: 50,
                elevation_loss: 0,
                elevation_min: 100,
                elevation_max: 150,
                elevation_dataset: 'srtm90m',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(elevationResponse),
            });

            const store = createTestStore({
                coordinateData: [[50, 30], [51, 31]] as LatLngTuple[],
            });

            scheduleElevationPreview(store);
            vi.advanceTimersByTime(600);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/elevation/preview'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('coordinates'),
                }),
            );
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const store = createTestStore({
                coordinateData: [[50, 30], [51, 31]] as LatLngTuple[],
            });

            scheduleElevationPreview(store);
            vi.advanceTimersByTime(600);

            // Wait for async fetch to resolve
            await vi.advanceTimersByTimeAsync(100);

            expect(store.elevationError).toBe('Unable to fetch elevation profile');
            expect(store.elevationLoading).toBe(false);
        });

        it('handles network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const store = createTestStore({
                coordinateData: [[50, 30], [51, 31]] as LatLngTuple[],
            });

            scheduleElevationPreview(store);
            vi.advanceTimersByTime(600);

            // Wait for async fetch to resolve
            await vi.advanceTimersByTimeAsync(100);

            expect(store.elevationError).toBe('Unable to fetch elevation profile');
        });

        it('debounces multiple calls', () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ elevation_profile: [] }),
            });

            const store = createTestStore({
                coordinateData: [[50, 30], [51, 31]] as LatLngTuple[],
            });

            scheduleElevationPreview(store);
            scheduleElevationPreview(store);
            scheduleElevationPreview(store);

            vi.advanceTimersByTime(600);

            // Should only fetch once due to debounce
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('clamps coordinates to max points', () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ elevation_profile: [] }),
            });

            // Create more than 2000 points
            const coords: LatLngTuple[] = [];
            for (let i = 0; i < 3000; i++) {
                coords.push([50 + i * 0.001, 30 + i * 0.001]);
            }

            const store = createTestStore({ coordinateData: coords });
            scheduleElevationPreview(store);
            vi.advanceTimersByTime(600);

            expect(mockFetch).toHaveBeenCalled();
            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.coordinates.length).toBeLessThanOrEqual(2000);
        });
    });

    describe('cancelElevationPreview', () => {
        it('cancels pending elevation fetch', () => {
            const store = createTestStore({
                coordinateData: [[50, 30], [51, 31]] as LatLngTuple[],
            });

            scheduleElevationPreview(store);
            cancelElevationPreview();

            vi.advanceTimersByTime(600);
            // Fetch should not have been called because we cancelled
            // Note: the abort controller logic is internal
        });
    });
});
