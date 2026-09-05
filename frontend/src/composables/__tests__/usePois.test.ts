import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { usePois } from '../usePois';
import type { Poi } from '@/types';

describe('usePois', () => {
    let pois: ReturnType<typeof usePois>;

    beforeEach(() => {
        vi.clearAllMocks();
        pois = usePois();
    });

    it('starts with empty POIs', () => {
        expect(pois.pois.value).toEqual([]);
        expect(pois.loading.value).toBe(false);
        expect(pois.error.value).toBeNull();
    });

    describe('fetchTrackPois', () => {
        it('returns empty array for empty trackId', async () => {
            const result = await pois.fetchTrackPois('');
            expect(result).toEqual([]);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('fetches POIs for a track', async () => {
            const mockPois: Poi[] = [
                { id: '1', name: 'POI 1', lat: 50, lng: 30 },
                { id: '2', name: 'POI 2', lat: 51, lng: 31 },
            ];

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockPois),
            });

            const result = await pois.fetchTrackPois('track-123');

            expect(result).toEqual(mockPois);
            expect(pois.pois.value).toEqual(mockPois);
            expect(pois.loading.value).toBe(false);
            expect(mockFetch).toHaveBeenCalledWith('/api/tracks/track-123/pois');
        });

        it('handles 404 response', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const result = await pois.fetchTrackPois('track-123');

            expect(result).toEqual([]);
            expect(pois.pois.value).toEqual([]);
            expect(pois.error.value).toBeNull();
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const result = await pois.fetchTrackPois('track-123');

            expect(result).toEqual([]);
            expect(pois.error.value).toContain('500');
        });

        it('handles network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await pois.fetchTrackPois('track-123');

            expect(result).toEqual([]);
            expect(pois.error.value).toBe('Network error');
        });

        it('sets loading state during fetch', async () => {
            let resolveJson: () => void;
            mockFetch.mockReturnValue(new Promise((resolve) => {
                resolveJson = () => resolve({ ok: true, json: () => Promise.resolve([]) });
            }));

            const promise = pois.fetchTrackPois('track-123');
            expect(pois.loading.value).toBe(true);

            resolveJson!();
            await promise;
            expect(pois.loading.value).toBe(false);
        });
    });

    describe('fetchPoisInBbox', () => {
        it('fetches POIs in bounding box', async () => {
            const mockResponse = {
                pois: [{ id: '1', name: 'POI 1', lat: 50, lng: 30 }],
                total: 1,
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await pois.fetchPoisInBbox('30,50,31,51', 50);

            expect(result.pois).toEqual(mockResponse.pois);
            expect(result.total).toBe(1);
            expect(pois.pois.value).toEqual(mockResponse.pois);
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const result = await pois.fetchPoisInBbox('30,50,31,51');

            expect(result).toEqual({ pois: [], total: 0 });
            expect(pois.error.value).toContain('500');
        });

        it('handles network error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await pois.fetchPoisInBbox('30,50,31,51');

            expect(result).toEqual({ pois: [], total: 0 });
            expect(pois.error.value).toBe('Network error');
        });

        it('uses default limit', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ pois: [], total: 0 }),
            });

            await pois.fetchPoisInBbox('30,50,31,51');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=100'),
            );
        });
    });

    describe('clearPois', () => {
        it('clears all POI data', () => {
            pois.pois.value = [{ id: '1', name: 'POI', lat: 50, lng: 30 }];
            pois.error.value = 'Some error';

            pois.clearPois();

            expect(pois.pois.value).toEqual([]);
            expect(pois.error.value).toBeNull();
        });
    });
});
