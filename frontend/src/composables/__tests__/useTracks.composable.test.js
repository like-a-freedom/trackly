import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { useTracks } from '../useTracks';

// Mock session utility
vi.mock('../../utils/session', () => ({
    getSessionId: () => 'test-session-id'
}));

// Mock trackColors utility
vi.mock('../../utils/trackColors', () => ({
    getColorForId: (id) => `#color-${id}`
}));

describe('useTracks composable', () => {
    let fetchMock;

    beforeEach(() => {
        // Reset fetch mock
        fetchMock = vi.fn();
        global.fetch = fetchMock;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchTracksInBounds', () => {
        it('should fetch tracks for given bounds', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            const mockResponse = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [10.5, 50.5],
                                [10.6, 50.6]
                            ]
                        },
                        properties: { id: 'track-1', name: 'Test Track' }
                    }
                ]
            };

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const { fetchTracksInBounds, polylines, error } = useTracks();
            await fetchTracksInBounds(mockBounds);

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/tracks?bbox=10,50,11,51'),
                expect.objectContaining({ signal: expect.any(Object) })
            );
            expect(polylines.value).toHaveLength(1);
            expect(polylines.value[0]).toMatchObject({
                latlngs: [
                    [50.5, 10.5],
                    [50.6, 10.6]
                ],
                color: '#color-track-1',
                properties: { id: 'track-1', name: 'Test Track' }
            });
            expect(error.value).toBeNull();
        });

        it('should handle MultiLineString geometry', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            const mockResponse = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'MultiLineString',
                            coordinates: [
                                [
                                    [10.5, 50.5],
                                    [10.6, 50.6]
                                ],
                                [
                                    [10.7, 50.7],
                                    [10.8, 50.8]
                                ]
                            ]
                        },
                        properties: { id: 'track-2', name: 'Multi Track' }
                    }
                ]
            };

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const { fetchTracksInBounds, polylines } = useTracks();
            await fetchTracksInBounds(mockBounds);

            expect(polylines.value).toHaveLength(2);
            expect(polylines.value[0].latlngs).toEqual([
                [50.5, 10.5],
                [50.6, 10.6]
            ]);
            expect(polylines.value[1].latlngs).toEqual([
                [50.7, 10.7],
                [50.8, 10.8]
            ]);
        });

        it('should handle fetch error', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const { fetchTracksInBounds, polylines, error } = useTracks();
            await fetchTracksInBounds(mockBounds);

            expect(error.value).toBe('Failed to fetch tracks');
            expect(polylines.value).toEqual([]);
        });

        it('should handle network error', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            fetchMock.mockRejectedValueOnce(new Error('Network error'));

            const { fetchTracksInBounds, polylines, error } = useTracks();
            await fetchTracksInBounds(mockBounds);

            expect(error.value).toBe('Network error');
            expect(polylines.value).toEqual([]);
        });

        it('should handle null bounds', async () => {
            const { fetchTracksInBounds, error } = useTracks();
            await fetchTracksInBounds(null);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(error.value).toBeNull();
        });

        it('should cancel previous request when new request is made', async () => {
            const mockBounds1 = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            const mockBounds2 = {
                getSouthWest: () => ({ lat: 52, lng: 12 }),
                getNorthEast: () => ({ lat: 53, lng: 13 })
            };

            const mockResponse = {
                type: 'FeatureCollection',
                features: []
            };

            let firstAbortCalled = false;
            fetchMock.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            ok: true,
                            json: async () => mockResponse
                        });
                    }, 100);
                });
            });

            const { fetchTracksInBounds } = useTracks();

            // Start first request
            const promise1 = fetchTracksInBounds(mockBounds1);

            // Start second request immediately
            const promise2 = fetchTracksInBounds(mockBounds2);

            await Promise.all([promise1, promise2]);

            // Second request should complete
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('should use cache for repeated requests', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            const mockResponse = {
                type: 'FeatureCollection',
                features: []
            };

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const { fetchTracksInBounds } = useTracks();

            // First request
            await fetchTracksInBounds(mockBounds);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            // Second request with same bounds (should use cache)
            await fetchTracksInBounds(mockBounds);
            expect(fetchMock).toHaveBeenCalledTimes(1); // Should not call fetch again
        });

        it('should include zoom and mode parameters in request', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ type: 'FeatureCollection', features: [] })
            });

            const { fetchTracksInBounds } = useTracks();
            await fetchTracksInBounds(mockBounds, { zoom: 15, mode: 'detail' });

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('zoom=15'),
                expect.any(Object)
            );
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('mode=detail'),
                expect.any(Object)
            );
        });

        it('should include owner_session_id when provided', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ type: 'FeatureCollection', features: [] })
            });

            const { fetchTracksInBounds } = useTracks();
            await fetchTracksInBounds(mockBounds, { ownerSessionId: 'abc-123' });

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('owner_session_id=abc-123'),
                expect.any(Object)
            );
        });

        it('should handle invalid response data', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ invalid: 'data' })
            });

            const { fetchTracksInBounds, polylines } = useTracks();
            await fetchTracksInBounds(mockBounds);

            expect(polylines.value).toEqual([]);
        });
    });

    describe('uploadTrack', () => {
        it('should upload track with file and metadata', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx', {
                type: 'application/gpx+xml'
            });

            const mockResponse = {
                id: 'new-track-id',
                name: 'New Track',
                message: 'Track uploaded successfully'
            };

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const { uploadTrack } = useTracks();
            const result = await uploadTrack({
                file: mockFile,
                name: 'New Track',
                categories: ['hiking', 'mountain']
            });

            expect(fetchMock).toHaveBeenCalledWith(
                '/tracks/upload',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            );

            const formData = fetchMock.mock.calls[0][1].body;
            expect(formData.get('file')).toBe(mockFile);
            expect(formData.get('name')).toBe('New Track');
            expect(formData.get('categories')).toBe('hiking,mountain');
            expect(formData.get('session_id')).toBe('test-session-id');

            expect(result).toEqual(mockResponse);
        });

        it('should handle upload without optional fields', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'track-id' })
            });

            const { uploadTrack } = useTracks();
            await uploadTrack({ file: mockFile });

            const formData = fetchMock.mock.calls[0][1].body;
            expect(formData.get('file')).toBe(mockFile);
            expect(formData.get('session_id')).toBe('test-session-id');
        });

        it('should handle 429 rate limit error', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'Rate limit exceeded'
            });

            const { uploadTrack, error } = useTracks();

            await expect(uploadTrack({ file: mockFile })).rejects.toThrow(
                'Please, wait 10 seconds between uploads.'
            );
            expect(error.value).toBe('Please, wait 10 seconds between uploads.');
        });

        it('should handle upload error', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal server error'
            });

            const { uploadTrack, error } = useTracks();

            await expect(uploadTrack({ file: mockFile })).rejects.toThrow();
            expect(error.value).toBeTruthy();
        });

        it('should handle network error during upload', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockRejectedValueOnce(new Error('Network failure'));

            const { uploadTrack, error } = useTracks();

            await expect(uploadTrack({ file: mockFile })).rejects.toThrow(
                'Network failure'
            );
            expect(error.value).toBe('Network failure');
        });
    });

    describe('checkTrackDuplicate', () => {
        it('should check if track exists', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    is_exist: true,
                    id: 'existing-track-id'
                })
            });

            const { checkTrackDuplicate } = useTracks();
            const result = await checkTrackDuplicate({ file: mockFile });

            expect(result).toEqual({
                alreadyExists: true,
                id: 'existing-track-id',
                warning: 'Track already exists'
            });
        });

        it('should return false when track does not exist', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ is_exist: false })
            });

            const { checkTrackDuplicate } = useTracks();
            const result = await checkTrackDuplicate({ file: mockFile });

            expect(result).toEqual({ alreadyExists: false });
        });

        it('should handle null file', async () => {
            const { checkTrackDuplicate } = useTracks();
            const result = await checkTrackDuplicate({ file: null });

            expect(result).toEqual({ alreadyExists: false });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('should handle error checking duplicate', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockRejectedValueOnce(new Error('Network error'));

            const { checkTrackDuplicate } = useTracks();
            const result = await checkTrackDuplicate({ file: mockFile });

            expect(result).toEqual({
                alreadyExists: false,
                warning: 'Network error'
            });
        });

        it('should handle invalid JSON response', async () => {
            const mockFile = new File(['gpx content'], 'track.gpx');

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => {
                    throw new Error('Invalid JSON');
                }
            });

            const { checkTrackDuplicate } = useTracks();
            const result = await checkTrackDuplicate({ file: mockFile });

            expect(result).toEqual({ alreadyExists: false });
        });
    });

    describe('fetchTrackDetail', () => {
        it('should fetch track detail by ID', async () => {
            const mockTrack = {
                id: 'track-123',
                name: 'Test Track',
                length_km: 10.5,
                duration_seconds: 3600,
                avg_speed: 10.5,
                max_speed: 25.0
            };

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockTrack
            });

            const { fetchTrackDetail } = useTracks();
            const result = await fetchTrackDetail('track-123');

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/tracks/track-123'),
                expect.any(Object)
            );
            expect(result).toMatchObject(mockTrack);
        });

        it('should include zoom and mode parameters', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'track-123' })
            });

            const { fetchTrackDetail } = useTracks();
            await fetchTrackDetail('track-123', 15, 'detail');

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('zoom=15'),
                expect.any(Object)
            );
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('mode=detail'),
                expect.any(Object)
            );
        });

        it('should handle missing track ID', async () => {
            const { fetchTrackDetail } = useTracks();
            const result = await fetchTrackDetail(null);

            expect(result).toBeNull();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('should handle fetch error', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });

            const { fetchTrackDetail, error } = useTracks();
            const result = await fetchTrackDetail('track-123');

            expect(result).toBeNull();
            expect(error.value).toContain('Failed to fetch track detail');
        });

        it('should handle network error', async () => {
            fetchMock.mockRejectedValueOnce(new Error('Network failure'));

            const { fetchTrackDetail, error } = useTracks();
            const result = await fetchTrackDetail('track-123');

            expect(result).toBeNull();
            expect(error.value).toBe('Network failure');
        });
    });

    describe('processTrackData', () => {
        it('should process valid track data', () => {
            const { processTrackData } = useTracks();

            const trackData = {
                id: 'track-1',
                avg_speed: 10.5,
                max_speed: 25.0,
                length_km: 15.5,
                duration_seconds: 3600,
                elevation_up: 500,
                elevation_down: 450,
                avg_hr: 145
            };

            const result = processTrackData(trackData);

            expect(result).toMatchObject(trackData);
        });

        it('should validate and nullify invalid speed data', () => {
            const { processTrackData } = useTracks();

            const trackData = {
                id: 'track-1',
                avg_speed: -10, // Invalid
                max_speed: 250 // Invalid
            };

            const result = processTrackData(trackData);

            expect(result.avg_speed).toBeNull();
            expect(result.max_speed).toBeNull();
        });

        it('should validate and nullify invalid distance', () => {
            const { processTrackData } = useTracks();

            const trackData = {
                id: 'track-1',
                length_km: -5 // Invalid
            };

            const result = processTrackData(trackData);

            expect(result.length_km).toBeNull();
        });

        it('should validate and nullify invalid duration', () => {
            const { processTrackData } = useTracks();

            const trackData = {
                id: 'track-1',
                duration_seconds: NaN // Invalid
            };

            const result = processTrackData(trackData);

            expect(result.duration_seconds).toBeNull();
        });

        it('should validate elevation data', () => {
            const { processTrackData } = useTracks();

            const trackData = {
                id: 'track-1',
                elevation_up: 'invalid', // Invalid
                elevation_down: NaN, // Invalid
                avg_hr: 'not a number' // Invalid
            };

            const result = processTrackData(trackData);

            expect(result.elevation_up).toBeNull();
            expect(result.elevation_down).toBeNull();
            expect(result.avg_hr).toBeNull();
        });

        it('should handle null track data', () => {
            const { processTrackData } = useTracks();
            const result = processTrackData(null);

            expect(result).toBeNull();
        });

        it('should handle invalid track data type', () => {
            const { processTrackData } = useTracks();
            const result = processTrackData('invalid');

            expect(result).toBeNull();
        });
    });

    describe('updateTrackInPolylines', () => {
        it('should update track properties in polylines', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            const mockResponse = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [10.5, 50.5],
                                [10.6, 50.6]
                            ]
                        },
                        properties: { id: 'track-1', name: 'Original Name' }
                    }
                ]
            };

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const { fetchTracksInBounds, updateTrackInPolylines, polylines } =
                useTracks();

            await fetchTracksInBounds(mockBounds);
            expect(polylines.value[0].properties.name).toBe('Original Name');

            updateTrackInPolylines('track-1', { name: 'Updated Name' });

            expect(polylines.value[0].properties.name).toBe('Updated Name');
            expect(polylines.value[0].properties.id).toBe('track-1');
        });

        it('should not update tracks with different IDs', async () => {
            const mockBounds = {
                getSouthWest: () => ({ lat: 50, lng: 10 }),
                getNorthEast: () => ({ lat: 51, lng: 11 })
            };

            const mockResponse = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [10.5, 50.5],
                                [10.6, 50.6]
                            ]
                        },
                        properties: { id: 'track-1', name: 'Track 1' }
                    },
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [10.7, 50.7],
                                [10.8, 50.8]
                            ]
                        },
                        properties: { id: 'track-2', name: 'Track 2' }
                    }
                ]
            };

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const { fetchTracksInBounds, updateTrackInPolylines, polylines } =
                useTracks();

            await fetchTracksInBounds(mockBounds);

            updateTrackInPolylines('track-1', { name: 'Updated Track 1' });

            expect(polylines.value[0].properties.name).toBe('Updated Track 1');
            expect(polylines.value[1].properties.name).toBe('Track 2'); // Should not change
        });
    });
});
