import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useTrackPersistence } from '../useTrackPersistence';
import type { Segment, LatLngTuple } from '@/types';

interface PersistenceStore {
    trackName: string;
    trackDescription: string;
    trackCategories: string[];
    segments: Segment[];
    pois: Array<{ id: string; name: string; lat: number; lng: number; category?: string; distFromStart?: number }>;
    savedTrackId: string | null;
    error: string | null;
}

function createTestStore(overrides: Partial<PersistenceStore> = {}): PersistenceStore {
    return {
        trackName: '',
        trackDescription: '',
        trackCategories: [],
        segments: [],
        pois: [],
        savedTrackId: null,
        error: null,
        ...overrides,
    };
}

const mockGetAuthHeader = vi.fn().mockResolvedValue({ Authorization: 'Bearer test' });

vi.mock('../../../utils/session', () => ({
    getSessionId: vi.fn(() => 'test-session-id'),
}));

describe('useTrackPersistence', () => {
    let persistence: ReturnType<typeof useTrackPersistence>;

    beforeEach(() => {
        vi.clearAllMocks();
        persistence = useTrackPersistence();
    });

    describe('buildFragmentGpx', () => {
        it('builds valid GPX XML', () => {
            const points: LatLngTuple[] = [[50, 30], [51, 31]];
            const gpx = persistence.buildFragmentGpx(points, 'Test Fragment');
            expect(gpx).toContain('<?xml version="1.0"');
            expect(gpx).toContain('<gpx version="1.1"');
            expect(gpx).toContain('<name>Test Fragment</name>');
            expect(gpx).toContain('<trkpt lat="50" lon="30"');
            expect(gpx).toContain('<trkpt lat="51" lon="31"');
        });

        it('escapes XML special characters in name', () => {
            const points: LatLngTuple[] = [[50, 30]];
            const gpx = persistence.buildFragmentGpx(points, 'Test <>&"Fragment');
            expect(gpx).toContain('Test &lt;&gt;&amp;');
        });

        it('uses default name when not provided', () => {
            const points: LatLngTuple[] = [[50, 30]];
            const gpx = persistence.buildFragmentGpx(points);
            expect(gpx).toContain('<name>Fragment</name>');
        });
    });

    describe('buildSegmentMetaPayload', () => {
        it('builds meta payload from segments', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30]] as LatLngTuple[],
                    waypoints: [0],
                    surfaceTypes: ['unknown'],
                    name: 'Day 1',
                    color: '#FF0000',
                }],
            });

            const payload = persistence.buildSegmentMetaPayload(store);
            expect(payload).toEqual([{ name: 'Day 1', color: '#FF0000' }]);
        });

        it('uses default color when segment has none', () => {
            const store = createTestStore({
                segments: [{
                    points: [[50, 30]] as LatLngTuple[],
                    waypoints: [0],
                    surfaceTypes: ['unknown'],
                    name: null,
                    color: '',
                }],
            });

            const payload = persistence.buildSegmentMetaPayload(store);
            expect(payload[0].name).toBeNull();
            expect(payload[0].color).toMatch(/^#[0-9A-F]{6}$/i);
        });
    });

    describe('extractSegmentAsTrack', () => {
        it('returns null for segment with less than 2 points', () => {
            const store = createTestStore({
                trackName: 'Test',
                segments: [{
                    points: [[50, 30]] as LatLngTuple[],
                    waypoints: [0],
                    surfaceTypes: ['unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = persistence.extractSegmentAsTrack(store, 0);
            expect(result).toBeNull();
        });

        it('returns GeoJSON and name for valid segment', () => {
            const store = createTestStore({
                trackName: 'My Track',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = persistence.extractSegmentAsTrack(store, 0);
            expect(result).not.toBeNull();
            expect(result!.geometry.type).toBe('MultiLineString');
            expect(result!.name).toBe('My Track — segment 1');
        });

        it('returns null for invalid segment index', () => {
            const store = createTestStore({ trackName: 'Test' });
            const result = persistence.extractSegmentAsTrack(store, 99);
            expect(result).toBeNull();
        });
    });

    describe('createTrackFromSegment', () => {
        it('creates track from segment', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ id: 'new-segment-track' }),
            });

            const store = createTestStore({
                trackName: 'My Track',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.createTrackFromSegment(store, mockGetAuthHeader, 0, 'Segment Track');
            expect(result.ok).toBe(true);
            expect(result.id).toBe('new-segment-track');
        });

        it('fails for segment with less than 2 points', async () => {
            const store = createTestStore({
                trackName: 'My Track',
                segments: [{
                    points: [[50, 30]] as LatLngTuple[],
                    waypoints: [0],
                    surfaceTypes: ['unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.createTrackFromSegment(store, mockGetAuthHeader, 0);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('Segment must have at least 2 points');
        });

        it('fails for empty name', async () => {
            const store = createTestStore({
                trackName: 'My Track',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.createTrackFromSegment(store, mockGetAuthHeader, 0, '   ');
            expect(result.ok).toBe(false);
            expect(result.error).toBe('Track name is required');
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const store = createTestStore({
                trackName: 'My Track',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.createTrackFromSegment(store, mockGetAuthHeader, 0);
            expect(result.ok).toBe(false);
            expect(result.error).toContain('500');
        });
    });

    describe('duplicateTrack', () => {
        it('fails when no saved track ID', async () => {
            const store = createTestStore();
            const result = await persistence.duplicateTrack(store, mockGetAuthHeader);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('Save the track before duplicating');
        });

        it('duplicates existing track', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ id: 'duplicated-track' }),
            });

            const store = createTestStore({ savedTrackId: 'original-123' });
            const result = await persistence.duplicateTrack(store, mockGetAuthHeader);
            expect(result.ok).toBe(true);
            expect(result.id).toBe('duplicated-track');
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const store = createTestStore({ savedTrackId: 'original-123' });
            const result = await persistence.duplicateTrack(store, mockGetAuthHeader);
            expect(result.ok).toBe(false);
            expect(result.error).toContain('500');
        });
    });

    describe('exportTrack', () => {
        it('fails when no saved track ID', async () => {
            const store = createTestStore();
            const result = await persistence.exportTrack(store, mockGetAuthHeader, 'gpx');
            expect(result).toBe(false);
            expect(persistence.error.value).toBe('Save the track before exporting');
        });

        it('exports track successfully', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                blob: () => Promise.resolve(new Blob()),
            });

            const createObjectURL = vi.fn(() => 'blob:url');
            const revokeObjectURL = vi.fn();
            const originalURL = globalThis.URL;
            const originalBlob = globalThis.Blob;
            globalThis.URL = { createObjectURL, revokeObjectURL } as any;
            globalThis.Blob = class { constructor() {} } as any;

            const clickSpy = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy } as any);
            vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn() as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn() as any);

            const store = createTestStore({ savedTrackId: 'track-123', trackName: 'My Track' });
            const result = await persistence.exportTrack(store, mockGetAuthHeader, 'gpx');
            expect(result).toBe(true);

            globalThis.URL = originalURL;
            globalThis.Blob = originalBlob;
            vi.restoreAllMocks();
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const store = createTestStore({ savedTrackId: 'track-123' });
            const result = await persistence.exportTrack(store, mockGetAuthHeader, 'gpx');
            expect(result).toBe(false);
            expect(persistence.error.value).toContain('404');
        });
    });

    describe('loadTrackPois', () => {
        it('loads POIs from server', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve([
                    { id: '1', lat: 50, lon: 30, name: 'POI 1', description: 'Desc', category: 'water', distance_from_start: 100 },
                    { id: '2', latitude: 51, longitude: 31, name: 'POI 2' },
                ]),
            });

            const store = createTestStore();
            await persistence.loadTrackPois(store, 'track-123');

            expect(store.pois).toHaveLength(2);
            expect(store.pois[0].name).toBe('POI 1');
            expect(store.pois[0].distFromStart).toBe(100);
        });

        it('handles non-ok response', async () => {
            mockFetch.mockResolvedValue({ ok: false });

            const store = createTestStore({ pois: [{ id: 'existing', name: 'Existing', lat: 50, lng: 30 }] });
            await persistence.loadTrackPois(store, 'track-123');
            // POIs should remain unchanged
            expect(store.pois).toHaveLength(1);
        });

        it('handles network error silently', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const store = createTestStore();
            await persistence.loadTrackPois(store, 'track-123');
            // Should not throw
            expect(store.pois).toEqual([]);
        });
    });

    describe('loadTrack', () => {
        it('loads track data', async () => {
            const mockOnLoaded = vi.fn();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    properties: {
                        name: 'Loaded Track',
                        description: 'Description',
                        categories: ['hiking'],
                        session_id: 'session-123',
                        waypoints: [],
                    },
                    geometry: { type: 'LineString', coordinates: [[30, 50], [31, 51]] },
                    segment_meta: [],
                }),
            });

            const store = createTestStore();
            await persistence.loadTrack(store, mockGetAuthHeader, 'track-123', mockOnLoaded);

            expect(store.trackName).toBe('Loaded Track');
            expect(store.trackDescription).toBe('Description');
            expect(store.trackCategories).toEqual(['hiking']);
            expect(persistence.savedTrackId.value).toBe('track-123');
            expect(mockOnLoaded).toHaveBeenCalled();
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const store = createTestStore();
            await persistence.loadTrack(store, mockGetAuthHeader, 'track-123', vi.fn());

            expect(persistence.error.value).toContain('404');
            expect(persistence.loading.value).toBe(false);
        });

        it('sets loading state', async () => {
            let resolveJson: () => void;
            mockFetch.mockReturnValue(new Promise((resolve) => {
                resolveJson = () => resolve({ ok: true, json: () => Promise.resolve({ properties: {} }) });
            }));

            const store = createTestStore();
            const promise = persistence.loadTrack(store, mockGetAuthHeader, 'track-123', vi.fn());

            expect(persistence.loading.value).toBe(true);

            resolveJson!();
            await promise;
            expect(persistence.loading.value).toBe(false);
        });
    });

    describe('saveTrack', () => {
        it('fails when track name is empty', async () => {
            const store = createTestStore({ trackName: '' });
            const result = await persistence.saveTrack(store, mockGetAuthHeader, () => ({} as any), { markClean: vi.fn(), deleteDraft: vi.fn() });
            expect(result).toBeNull();
        });

        it('fails when less than 2 points', async () => {
            const store = createTestStore({
                trackName: 'Test',
                segments: [{
                    points: [[50, 30]] as LatLngTuple[],
                    waypoints: [0],
                    surfaceTypes: ['unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });
            const result = await persistence.saveTrack(store, mockGetAuthHeader, () => ({} as any), { markClean: vi.fn(), deleteDraft: vi.fn() });
            expect(result).toBeNull();
        });

        it('creates new track', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ id: 'new-track' }),
            });

            const draftSave = { markClean: vi.fn(), deleteDraft: vi.fn() };
            const store = createTestStore({
                trackName: 'New Track',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.saveTrack(store, mockGetAuthHeader, () => ({ type: 'MultiLineString', coordinates: [[[30, 50], [31, 51]]] } as GeoJSON.MultiLineString), draftSave);

            expect(result).toBe('new-track');
            expect(persistence.savedTrackId.value).toBe('new-track');
            expect(draftSave.markClean).toHaveBeenCalled();
        });

        it('updates existing track', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const draftSave = { markClean: vi.fn(), deleteDraft: vi.fn() };
            const store = createTestStore({
                trackName: 'Updated Track',
                savedTrackId: 'existing-track',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.saveTrack(store, mockGetAuthHeader, () => ({ type: 'MultiLineString', coordinates: [[[30, 50], [31, 51]]] } as GeoJSON.MultiLineString), draftSave);

            expect(result).toBe('existing-track');
        });

        it('handles HTTP error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const store = createTestStore({
                trackName: 'Test',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.saveTrack(store, mockGetAuthHeader, () => ({} as any), { markClean: vi.fn(), deleteDraft: vi.fn() });
            expect(result).toBeNull();
            expect(persistence.error.value).toContain('500');
        });

        it('handles geojson returning null', async () => {
            const store = createTestStore({
                trackName: 'Test',
                segments: [{
                    points: [[50, 30], [51, 31]] as LatLngTuple[],
                    waypoints: [0, 1],
                    surfaceTypes: ['unknown', 'unknown'],
                    name: null,
                    color: '#2196F3',
                }],
            });

            const result = await persistence.saveTrack(store, mockGetAuthHeader, () => null, { markClean: vi.fn(), deleteDraft: vi.fn() });
            expect(result).toBeNull();
            expect(persistence.error.value).toBe('Track must contain at least 2 points');
        });
    });
});
