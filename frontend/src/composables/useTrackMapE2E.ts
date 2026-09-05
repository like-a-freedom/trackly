// @ts-nocheck - Complex types
import type { Ref } from "vue";

/**
 * E2E testing utilities for TrackMap
 * Exposes hooks for automated testing in non-production environments
 */

interface E2EWindow {
    getMapCenter?: () => { lat: number | null; lng: number | null };
    _lastMapInstance?: L.Map;
    isMapIdle?: () => boolean;
    lastGapLineExists?: boolean;
    lastHighlightedColor?: string | null;
    forceHighlightSegment?: (lat: number, lng: number, segmentIndex?: number) => boolean;
}

interface UseTrackMapE2EOptions {
    isPanningOrZooming: Ref<boolean>;
    mapIsReady: Ref<boolean>;
    trackZoomAnimating: Ref<boolean>;
    props: {
        selectedTrackDetail?: { id?: string };
        [key: string]: unknown;
    };
    highlightSegmentForMarker: (data: {
        latlng: [number, number];
        segmentIndex: number;
        isFixed: boolean;
    }) => void;
}

export function useTrackMapE2E({
    isPanningOrZooming,
    mapIsReady,
    trackZoomAnimating,
    props,
    highlightSegmentForMarker
}: UseTrackMapE2EOptions) {
    // Only initialize in non-production modes
    if (import.meta.env.MODE === 'production') {
        return { initE2E: () => { }, cleanup: () => { } };
    }

    const initE2E = (map: L.Map) => {
        if (!map) return;

        const e2e = ((window as unknown as { __e2e?: E2EWindow }).__e2e ??= {});

        e2e.getMapCenter = () => {
            try {
                const c = map.getCenter();
                return { lat: c?.lat ?? null, lng: c?.lng ?? null };
            } catch (e) {
                return { lat: null, lng: null };
            }
        };

        e2e._lastMapInstance = map;

        e2e.isMapIdle = () => {
            try {
                return !isPanningOrZooming.value && mapIsReady.value && !trackZoomAnimating.value;
            } catch (e) {
                return false;
            }
        };

        e2e.lastGapLineExists = false;
        e2e.lastHighlightedColor = null;

        e2e.forceHighlightSegment = (lat: number, lng: number, segmentIndex = 0) => {
            try {
                if (typeof lat === 'undefined' || typeof lng === 'undefined') return false;

                if (highlightSegmentForMarker) {
                    try {
                        if (window.__e2e) {
                            window.__e2e.lastGapLineExists = false;
                            window.__e2e.lastHighlightedColor = null;
                        }
                        highlightSegmentForMarker({
                            latlng: [lat, lng],
                            segmentIndex,
                            isFixed: false
                        });
                    } catch (e) {
                        console.warn('E2E forceHighlightSegment highlight failed:', e);
                    }
                }

                const mapInstance = (window as unknown as { __e2e?: E2EWindow }).__e2e?._lastMapInstance;
                if (!mapInstance) return false;

                let foundLayer: L.Layer | null = null;
                mapInstance.eachLayer((layer) => {
                    if (!foundLayer && (layer as L.Layer & { feature?: { properties?: { id?: string } } }).feature?.properties?.id === props.selectedTrackDetail?.id) {
                        foundLayer = layer;
                    }
                });

                if (!foundLayer || typeof (foundLayer as L.Marker).getLatLngs !== 'function') return false;

                const latlngs = (foundLayer as unknown as { getLatLngs: () => L.LatLngExpression[] | L.LatLngExpression[][] }).getLatLngs();
                const segments = Array.isArray(latlngs[0]) ? latlngs as L.LatLngExpression[][] : [latlngs] as L.LatLngExpression[][];
                const seg = segments[segmentIndex] || segments[0];

                let best: [number, number] | null = null;
                let bestDist = Infinity;
                for (let i = 0; i < seg.length; i++) {
                    const point = seg[i] as L.LatLngTuple;
                    const d = (point[0] - lat) ** 2 + (point[1] - lng) ** 2;
                    if (d < bestDist) {
                        bestDist = d;
                        best = [point[0], point[1]];
                    }
                }
                if (best && window.__e2e) {
                    try {
                        window.__e2e.lastGapLineExists = true;
                    } catch (e) { }
                }

                return !!best;
            } catch (e) {
                console.warn('E2E forceHighlightSegment failed:', e);
                return false;
            }
        };
    };

    const cleanup = () => {
        const e2e = (window as unknown as { __e2e?: E2EWindow }).__e2e;
        if (e2e) {
            delete e2e.getMapCenter;
            delete e2e._lastMapInstance;
            delete e2e.isMapIdle;
            delete e2e.forceHighlightSegment;
        }
    };

    return { initE2E, cleanup };
}
