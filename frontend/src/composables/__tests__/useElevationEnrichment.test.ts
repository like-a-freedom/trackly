import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ref } from 'vue';
import type { Ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useElevationEnrichment } from '../useElevationEnrichment';
import type { EnrichableTrack } from '../useElevationEnrichment';
import { events } from '../../events';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
    ok,
    status,
    json: () => Promise.resolve(body),
});

const makeTrack = (overrides: Partial<EnrichableTrack> = {}): EnrichableTrack => ({
    id: '1',
    elevation_enriched: false,
    elevation_gain: null,
    elevation_loss: null,
    elevation_min: null,
    elevation_max: null,
    elevation_dataset: null,
    elevation_enriched_at: null,
    ...overrides,
});

/** Full payload as returned by the detail endpoint after enrichment. */
const enrichedTrack = (overrides: Partial<EnrichableTrack> = {}): EnrichableTrack =>
    makeTrack({
        elevation_enriched: true,
        elevation_gain: 650,
        elevation_loss: -600,
        elevation_min: 90,
        elevation_max: 740,
        elevation_dataset: 'aster30m',
        elevation_enriched_at: '2024-01-01T13:00:00Z',
        elevation_profile: [{ distance: 0, elevation: 90 }],
        ...overrides,
    });

/** Shapes of the collaborator callbacks the composable is given. */
type ConfirmFn = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}) => Promise<boolean>;
type ToastFn = (message: string, type: string) => void;

