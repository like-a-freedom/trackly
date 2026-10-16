// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useElevationPolling } from '../useElevationPolling';

describe('useElevationPolling', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ geom_geojson: { coordinates: [[]] } }),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('marks polling requests as background so they are not counted as track views', async () => {
        const { startPolling } = useElevationPolling();

        startPolling('track-1', 1000, () => {});
        await vi.advanceTimersByTimeAsync(1000);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/tracks/track-1?background=1'),
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('does not request the track when no track id is set', async () => {
        const { startPolling, stopPolling } = useElevationPolling();

        startPolling('track-1', 1000, () => {});
        stopPolling();
        await vi.advanceTimersByTimeAsync(1000);

        expect(global.fetch).not.toHaveBeenCalled();
    });
});
