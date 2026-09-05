import { describe, it, expect } from 'vitest';
import {
    getSegmentColor,
    buildSegmentColors,
    formatGapDistance,
    formatGapDuration,
    buildSegmentGapMarkers,
    buildPauseGapLines,
    buildBoundaryMarkers,
} from '../gapVisualization';

describe('gapVisualization', () => {
    describe('getSegmentColor', () => {
        it('returns color for index', () => {
            expect(getSegmentColor(0)).toBe('#d62728');
            expect(getSegmentColor(1)).toBe('#1f77b4');
        });

        it('cycles through colors', () => {
            expect(getSegmentColor(7)).toBe('#d62728');
            expect(getSegmentColor(8)).toBe('#1f77b4');
        });
    });

    describe('buildSegmentColors', () => {
        it('returns empty array for zero count', () => {
            expect(buildSegmentColors(0)).toEqual([]);
        });

        it('returns empty array for negative count', () => {
            expect(buildSegmentColors(-1)).toEqual([]);
        });

        it('returns colors for count', () => {
            const colors = buildSegmentColors(3);
            expect(colors).toHaveLength(3);
            expect(colors[0]).toBe('#d62728');
        });
    });

    describe('formatGapDistance', () => {
        it('returns N/A for null', () => {
            expect(formatGapDistance(null)).toBe('N/A');
        });

        it('returns N/A for undefined', () => {
            expect(formatGapDistance(undefined)).toBe('N/A');
        });

        it('returns N/A for NaN', () => {
            expect(formatGapDistance(NaN)).toBe('N/A');
        });

        it('formats meters', () => {
            expect(formatGapDistance(500)).toBe('500 m');
        });

        it('formats kilometers', () => {
            expect(formatGapDistance(1500)).toBe('1.5 km');
        });

        it('formats exactly 1km', () => {
            expect(formatGapDistance(1000)).toBe('1.0 km');
        });
    });

    describe('formatGapDuration', () => {
        it('returns null for null', () => {
            expect(formatGapDuration(null)).toBeNull();
        });

        it('returns null for undefined', () => {
            expect(formatGapDuration(undefined)).toBeNull();
        });

        it('returns null for NaN', () => {
            expect(formatGapDuration(NaN)).toBeNull();
        });

        it('returns null for negative', () => {
            expect(formatGapDuration(-1)).toBeNull();
        });

        it('formats seconds only', () => {
            expect(formatGapDuration(30)).toBe('30s');
        });

        it('formats minutes and seconds', () => {
            expect(formatGapDuration(90)).toBe('1m 30s');
        });

        it('formats hours and minutes', () => {
            expect(formatGapDuration(3661)).toBe('1h 1m');
        });
    });

    describe('buildSegmentGapMarkers', () => {
        it('returns empty array for empty input', () => {
            expect(buildSegmentGapMarkers([])).toEqual([]);
        });

        it('returns empty array for non-array', () => {
            expect(buildSegmentGapMarkers(null as any)).toEqual([]);
        });

        it('builds markers for gaps', () => {
            const gaps = [
                {
                    from: { lat: 50, lon: 30, segment_index: 0 },
                    to: { lat: 51, lon: 31, segment_index: 1 },
                    distance_m: 1000,
                    duration_seconds: 60,
                },
            ];

            const markers = buildSegmentGapMarkers(gaps);
            expect(markers).toHaveLength(2);
            expect(markers[0].id).toBe('segment-gap-0-from');
            expect(markers[1].id).toBe('segment-gap-0-to');
        });

        it('filters out markers with null positions', () => {
            const gaps = [
                {
                    from: null as any,
                    to: { lat: 51, lon: 31, segment_index: 1 },
                    distance_m: 1000,
                    duration_seconds: 60,
                },
            ];

            const markers = buildSegmentGapMarkers(gaps);
            expect(markers).toHaveLength(1);
        });
    });

    describe('buildPauseGapLines', () => {
        it('returns empty array for empty input', () => {
            expect(buildPauseGapLines([])).toEqual([]);
        });

        it('returns empty array for non-array', () => {
            expect(buildPauseGapLines(null as any)).toEqual([]);
        });

        it('builds lines for pause gaps', () => {
            const gaps = [
                {
                    from: { lat: 50, lon: 30 },
                    to: { lat: 51, lon: 31 },
                    distance_m: 100,
                    duration_seconds: 30,
                },
            ];

            const lines = buildPauseGapLines(gaps);
            expect(lines).toHaveLength(1);
            expect(lines[0].id).toBe('pause-gap-0');
            expect(lines[0].color).toBe('#6c6f7a');
        });

        it('filters out gaps without from/to', () => {
            const gaps = [
                { from: null as any, to: null as any, distance_m: 100, duration_seconds: 30 },
            ];

            const lines = buildPauseGapLines(gaps);
            expect(lines).toEqual([]);
        });
    });

    describe('buildBoundaryMarkers', () => {
        it('returns empty array for empty input', () => {
            expect(buildBoundaryMarkers([])).toEqual([]);
        });

        it('returns empty array for non-array', () => {
            expect(buildBoundaryMarkers(null as any)).toEqual([]);
        });

        it('builds markers for segments', () => {
            const segments = [
                [[50, 30], [51, 31]] as [number, number][],
                [[52, 32], [53, 33]] as [number, number][],
            ];

            const markers = buildBoundaryMarkers(segments);
            expect(markers).toHaveLength(4);
            expect(markers[0].id).toBe('segment-0-start');
            expect(markers[1].id).toBe('segment-0-end');
        });

        it('uses custom colors', () => {
            const segments = [
                [[50, 30], [51, 31]] as [number, number][],
            ];

            const markers = buildBoundaryMarkers(segments, ['#FF0000']);
            expect(markers[0].color).toBe('#FF0000');
        });

        it('skips empty segments', () => {
            const segments = [
                [] as [number, number][],
                [[52, 32], [53, 33]] as [number, number][],
            ];

            const markers = buildBoundaryMarkers(segments);
            expect(markers).toHaveLength(2);
        });
    });
});
