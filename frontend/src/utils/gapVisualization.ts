import type { LatLngTuple } from '@/types';

const SEGMENT_COLORS: string[] = [
    '#d62728', '#1f77b4', '#2ca02c', '#ff7f0e', '#9467bd', '#17becf', '#8c564b'
];

export function getSegmentColor(index: number): string {
    return SEGMENT_COLORS[index % SEGMENT_COLORS.length] ?? '#d62728';
}

export function buildSegmentColors(count: number): string[] {
    if (!count || count <= 0) return [];
    return Array.from({ length: count }, (_, idx) => getSegmentColor(idx));
}

export function formatGapDistance(distanceM: number | null | undefined): string {
    if (distanceM == null || Number.isNaN(distanceM)) return 'N/A';
    if (distanceM >= 1000) {
        return `${(distanceM / 1000).toFixed(1)} km`;
    }
    return `${distanceM.toFixed(0)} m`;
}

export function formatGapDuration(seconds: number | null | undefined): string | null {
    if (seconds == null || Number.isNaN(seconds) || seconds < 0) return null;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

interface SegmentGap {
    from?: { lat: number; lon: number; segment_index: number };
    to?: { lat: number; lon: number; segment_index: number };
    distance_m: number;
    duration_seconds: number;
}

interface GapMarker {
    id: string;
    position: LatLngTuple | null;
    label: string;
    detail: string;
}

export function buildSegmentGapMarkers(segmentGaps: SegmentGap[]): GapMarker[] {
    if (!Array.isArray(segmentGaps) || segmentGaps.length === 0) return [];

    return segmentGaps.flatMap((gap, idx) => {
        const distanceLabel = formatGapDistance(gap?.distance_m);
        const durationLabel = formatGapDuration(gap?.duration_seconds);
        const detail = `Segment ${(gap?.from?.segment_index ?? 0) + 1} → ${(gap?.to?.segment_index ?? 0) + 1} gap • ${distanceLabel}${durationLabel ? ` • ${durationLabel}` : ''}`;

        return [
            {
                id: `segment-gap-${idx}-from`,
                position: gap?.from ? [gap.from.lat, gap.from.lon] as LatLngTuple : null,
                label: `End of segment ${(gap?.from?.segment_index ?? 0) + 1}`,
                detail
            },
            {
                id: `segment-gap-${idx}-to`,
                position: gap?.to ? [gap.to.lat, gap.to.lon] as LatLngTuple : null,
                label: `Start of segment ${(gap?.to?.segment_index ?? 0) + 1}`,
                detail
            }
        ].filter(entry => Array.isArray(entry.position));
    });
}

interface PauseGap {
    from: { lat: number; lon: number };
    to: { lat: number; lon: number };
    distance_m: number;
    duration_seconds: number;
}

interface PauseGapLine {
    id: string;
    latlngs: [LatLngTuple, LatLngTuple];
    label: string;
    color: string;
}

export function buildPauseGapLines(pauseGaps: PauseGap[]): PauseGapLine[] {
    if (!Array.isArray(pauseGaps) || pauseGaps.length === 0) return [];

    return pauseGaps
        .filter(gap => gap?.from && gap?.to)
        .map((gap, idx) => {
            const distanceLabel = formatGapDistance(gap.distance_m);
            const durationLabel = formatGapDuration(gap.duration_seconds);
            return {
                id: `pause-gap-${idx}`,
                latlngs: [
                    [gap.from.lat, gap.from.lon] as LatLngTuple,
                    [gap.to.lat, gap.to.lon] as LatLngTuple
                ],
                label: `Pause gap • ${distanceLabel}${durationLabel ? ` • ${durationLabel}` : ''}`,
                color: '#6c6f7a'
            };
        });
}

interface BoundaryMarker {
    id: string;
    position: LatLngTuple;
    label: string;
    color: string;
}

export function buildBoundaryMarkers(segments: LatLngTuple[][], colors?: string[]): BoundaryMarker[] {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const palette = Array.isArray(colors) ? colors : [];

    return segments.flatMap((segment, idx) => {
        if (!Array.isArray(segment) || segment.length === 0) return [];
        const start = segment[0];
        const end = segment[segment.length - 1];
        if (!start || !end) return [];
        const color = palette[idx] || '#1f2937';

        return [
            {
                id: `segment-${idx}-start`,
                position: start,
                label: `Segment ${idx + 1} start`,
                color
            },
            {
                id: `segment-${idx}-end`,
                position: end,
                label: `Segment ${idx + 1} end`,
                color
            }
        ];
    });
}