describe('useElevationEnrichment', () => {
    let track: Ref<EnrichableTrack | null>;
    let chartUpdateKey: Ref<number>;
    let hasElevationData: Mock<() => boolean>;
    let showConfirm: Mock<ConfirmFn>;
    let showToast: Mock<ToastFn>;
    let enrichment: ReturnType<typeof useElevationEnrichment>;
    let emitted: unknown[];

    const collectEvents = () => {
        emitted = [];
        events.on('track-elevation-updated', (payload) => emitted.push(payload));
    };

    beforeEach(() => {
        // http() resolves its token through useAuthStore(), which needs an active Pinia.
        setActivePinia(createPinia());
        events.clear();
        mockFetch.mockReset();

        track = ref<EnrichableTrack | null>(makeTrack());
        chartUpdateKey = ref(0);
        hasElevationData = vi.fn<() => boolean>().mockReturnValue(false);
        showConfirm = vi.fn<ConfirmFn>().mockResolvedValue(true);
        showToast = vi.fn<ToastFn>();

        enrichment = useElevationEnrichment({
            track,
            chartUpdateKey,
            hasElevationData,
            sessionId: () => 'test-session',
            showConfirm,
            showToast,
        });

        collectEvents();
    });

    afterEach(() => {
        enrichment.stopElevationPolling();
        vi.useRealTimers();
    });

    describe('forceEnrichElevation', () => {
        it('does nothing when there is no track', async () => {
            track.value = null;

            await enrichment.forceEnrichElevation();

            expect(mockFetch).not.toHaveBeenCalled();
            expect(showToast).not.toHaveBeenCalled();
        });

        it('does nothing while an enrichment is already running', async () => {
            enrichment.enrichingElevation.value = true;

            await enrichment.forceEnrichElevation();

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('skips the confirmation dialog when the track has no elevation data yet', async () => {
            hasElevationData.mockReturnValue(false);
            mockFetch
                .mockResolvedValueOnce(jsonResponse({ elevation_gain: 650 }))
                .mockResolvedValueOnce(jsonResponse(enrichedTrack()));

            await enrichment.forceEnrichElevation();

            expect(showConfirm).not.toHaveBeenCalled();
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('aborts when the user declines the confirmation dialog', async () => {
            hasElevationData.mockReturnValue(true);
            showConfirm.mockResolvedValue(false);

            await enrichment.forceEnrichElevation();

            expect(showConfirm).toHaveBeenCalledTimes(1);
            expect(mockFetch).not.toHaveBeenCalled();
            expect(enrichment.enrichingElevation.value).toBe(false);
        });

        it('posts the session id and the force flag to the enrich endpoint', async () => {
            hasElevationData.mockReturnValue(true);
            mockFetch
                .mockResolvedValueOnce(jsonResponse({ elevation_gain: 650 }))
                .mockResolvedValueOnce(jsonResponse(enrichedTrack()));

            await enrichment.forceEnrichElevation();

            expect(mockFetch).toHaveBeenNthCalledWith(
                1,
                '/api/tracks/1/enrich-elevation',
                expect.objectContaining({ method: 'POST' })
            );
            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body).toEqual({ session_id: 'test-session', force: true });
        });

        it('merges the refreshed track, notifies listeners and reports success', async () => {
            mockFetch
                .mockResolvedValueOnce(jsonResponse({ elevation_gain: 650, elevation_loss: -600 }))
                .mockResolvedValueOnce(jsonResponse(enrichedTrack()));

            await enrichment.forceEnrichElevation();

            // The refresh must be flagged as background work, not a new track view.
            expect(mockFetch).toHaveBeenNthCalledWith(
                2,
                '/api/tracks/1?background=1',
                expect.objectContaining({ headers: expect.any(Object) })
            );
            expect(track.value!.elevation_gain).toBe(650);
            expect(track.value!.elevation_profile).toEqual([{ distance: 0, elevation: 90 }]);
            expect(chartUpdateKey.value).toBeGreaterThan(0);

            expect(emitted).toHaveLength(1);
            expect(emitted[0]).toMatchObject({ trackId: '1', elevation_gain: 650 });
            expect(showToast).toHaveBeenCalledWith(
                'Elevation data updated successfully!',
                'success'
            );
            expect(enrichment.enrichingElevation.value).toBe(false);
        });

        it('reports a failed refresh but still notifies listeners with the enriched scalars', async () => {
            mockFetch
                .mockResolvedValueOnce(jsonResponse({ elevation_gain: 650 }))
                .mockRejectedValueOnce(new Error('network down'));

            await enrichment.forceEnrichElevation();

            expect(showToast).toHaveBeenCalledWith(
                'Elevation data was enriched, but failed to refresh the display. Please refresh the page to see the updated data.',
                'error'
            );
            // The scalars from the enrichment response are still applied and emitted.
            expect(track.value!.elevation_gain).toBe(650);
            expect(emitted[0]).toMatchObject({ trackId: '1', elevation_gain: 650 });
            expect(enrichment.enrichingElevation.value).toBe(false);
        });

        it('surfaces a 403 as a permission error', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse({}, false, 403));

            await enrichment.forceEnrichElevation();

            expect(showToast).toHaveBeenCalledWith(
                'You are not allowed to update this track.',
                'error'
            );
            expect(track.value!.elevation_gain).toBeNull();
        });

        it('surfaces a 429 as a rate limit error', async () => {
            mockFetch.mockResolvedValueOnce(jsonResponse({}, false, 429));

            await enrichment.forceEnrichElevation();

            expect(showToast).toHaveBeenCalledWith(
                'API rate limit exceeded. Please try again later.',
                'error'
            );
        });

        it('reports a transport failure with a generic message', async () => {
            mockFetch.mockRejectedValueOnce(new Error('offline'));

            await enrichment.forceEnrichElevation();

            expect(showToast).toHaveBeenCalledWith(
                'Failed to update elevation data. Please try again.',
                'error'
            );
            expect(enrichment.enrichingElevation.value).toBe(false);
        });
    });

    describe('polling', () => {
        it('does not fetch when polling was never started', async () => {
            await enrichment.pollForElevationData('1');

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('stops polling when asked about a different track than the one being polled', async () => {
            enrichment.startElevationPolling('1');
            expect(enrichment.isPollingForElevation.value).toBe(true);

            await enrichment.pollForElevationData('2');

            expect(mockFetch).not.toHaveBeenCalled();
            expect(enrichment.isPollingForElevation.value).toBe(false);
            expect(enrichment.currentPollingTrackId.value).toBeUndefined();
        });

        it('never re-throws on a failed poll so the poller keeps running', async () => {
            enrichment.startElevationPolling('1');
            mockFetch.mockRejectedValueOnce(new Error('offline'));

            await expect(enrichment.pollForElevationData()).resolves.toBeUndefined();

            expect(enrichment.isPollingForElevation.value).toBe(true);
        });

        it('polls the detail endpoint and stops once elevation data appears', async () => {
            vi.useFakeTimers();
            mockFetch.mockResolvedValue(jsonResponse(enrichedTrack({ elevation_gain: 200 })));

            enrichment.startElevationPolling('1');
            await vi.advanceTimersByTimeAsync(3000);

            expect(mockFetch).toHaveBeenCalledWith(
                '/api/tracks/1?background=1',
                expect.objectContaining({ headers: expect.any(Object) })
            );
            expect(track.value!.elevation_gain).toBe(200);
            expect(enrichment.isPollingForElevation.value).toBe(false);
            expect(showToast).toHaveBeenCalledWith(
                'Elevation data has been successfully updated!',
                'success'
            );

            const callsWhenStopped = mockFetch.mock.calls.length;
            await vi.advanceTimersByTimeAsync(60000);
            expect(mockFetch.mock.calls.length).toBe(callsWhenStopped);
        });

        it('gives up after the maximum number of attempts', async () => {
            vi.useFakeTimers();
            mockFetch.mockResolvedValue(jsonResponse(makeTrack()));

            enrichment.startElevationPolling('1');
            await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

            // 15 polls happen (one per attempt), then the poller stops for good.
            expect(mockFetch).toHaveBeenCalledTimes(15);
            expect(enrichment.isPollingForElevation.value).toBe(false);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    describe('stopElevationPolling', () => {
        it('resets the polling state and clears the pending timer', () => {
            enrichment.startElevationPolling('1');
            expect(enrichment.isPollingForElevation.value).toBe(true);
            expect(enrichment.enrichmentPollingInterval.value).not.toBeNull();

            enrichment.stopElevationPolling();

            expect(enrichment.isPollingForElevation.value).toBe(false);
            expect(enrichment.currentPollingTrackId.value).toBeUndefined();
            expect(enrichment.enrichmentPollingInterval.value).toBeNull();
            expect(enrichment.pollingAttempts.value).toBe(0);
        });
    });
});
