const SEGMENT_COLORS = [
    '#d62728', '#1f77b4', '#2ca02c', '#ff7f0e', '#9467bd', '#17becf', '#8c564b'
];

export function getSegmentColor(index) {
    return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

export function buildSegmentColors(count) {
    if (!count || count <= 0) return [];
    return Array.from({ length: count }, (_, idx) => getSegmentColor(idx));
}

export function formatGapDistance(distanceM) {
    if (distanceM == null || Number.isNaN(distanceM)) return 'N/A';
    if (distanceM >= 1000) {
        return `${(distanceM / 1000).toFixed(1)} km`;
    }
    return `${distanceM.toFixed(0)} m`;
}

export function formatGapDuration(seconds) {
    if (seconds == null || Number.isNaN(seconds) || seconds < 0) return null;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

export function buildSegmentGapMarkers(segmentGaps) {
    if (!Array.isArray(segmentGaps) || segmentGaps.length === 0) return [];

    return segmentGaps.flatMap((gap, idx) => {
        const distanceLabel = formatGapDistance(gap?.distance_m);
        const durationLabel = formatGapDuration(gap?.duration_seconds);
        const detail = `Segment ${(gap?.from?.segment_index ?? 0) + 1} → ${(gap?.to?.segment_index ?? 0) + 1} gap • ${distanceLabel}${durationLabel ? ` • ${durationLabel}` : ''}`;

        return [
            {
                id: `segment-gap-${idx}-from`,
                position: gap?.from ? [gap.from.lat, gap.from.lon] : null,
                label: `End of segment ${(gap?.from?.segment_index ?? 0) + 1}`,
                detail
            },
            {
                id: `segment-gap-${idx}-to`,
                position: gap?.to ? [gap.to.lat, gap.to.lon] : null,
                label: `Start of segment ${(gap?.to?.segment_index ?? 0) + 1}`,
                detail
            }
        ].filter(entry => Array.isArray(entry.position));
    });
}

export function buildPauseGapLines(pauseGaps) {
    if (!Array.isArray(pauseGaps) || pauseGaps.length === 0) return [];

    return pauseGaps
        .filter(gap => gap?.from && gap?.to)
        .map((gap, idx) => {
            const distanceLabel = formatGapDistance(gap.distance_m);
            const durationLabel = formatGapDuration(gap.duration_seconds);
            return {
                id: `pause-gap-${idx}`,
                latlngs: [
                    [gap.from.lat, gap.from.lon],
                    [gap.to.lat, gap.to.lon]
                ],
                label: `Pause gap • ${distanceLabel}${durationLabel ? ` • ${durationLabel}` : ''}`,
                color: '#6c6f7a'
            };
        });
}

export function buildBoundaryMarkers(segments, colors) {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const palette = Array.isArray(colors) ? colors : [];

    return segments.flatMap((segment, idx) => {
        if (!Array.isArray(segment) || segment.length === 0) return [];
        const start = segment[0];
        const end = segment[segment.length - 1];
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
