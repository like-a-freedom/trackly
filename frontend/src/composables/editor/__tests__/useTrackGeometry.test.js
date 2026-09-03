import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackGeometry } from '../useTrackGeometry';

describe('useTrackGeometry', () => {
    let geometry;

    beforeEach(() => {
        geometry = useTrackGeometry();
    });

    it('initializes with one empty segment', () => {
        expect(geometry.segments.value).toHaveLength(1);
        expect(geometry.segments.value[0].points).toEqual([]);
    });

    it('initializes with provided segments', () => {
        const initialSegments = [{ points: [[50, 14]], waypoints: [0], surfaceTypes: ['unknown'], name: 'Seg 1', color: '#1976D2' }];
        const result = useTrackGeometry({ initialSegments });
        expect(result.segments.value).toEqual(initialSegments);
    });

    it('returns active segment', () => {
        expect(geometry.activeSegment.value).toEqual(geometry.segments.value[0]);
    });

    it('calculates total points', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.1, 14.1]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'], name: null, color: '#1976D2' },
            { points: [[51, 15]], waypoints: [0], surfaceTypes: ['unknown'], name: null, color: '#D32F2F' },
        ];
        expect(geometry.totalPoints.value).toBe(3);
    });

    it('calculates total distance', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.001, 14]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'], name: null, color: '#1976D2' },
        ];
        expect(geometry.totalDistanceKm.value).toBeGreaterThan(0);
    });

    it('returns coordinate data', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.1, 14.1]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'], name: null, color: '#1976D2' },
        ];
        expect(geometry.coordinateData.value).toHaveLength(2);
    });

    it('returns segment stats', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.1, 14.1]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'], name: null, color: '#1976D2' },
        ];
        const stats = geometry.segmentStats.value;
        expect(stats).toHaveLength(1);
        expect(stats[0].pointCount).toBe(2);
    });

    it('creates empty segment', () => {
        const seg = geometry.createEmptySegment(0);
        expect(seg.points).toEqual([]);
        expect(seg.waypoints).toEqual([]);
        expect(seg.color).toBe('#1976D2');
    });

    it('creates segment with correct color for index', () => {
        const seg0 = geometry.createEmptySegment(0);
        expect(seg0.color).toBe('#1976D2');
        const seg1 = geometry.createEmptySegment(1);
        expect(seg1.color).toBe('#D32F2F');
    });

    it('ensures surface types match points length', () => {
        const seg = { points: [[50, 14], [50.1, 14.1]], waypoints: [0, 1], surfaceTypes: [], name: null, color: '#1976D2' };
        geometry.ensureSurfaceTypes(seg);
        expect(seg.surfaceTypes).toHaveLength(2);
    });

    it('normalizes waypoints', () => {
        const seg = { points: [[50, 14], [50.1, 14.1], [50.2, 14.2]], waypoints: [1], surfaceTypes: ['unknown', 'unknown', 'unknown'], name: null, color: '#1976D2' };
        geometry.normalizeWaypoints(seg);
        expect(seg.waypoints).toEqual([0, 1, 2]);
    });

    it('sets segment name', () => {
        const result = geometry.setSegmentName(0, 'Test Segment');
        expect(result).toBe(true);
        expect(geometry.segments.value[0].name).toBe('Test Segment');
    });

    it('sets segment color', () => {
        const result = geometry.setSegmentColor(0, '#FF0000');
        expect(result).toBe(true);
        expect(geometry.segments.value[0].color).toBe('#FF0000');
    });

    it('rejects invalid color', () => {
        const result = geometry.setSegmentColor(0, 'invalid');
        expect(result).toBe(false);
    });

    it('promotes point to waypoint', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.1, 14.1], [50.2, 14.2]], waypoints: [0, 2], surfaceTypes: ['unknown', 'unknown', 'unknown'], name: null, color: '#1976D2' },
        ];
        const result = geometry.promoteToWaypoint(0, 1);
        expect(result).toBe(true);
        expect(geometry.segments.value[0].waypoints).toContain(1);
    });

    it('adds segment', () => {
        const index = geometry.addSegment();
        expect(index).toBe(1);
        expect(geometry.segments.value).toHaveLength(2);
    });

    it('deletes segment', () => {
        geometry.addSegment();
        const result = geometry.deleteSegment(1);
        expect(result).toBe(true);
        expect(geometry.segments.value).toHaveLength(1);
    });

    it('sets active segment', () => {
        geometry.addSegment();
        geometry.setActiveSegment(1);
        expect(geometry.activeSegmentIndex.value).toBe(1);
    });

    it('reverses segment', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.1, 14.1], [50.2, 14.2]], waypoints: [0, 2], surfaceTypes: ['unknown', 'unknown', 'unknown'], name: null, color: '#1976D2' },
        ];
        geometry.reverseSegment(0);
        expect(geometry.segments.value[0].points[0]).toEqual([50.2, 14.2]);
    });

    it('reverses track', () => {
        geometry.segments.value = [
            { points: [[50, 14], [50.1, 14.1]], waypoints: [0, 1], surfaceTypes: ['unknown', 'unknown'], name: null, color: '#1976D2' },
        ];
        geometry.reverseTrack();
        expect(geometry.segments.value[0].points[0]).toEqual([50.1, 14.1]);
    });

    it('gets segment by index', () => {
        const seg = geometry.getSegment(0);
        expect(seg).toEqual(geometry.segments.value[0]);
    });

    it('clears segments', () => {
        geometry.addSegment();
        geometry.clearSegments();
        expect(geometry.segments.value).toHaveLength(1);
        expect(geometry.activeSegmentIndex.value).toBe(0);
    });
});
