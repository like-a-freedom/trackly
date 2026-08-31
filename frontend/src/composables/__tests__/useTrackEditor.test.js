import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing the composable
vi.mock('../useAuth', () => ({
    useAuth: () => ({
        getAuthHeader: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
        user: { value: { id: 1, email: 'test@test.com' } },
    }),
}));

vi.mock('../../utils/session', () => ({
    getSessionId: vi.fn(() => 'test-session-id'),
}));

vi.mock('vue', async () => {
    const actual = await vi.importActual('vue');
    return {
        ...actual,
        onBeforeUnmount: vi.fn(),
    };
});

// Stub window event listeners for draft save
vi.stubGlobal('addEventListener', vi.fn());
vi.stubGlobal('removeEventListener', vi.fn());

import { useTrackEditor } from '../useTrackEditor';

describe('useTrackEditor', () => {
    let editor;
    let storage;

    beforeEach(() => {
        storage = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => storage[key] ?? null),
            setItem: vi.fn((key, val) => { storage[key] = val; }),
            removeItem: vi.fn((key) => { delete storage[key]; }),
        });
        vi.restoreAllMocks();
        vi.stubGlobal('addEventListener', vi.fn());
        vi.stubGlobal('removeEventListener', vi.fn());

        editor = useTrackEditor();
        editor.routing.setMode('manual');
    });

    describe('initial state', () => {
        it('starts in edit mode', () => {
            expect(editor.editorMode.value).toBe('edit');
        });

        it('has one empty segment', () => {
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(0);
        });

        it('totalPoints is 0', () => {
            expect(editor.totalPoints.value).toBe(0);
        });

        it('canSave is false (no name and no points)', () => {
            expect(editor.canSave.value).toBe(false);
        });

        it('isNewTrack is true', () => {
            expect(editor.isNewTrack.value).toBe(true);
        });
    });

    describe('addWaypoint', () => {
        it('adds a point to active segment', () => {
            const result = editor.addWaypoint(50.45, 30.52);
            expect(result).toBe(true);
            expect(editor.segments.value[0].points).toEqual([[50.45, 30.52]]);
            expect(editor.segments.value[0].waypoints).toEqual([0]);
        });

        it('adds multiple points', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            expect(editor.segments.value[0].points).toHaveLength(2);
            expect(editor.totalPoints.value).toBe(2);
        });

        it('rejects invalid coordinates', () => {
            expect(editor.addWaypoint(91, 30)).toBe(false);
            expect(editor.addWaypoint(50, 181)).toBe(false);
            expect(editor.addWaypoint(NaN, 30)).toBe(false);
            expect(editor.addWaypoint(50, Infinity)).toBe(false);
        });

        it('rejects points in view mode', () => {
            editor.setMode('view');
            expect(editor.addWaypoint(50, 30)).toBe(false);
        });

        it('rejects points too close to last point (<5m)', () => {
            editor.addWaypoint(50.0, 30.0);
            // ~1m away
            const result = editor.addWaypoint(50.00001, 30.00001);
            expect(result).toBe(false);
            expect(editor.segments.value[0].points).toHaveLength(1);
        });

        it('calculates distance correctly', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.1, 30.0); // ~11km
            expect(editor.totalDistanceKm.value).toBeGreaterThan(10);
            expect(editor.totalDistanceKm.value).toBeLessThan(12);
        });
    });

    describe('moveWaypoint', () => {
        it('updates point position', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.moveWaypoint(0, 0, 51.0, 31.0);
            expect(editor.segments.value[0].points[0]).toEqual([51.0, 31.0]);
        });

        it('rejects invalid coordinates', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.moveWaypoint(0, 0, 100, 200);
            // Point should remain unchanged
            expect(editor.segments.value[0].points[0]).toEqual([50.0, 30.0]);
        });

        it('ignores invalid segment index', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.moveWaypoint(5, 0, 51.0, 31.0);
            expect(editor.segments.value[0].points[0]).toEqual([50.0, 30.0]);
        });
    });

    describe('deleteWaypoint', () => {
        it('removes a point from segment', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addWaypoint(52.0, 32.0);

            const result = editor.deleteWaypoint(0, 1);
            expect(result).toBe(true);
            expect(editor.segments.value[0].points).toHaveLength(2);
            expect(editor.segments.value[0].points[1]).toEqual([52.0, 32.0]);
        });

        it('resets segment when deleting last point', () => {
            editor.addWaypoint(50.0, 30.0);
            const result = editor.deleteWaypoint(0, 0);
            expect(result).toBe(true);
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(0);
        });

        it('updates waypoint indices after deletion', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addWaypoint(52.0, 32.0);

            editor.deleteWaypoint(0, 0);
            // Waypoints should be re-indexed
            expect(editor.segments.value[0].waypoints).toContain(0);
            expect(editor.segments.value[0].waypoints).toContain(1);
        });
    });

    describe('insertWaypoint', () => {
        it('inserts a point between two existing points', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(52.0, 32.0);

            editor.insertWaypoint(0, 0, 51.0, 31.0);
            expect(editor.segments.value[0].points).toHaveLength(3);
            expect(editor.segments.value[0].points[1]).toEqual([51.0, 31.0]);
        });

        it('rejects invalid coordinates', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(52.0, 32.0);
            editor.insertWaypoint(0, 0, 100, 200);
            expect(editor.segments.value[0].points).toHaveLength(2);
        });
    });

    describe('segment operations', () => {
        it('addSegment creates a new segment and switches to it', () => {
            editor.addWaypoint(50.0, 30.0);
            const idx = editor.addSegment();
            expect(idx).toBe(1);
            expect(editor.segments.value).toHaveLength(2);
            expect(editor.activeSegmentIndex.value).toBe(1);
        });

        it('addSegment limits to MAX_SEGMENTS', () => {
            for (let i = 0; i < 100; i++) {
                editor.addSegment();
            }
            // Already have 1 initial + 99 added = 100, next should fail
            const idx = editor.addSegment();
            expect(idx).toBe(-1);
        });

        it('deleteSegment removes a segment', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addSegment();
            editor.addWaypoint(51.0, 31.0);

            const result = editor.deleteSegment(0);
            expect(result).toBe(true);
            expect(editor.segments.value).toHaveLength(1);
        });

        it('deleteSegment resets to empty when last segment deleted', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.deleteSegment(0);
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(0);
        });

        it('splitSegment creates two segments from one', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addWaypoint(52.0, 32.0);
            editor.addWaypoint(53.0, 33.0);

            const result = editor.splitSegment(2);
            expect(result).toBe(true);
            expect(editor.segments.value).toHaveLength(2);
            expect(editor.segments.value[0].points).toHaveLength(3); // indices 0,1,2
            expect(editor.segments.value[1].points).toHaveLength(2); // indices 2,3
            // The split point is shared
            expect(editor.segments.value[0].points[2]).toEqual(
                editor.segments.value[1].points[0]
            );
        });

        it('splitSegment rejects split at first or last point', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addWaypoint(52.0, 32.0);

            expect(editor.splitSegment(0)).toBe(false);
            expect(editor.splitSegment(2)).toBe(false);
        });

        it('reverseSegment reverses point order', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addWaypoint(52.0, 32.0);

            editor.reverseSegment(0);
            expect(editor.segments.value[0].points[0]).toEqual([52.0, 32.0]);
            expect(editor.segments.value[0].points[2]).toEqual([50.0, 30.0]);
        });

        it('reverseTrack reverses segments and points', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addSegment();
            editor.addWaypoint(52.0, 32.0);
            editor.addWaypoint(53.0, 33.0);

            const ok = editor.reverseTrack();
            expect(ok).toBe(true);
            expect(editor.segments.value).toHaveLength(2);
            expect(editor.segments.value[0].points[0]).toEqual([53.0, 33.0]);
            expect(editor.segments.value[1].points[0]).toEqual([51.0, 31.0]);
        });

        it('setActiveSegment switches active segment', () => {
            editor.addSegment();
            editor.setActiveSegment(0);
            expect(editor.activeSegmentIndex.value).toBe(0);
            editor.setActiveSegment(1);
            expect(editor.activeSegmentIndex.value).toBe(1);
        });

        it('setActiveSegment ignores out-of-range index', () => {
            editor.setActiveSegment(99);
            expect(editor.activeSegmentIndex.value).toBe(0);
        });
    });

    describe('fragment operations', () => {
        it('selects fragment start and end points', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);

            editor.setFragmentPoint(0, 0);
            editor.setFragmentPoint(0, 2);

            const range = editor.getFragmentRange();
            expect(range).toEqual({ segIndex: 0, startIdx: 0, endIdx: 2 });
        });

        it('deleteFragmentConnect removes interior points', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            editor.addWaypoint(50.03, 30.03);

            const ok = editor.deleteFragmentConnect(0, 0, 3);
            expect(ok).toBe(true);
            expect(editor.segments.value[0].points).toHaveLength(2);
        });

        it('deleteFragmentSplit creates two segments', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            editor.addWaypoint(50.03, 30.03);
            editor.addWaypoint(50.04, 30.04);

            const ok = editor.deleteFragmentSplit(0, 1, 3);
            expect(ok).toBe(true);
            expect(editor.segments.value).toHaveLength(2);
            expect(editor.segments.value[0].points).toHaveLength(2);
            expect(editor.segments.value[1].points).toHaveLength(2);
        });

        it('reverseFragment reverses a subrange', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            editor.addWaypoint(50.03, 30.03);

            const ok = editor.reverseFragment(0, 1, 2);
            expect(ok).toBe(true);
            expect(editor.segments.value[0].points[1]).toEqual([50.02, 30.02]);
            expect(editor.segments.value[0].points[2]).toEqual([50.01, 30.01]);
        });

        it('rerouteFragment replaces range using manual routing', () => {
            editor.routing.setMode('manual');
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            editor.addWaypoint(50.03, 30.03);

            const ok = editor.rerouteFragment(0, 1, 3);
            expect(ok).toBe(true);
            expect(editor.segments.value[0].points.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('undo / redo', () => {
        it('undoes adding a waypoint', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            editor.handleUndo();
            expect(editor.segments.value[0].points).toHaveLength(1);
        });

        it('redoes after undo', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            editor.handleUndo();
            expect(editor.segments.value[0].points).toHaveLength(1);

            editor.handleRedo();
            expect(editor.segments.value[0].points).toHaveLength(2);
        });

        it('undo does nothing when stack is empty', () => {
            editor.handleUndo();
            expect(editor.segments.value[0].points).toHaveLength(0);
        });

        it('canUndo/canRedo track stack state', () => {
            expect(editor.canUndo.value).toBe(false);
            expect(editor.canRedo.value).toBe(false);

            editor.addWaypoint(50.0, 30.0);
            expect(editor.canUndo.value).toBe(true);

            editor.handleUndo();
            expect(editor.canRedo.value).toBe(true);
        });
    });

    describe('editor modes', () => {
        it('setMode changes mode', () => {
            editor.setMode('view');
            expect(editor.editorMode.value).toBe('view');
        });

        it('setMode ignores invalid values', () => {
            editor.setMode('invalid');
            expect(editor.editorMode.value).toBe('edit');
        });

        it('routing mode activates auto routing', () => {
            editor.setMode('routing');
            expect(editor.routing.mode.value).toBe('auto');
        });

        it('edit mode keeps current routing mode', () => {
            editor.setMode('routing');
            editor.setMode('edit');
            expect(editor.routing.mode.value).toBe('auto');
        });
    });

    describe('toGeoJSON', () => {
        it('returns null for empty track', () => {
            expect(editor.toGeoJSON()).toBeNull();
        });

        it('returns null for single point', () => {
            editor.addWaypoint(50.0, 30.0);
            expect(editor.toGeoJSON()).toBeNull();
        });

        it('converts segments to MultiLineString', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            const geojson = editor.toGeoJSON();
            expect(geojson.type).toBe('MultiLineString');
            expect(geojson.coordinates).toHaveLength(1);
            // GeoJSON is [lng, lat]
            expect(geojson.coordinates[0][0]).toEqual([30.0, 50.0]);
            expect(geojson.coordinates[0][1]).toEqual([31.0, 51.0]);
        });

        it('handles multiple segments', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addSegment();
            editor.addWaypoint(52.0, 32.0);
            editor.addWaypoint(53.0, 33.0);

            const geojson = editor.toGeoJSON();
            expect(geojson.coordinates).toHaveLength(2);
        });

        it('filters out empty segments', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addSegment(); // empty second segment

            const geojson = editor.toGeoJSON();
            expect(geojson.coordinates).toHaveLength(1);
        });
    });

    describe('fromGeoJSON', () => {
        it('loads MultiLineString geometry', () => {
            const geojson = {
                type: 'MultiLineString',
                coordinates: [
                    [[30.0, 50.0], [31.0, 51.0]],
                    [[32.0, 52.0], [33.0, 53.0]],
                ],
            };

            editor.fromGeoJSON(geojson, [], [
                { name: 'Day 1', color: '#111111' },
                { name: 'Day 2', color: '#222222' },
            ]);
            expect(editor.segments.value).toHaveLength(2);
            // Converted to [lat, lng] format
            expect(editor.segments.value[0].points[0]).toEqual([50.0, 30.0]);
            expect(editor.segments.value[1].points[0]).toEqual([52.0, 32.0]);
            expect(editor.segments.value[0].name).toBe('Day 1');
            expect(editor.segments.value[1].color).toBe('#222222');
        });

        it('loads LineString geometry', () => {
            const geojson = {
                type: 'LineString',
                coordinates: [[30.0, 50.0], [31.0, 51.0]],
            };

            editor.fromGeoJSON(geojson);
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(2);
        });

        it('resets to empty on invalid geometry', () => {
            editor.fromGeoJSON(null);
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(0);
        });

        it('all points become waypoints when no explicit waypoints', () => {
            const geojson = {
                type: 'MultiLineString',
                coordinates: [[[30, 50], [31, 51], [32, 52]]],
            };

            editor.fromGeoJSON(geojson);
            expect(editor.segments.value[0].waypoints).toEqual([0, 1, 2]);
        });
    });

    describe('canSave', () => {
        it('requires name and at least 2 points', () => {
            expect(editor.canSave.value).toBe(false);

            editor.trackName.value = 'My Track';
            expect(editor.canSave.value).toBe(false);

            editor.addWaypoint(50.0, 30.0);
            expect(editor.canSave.value).toBe(false);

            editor.addWaypoint(51.0, 31.0);
            expect(editor.canSave.value).toBe(true);
        });

        it('whitespace-only name is not valid', () => {
            editor.trackName.value = '   ';
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            expect(editor.canSave.value).toBe(false);
        });
    });

    describe('segmentStats', () => {
        it('returns stats for each segment', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.addSegment();
            editor.addWaypoint(52.0, 32.0);

            const stats = editor.segmentStats.value;
            expect(stats).toHaveLength(2);
            expect(stats[0].pointCount).toBe(2);
            expect(stats[0].distanceKm).toBeGreaterThan(0);
            expect(stats[0].color).toBeDefined();
            expect(stats[1].pointCount).toBe(1);
        });

        it('reflects custom segment name and color', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);
            editor.setSegmentName(0, 'Day 1: Start');
            editor.setSegmentColor(0, '#123ABC');

            const stats = editor.segmentStats.value[0];
            expect(stats.displayName).toBe('Day 1: Start');
            expect(stats.color).toBe('#123ABC');
        });
    });

    describe('saveTrack — create new track', () => {
        it('sends POST to /api/tracks/create', async () => {
            const mockResponse = { id: 'new-track-123' };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            }));

            editor.trackName.value = 'Test Track';
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            const id = await editor.saveTrack();
            expect(id).toBe('new-track-123');
            expect(editor.savedTrackId.value).toBe('new-track-123');
            expect(editor.saving.value).toBe(false);

            const [url, options] = fetch.mock.calls[0];
            expect(url).toBe('/api/tracks/create');
            expect(options.method).toBe('POST');
            const body = JSON.parse(options.body);
            expect(body.name).toBe('Test Track');
            expect(body.geometry.type).toBe('MultiLineString');
            expect(body.session_id).toBe('test-session-id');
        });

        it('returns null and sets error on failure', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
            }));

            editor.trackName.value = 'Test';
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            const id = await editor.saveTrack();
            expect(id).toBeNull();
            expect(editor.error.value).toContain('500');
        });

        it('does nothing when canSave is false', async () => {
            vi.stubGlobal('fetch', vi.fn());
            const id = await editor.saveTrack();
            expect(id).toBeNull();
            expect(fetch).not.toHaveBeenCalled();
        });
    });

    describe('saveTrack — update existing track', () => {
        it('sends PUT to /api/tracks/{id}/geometry', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            }));

            // Simulate loaded track
            editor.savedTrackId.value = 'existing-123';
            editor.trackName.value = 'Existing Track';
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            const id = await editor.saveTrack();
            expect(id).toBe('existing-123');

            // First call should be PUT geometry
            const [url, options] = fetch.mock.calls[0];
            expect(url).toBe('/api/tracks/existing-123/geometry');
            expect(options.method).toBe('PUT');
        });

        it('includes session_id when updating metadata', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            }));

            editor.savedTrackId.value = 'existing-456';
            editor.trackName.value = 'Existing Track';
            editor.trackDescription.value = 'Description';
            editor.trackCategories.value = ['hiking'];
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            await editor.saveTrack();

            const metadataCalls = fetch.mock.calls.slice(1, 4);
            expect(metadataCalls).toHaveLength(3);
            for (const [, options] of metadataCalls) {
                const body = JSON.parse(options.body);
                expect(body.session_id).toBe('test-session-id');
            }
        });
    });

    describe('loadTrack', () => {
        it('loads track data from server', async () => {
            const geojson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'MultiLineString',
                        coordinates: [[[30, 50], [31, 51]]],
                    },
                    properties: {
                        name: 'Loaded Track',
                        description: 'A description',
                        categories: ['hiking'],
                        waypoints: [],
                        session_id: 'test-session-id',
                    },
                }],
            };

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(geojson),
            }));

            await editor.loadTrack('track-456');

            expect(editor.trackName.value).toBe('Loaded Track');
            expect(editor.trackDescription.value).toBe('A description');
            expect(editor.trackCategories.value).toEqual(['hiking']);
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(2);
            expect(editor.savedTrackId.value).toBe('track-456');
            expect(editor.isOwner.value).toBe(true);
        });

        it('sets error on network failure', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            }));

            await editor.loadTrack('missing-id');
            expect(editor.error.value).toContain('404');
        });
    });

    describe('restoreDraft', () => {
        it('restores draft from localStorage', () => {
            storage['trackly_draft'] = JSON.stringify({
                version: 1,
                timestamp: new Date().toISOString(),
                track: {
                    name: 'Draft Track',
                    description: 'Draft desc',
                    categories: ['cycling'],
                    segments: [{ points: [[50, 30], [51, 31]], waypoints: [0, 1] }],
                    pois: [],
                },
                editingState: {
                    activeSegment: 0,
                    routingMode: 'manual',
                    routingProfile: 'mtb',
                    snapToRoadMode: 'on',
                },
            });

            const result = editor.restoreDraft();
            expect(result).toBe(true);
            expect(editor.trackName.value).toBe('Draft Track');
            expect(editor.trackCategories.value).toEqual(['cycling']);
            expect(editor.segments.value[0].points).toHaveLength(2);
            expect(editor.routing.profile.value).toBe('mtb');
            expect(editor.snapToRoadMode.value).toBe('on');
        });

        it('returns false when no draft exists', () => {
            expect(editor.restoreDraft()).toBe(false);
        });
    });

    describe('snapToRoadMode', () => {
        it('updates snap mode with valid values', () => {
            editor.setSnapToRoadMode('on');
            expect(editor.snapToRoadMode.value).toBe('on');
            editor.setSnapToRoadMode('off');
            expect(editor.snapToRoadMode.value).toBe('off');
        });

        it('ignores invalid snap mode values', () => {
            editor.setSnapToRoadMode('invalid');
            expect(editor.snapToRoadMode.value).toBe('auto');
        });
    });

    describe('promoteToWaypoint', () => {
        it('adds intermediate point as waypoint', () => {
            // Add 3 points (indices 0, 1, 2) — 0 and 2 are auto-waypoints
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            const seg = editor.segments.value[0];
            // Remove point 1 from waypoints to simulate intermediate point
            seg.waypoints = [0, 2];

            const result = editor.promoteToWaypoint(0, 1);
            expect(result).toBe(true);
            expect(seg.waypoints).toContain(1);
        });

        it('returns false if already a waypoint', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            const seg = editor.segments.value[0];
            // point 0 is already a waypoint
            expect(editor.promoteToWaypoint(0, 0)).toBe(false);
        });

        it('returns false for invalid index', () => {
            expect(editor.promoteToWaypoint(0, 99)).toBe(false);
            expect(editor.promoteToWaypoint(5, 0)).toBe(false);
        });
    });

    describe('deleteLastPoint', () => {
        it('deletes the last point from active segment', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            expect(editor.segments.value[0].points).toHaveLength(2);

            editor.deleteLastPoint();
            expect(editor.segments.value[0].points).toHaveLength(1);
        });

        it('returns false for empty segment', () => {
            expect(editor.deleteLastPoint()).toBe(false);
        });
    });

    describe('joinSegments', () => {
        it('merges two adjacent segments', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addSegment();
            editor.addWaypoint(50.02, 30.02);
            editor.addWaypoint(50.03, 30.03);
            expect(editor.segments.value).toHaveLength(2);

            editor.joinSegments(0, 1);
            expect(editor.segments.value).toHaveLength(1);
            expect(editor.segments.value[0].points).toHaveLength(4);
        });

        it('returns false for non-adjacent segments', () => {
            editor.addSegment();
            editor.addSegment();
            expect(editor.joinSegments(0, 2)).toBe(false);
        });

        it('returns false if both segments are empty', () => {
            editor.addSegment();
            expect(editor.joinSegments(0, 1)).toBe(false);
        });
    });

    describe('closeLoop', () => {
        it('connects last point to first point', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            const countBefore = editor.segments.value[0].points.length;

            editor.closeLoop();
            const seg = editor.segments.value[0];
            expect(seg.points).toHaveLength(countBefore + 1);
            expect(seg.points[seg.points.length - 1]).toEqual(seg.points[0]);
        });

        it('returns false for segment with less than 3 points', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            expect(editor.closeLoop()).toBe(false);
        });
    });

    describe('shortcutBetweenPoints', () => {
        it('removes points between two indices', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);
            editor.addWaypoint(50.03, 30.03);
            editor.addWaypoint(50.04, 30.04);

            const result = editor.shortcutBetweenPoints(0, 0, 4);
            expect(result).toBe(true);
            // Should keep only first and last
            expect(editor.segments.value[0].points).toHaveLength(2);
        });

        it('returns false when points are adjacent', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            expect(editor.shortcutBetweenPoints(0, 0, 1)).toBe(false);
        });

        it('returns false for invalid indices', () => {
            expect(editor.shortcutBetweenPoints(0, -1, 5)).toBe(false);
            expect(editor.shortcutBetweenPoints(99, 0, 1)).toBe(false);
        });
    });

    describe('extractSegmentAsTrack', () => {
        it('returns GeoJSON and name for valid segment', () => {
            editor.trackName.value = 'Test Track';
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);

            const result = editor.extractSegmentAsTrack(0);
            expect(result).not.toBeNull();
            expect(result.geometry.type).toBe('MultiLineString');
            expect(result.geometry.coordinates).toHaveLength(1);
            expect(result.name).toContain('segment 1');
        });

        it('returns null for segment with less than 2 points', () => {
            editor.addWaypoint(50.0, 30.0);
            expect(editor.extractSegmentAsTrack(0)).toBeNull();
        });

        it('returns null for invalid segment index', () => {
            expect(editor.extractSegmentAsTrack(99)).toBeNull();
        });
    });

    describe('cutSegmentAt', () => {
        it('inserts a point and splits segment', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);
            editor.addWaypoint(50.02, 30.02);

            const ok = editor.cutSegmentAt(0, 0, 50.005, 30.005);
            expect(ok).toBe(true);
            expect(editor.segments.value).toHaveLength(2);
        });
    });

    describe('createTrackFromSegment', () => {
        it('creates a new track from a segment', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ id: 'segment-track-1' }),
            }));

            editor.trackName.value = 'My Track';
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.01, 30.01);

            const result = await editor.createTrackFromSegment(0);
            expect(result.ok).toBe(true);
            expect(result.id).toBe('segment-track-1');

            const [url, options] = fetch.mock.calls[0];
            expect(url).toBe('/api/tracks/create');
            expect(options.method).toBe('POST');
        });
    });

    describe('duplicateTrack', () => {
        it('duplicates an existing track', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ id: 'dup-123' }),
            }));

            editor.savedTrackId.value = 'existing-123';
            const result = await editor.duplicateTrack();
            expect(result.ok).toBe(true);
            expect(result.id).toBe('dup-123');
        });
    });

    describe('POI operations', () => {
        it('addPoi adds a POI to the list', () => {
            const result = editor.addPoi(50.0, 30.0, 'Water Source');
            expect(result.ok).toBe(true);
            expect(editor.pois.value).toHaveLength(1);
            expect(editor.pois.value[0].name).toBe('Water Source');
        });

        it('addPoi rejects invalid coordinates', () => {
            expect(editor.addPoi(200, 30, 'Bad POI').ok).toBe(false);
            expect(editor.pois.value).toHaveLength(0);
        });

        it('addPoi auto-names when empty name provided', () => {
            const result = editor.addPoi(50.0, 30.0, '');
            expect(result.ok).toBe(true);
            expect(editor.pois.value[0].name).toMatch(/^POI\s\d{3}$/);
        });

        it('updatePoi updates POI properties', async () => {
            editor.addPoi(50.0, 30.0, 'Old Name');
            const result = await editor.updatePoi(0, { name: 'New Name', category: 'water' });
            expect(result.ok).toBe(true);
            expect(editor.pois.value[0].name).toBe('New Name');
            expect(editor.pois.value[0].category).toBe('water');
        });

        it('updatePoi rejects empty name', async () => {
            editor.addPoi(50.0, 30.0, 'POI');
            const result = await editor.updatePoi(0, { name: '' });
            expect(result.ok).toBe(false);
        });

        it('updatePoi returns false for invalid index', async () => {
            const result = await editor.updatePoi(0, { name: 'test' });
            expect(result.ok).toBe(false);
        });

        it('deletePoi removes a POI', async () => {
            editor.addPoi(50.0, 30.0, 'POI 1');
            editor.addPoi(51.0, 31.0, 'POI 2');
            const result = await editor.deletePoi(0);
            expect(result.ok).toBe(true);
            expect(editor.pois.value).toHaveLength(1);
            expect(editor.pois.value[0].name).toBe('POI 2');
        });

        it('deletePoi returns false for invalid index', async () => {
            const result1 = await editor.deletePoi(-1);
            const result2 = await editor.deletePoi(0);
            expect(result1.ok).toBe(false);
            expect(result2.ok).toBe(false);
        });
    });

    describe('estimatedTimeMinutes', () => {
        it('returns 0 for empty track', () => {
            expect(editor.estimatedTimeMinutes.value).toBe(0);
        });

        it('uses default 5 km/h for unknown category', () => {
            // Add 2 points ~1km apart (roughly)
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.009, 30.0); // ~1km north
            const dist = editor.totalDistanceKm.value;
            // Time = (dist / 5) * 60 minutes
            const expected = (dist / 5) * 60;
            expect(editor.estimatedTimeMinutes.value).toBeCloseTo(expected, 1);
        });

        it('uses category-specific speed', () => {
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.009, 30.0);
            const dist = editor.totalDistanceKm.value;

            editor.trackCategories.value = ['cycling'];
            // Cycling = 20 km/h
            const expected = (dist / 20) * 60;
            expect(editor.estimatedTimeMinutes.value).toBeCloseTo(expected, 1);
        });

        it('applies slope penalty when elevation gain is steep', () => {
            editor.trackCategories.value = ['hiking'];
            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(50.009, 30.0); // ~1km
            const dist = editor.totalDistanceKm.value;

            editor.elevationStats.value = { gain: 200 };
            const expected = (dist / (5 * 0.5)) * 60;
            expect(editor.estimatedTimeMinutes.value).toBeCloseTo(expected, 1);
        });
    });

    describe('optimizer preview', () => {
        it('stores preview data from backend', async () => {
            const previewResponse = {
                geometry: {
                    type: 'MultiLineString',
                    coordinates: [[[30.0, 50.0], [31.0, 51.0]]],
                },
                waypoints: [[0, 1]],
                original_points: 2,
                simplified_points: 2,
                compression_ratio: 1,
                tolerance_used: 0,
            };

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(previewResponse),
            }));

            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            const ok = await editor.previewOptimization(0.5);
            expect(ok).toBe(true);
            expect(editor.optimizerPreview.value).not.toBeNull();
            expect(editor.optimizerPreview.value.segments[0]).toEqual([
                [50.0, 30.0],
                [51.0, 31.0],
            ]);
            expect(editor.optimizerStats.value.originalPoints).toBe(2);
        });

        it('applies optimization preview to segments', async () => {
            const previewResponse = {
                geometry: {
                    type: 'LineString',
                    coordinates: [[30.0, 50.0], [31.0, 51.0]],
                },
                waypoints: [[0, 1]],
                original_points: 2,
                simplified_points: 2,
                compression_ratio: 1,
                tolerance_used: 0,
            };

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(previewResponse),
            }));

            editor.addWaypoint(50.0, 30.0);
            editor.addWaypoint(51.0, 31.0);

            await editor.previewOptimization(0.5);
            const applied = editor.applyOptimizationPreview();
            expect(applied).toBe(true);
            expect(editor.segments.value[0].points).toHaveLength(2);
            expect(editor.optimizerPreview.value).toBeNull();
        });
    });

    describe('exportTrack', () => {
        it('returns false for unsaved track', async () => {
            const result = await editor.exportTrack('gpx');
            expect(result).toBe(false);
            expect(editor.error.value).toContain('Save the track');
        });
    });
});
