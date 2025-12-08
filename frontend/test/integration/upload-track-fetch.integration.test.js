import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTracks } from '../../src/composables/useTracks.js';
import * as sessionUtils from '../../src/utils/session';

const MOCK_SESSION_ID = '00000000-1111-2222-3333-444444444444';

// Minimal File polyfill for Node-based tests
if (typeof File === 'undefined') {
    global.File = class TestFile extends Blob {
        constructor(bits, name, options = {}) {
            super(bits, options);
            this.name = name;
            this.lastModified = options.lastModified || Date.now();
        }
    };
}

describe('Upload to track fetch flow (integration)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('uploads a track and fetches its detail once using the returned id', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'new-track-123', url: '/tracks/new-track-123' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'new-track-123',
                    name: 'Uploaded Track',
                    session_id: MOCK_SESSION_ID,
                    geom_geojson: {
                        type: 'LineString',
                        coordinates: [
                            [30.0, 60.0],
                            [30.1, 60.1]
                        ]
                    },
                    length_km: 2.5,
                    duration_seconds: 1800
                })
            });

        global.fetch = fetchMock;
        vi.spyOn(sessionUtils, 'getSessionId').mockReturnValue(MOCK_SESSION_ID);

        const { uploadTrack, fetchTrackDetail } = useTracks();
        const file = new File(['<gpx></gpx>'], 'fresh-track.gpx', { type: 'application/gpx+xml' });

        const uploadResult = await uploadTrack({
            file,
            name: 'Fresh Track',
            categories: ['running']
        });

        expect(uploadResult.id).toBe('new-track-123');

        const trackData = await fetchTrackDetail(uploadResult.id, 14, 'detail');

        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0];
        expect(uploadUrl).toBe('/tracks/upload');
        expect(uploadOptions.method).toBe('POST');
        expect(uploadOptions.body).toBeInstanceOf(FormData);
        const uploadEntries = Object.fromEntries(uploadOptions.body.entries());
        expect(uploadEntries.session_id).toBe(MOCK_SESSION_ID);
        expect(uploadEntries.file).toBeInstanceOf(File);

        const [detailUrl, detailOptions] = fetchMock.mock.calls[1];
        expect(detailUrl).toContain('/tracks/new-track-123');
        expect(detailUrl).toContain('mode=detail');
        expect(detailUrl).toContain('zoom=14');
        expect((detailOptions && detailOptions.method) || 'GET').toBe('GET');

        expect(trackData).toMatchObject({
            id: 'new-track-123',
            name: 'Uploaded Track',
            length_km: 2.5,
            duration_seconds: 1800
        });
    });
});
