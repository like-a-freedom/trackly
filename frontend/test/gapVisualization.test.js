import { describe, expect, it } from 'vitest';
import {
    buildBoundaryMarkers,
    buildPauseGapLines,
    buildSegmentColors,
    buildSegmentGapMarkers
} from '../src/utils/gapVisualization';

describe('gapVisualization utils', () => {
    it('buildSegmentColors repeats palette predictably', () => {
        const colors = buildSegmentColors(8);
        expect(colors).toHaveLength(8);
        expect(colors[0]).toBe(colors[7]);
    });

    it('buildBoundaryMarkers emits start and end markers per segment', () => {
        const segments = [
            [
                [10, 20],
                [11, 21]
            ],
            [
                [12, 22],
                [13, 23]
            ]
        ];
        const markers = buildBoundaryMarkers(segments, ['#111', '#222']);
        expect(markers).toHaveLength(4);
        expect(markers[0].label).toContain('start');
        expect(markers[1].label).toContain('end');
        expect(markers[2].color).toBe('#222');
    });

    it('buildSegmentGapMarkers formats distance and segment info', () => {
        const markers = buildSegmentGapMarkers([
            {
                kind: 'segment',
                from: { lat: 0, lon: 0, segment_index: 0, point_index: 1 },
                to: { lat: 0, lon: 0.001, segment_index: 1, point_index: 0 },
                distance_m: 1200,
                duration_seconds: null
            }
        ]);

        expect(markers).toHaveLength(2);
        expect(markers[0].detail).toContain('1.2 km');
        expect(markers[0].label).toContain('segment 1');
        expect(markers[1].label).toContain('segment 2');
    });

    it('buildPauseGapLines includes distance and duration in label', () => {
        const lines = buildPauseGapLines([
            {
                from: { lat: 0, lon: 0 },
                to: { lat: 0, lon: 0.001 },
                distance_m: 1500,
                duration_seconds: 300
            }
        ]);

        expect(lines).toHaveLength(1);
        expect(lines[0].latlngs[0]).toEqual([0, 0]);
        expect(lines[0].label).toContain('1.5 km');
        expect(lines[0].label).toContain('5m');
    });
});
