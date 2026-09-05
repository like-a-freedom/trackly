// @ts-nocheck - Complex Leaflet internal types
import { ref } from "vue";
import type { Ref } from "vue";
import {
    POLYLINE_WEIGHT_ACTIVE,
    POLYLINE_WEIGHT_SELECTED_DETAIL,
    POLYLINE_WEIGHT_DEFAULT,
    POLYLINE_OPACITY_ACTIVE,
    POLYLINE_OPACITY_HOVER_DIM,
    POLYLINE_OPACITY_SELECTED_DETAIL,
    POLYLINE_OPACITY_DEFAULT,
} from "../utils/mapConstants";

interface Polyline {
    properties?: {
        id?: string;
        color?: string;
        [key: string]: unknown;
    };
    latlngs?: L.LatLngExpression[] | L.LatLngExpression[][];
    color?: string;
    segments?: L.LatLngExpression[][];
    [key: string]: unknown;
}

interface TrackDetail {
    id?: string;
    [key: string]: unknown;
}

interface MarkerData {
    latlng: L.LatLngExpression;
    segmentIndex?: number;
    isFixed?: boolean;
}

interface HighlightedLayerStyle {
    color: string | null;
    weight: number;
    opacity: number;
}

interface UseSegmentHighlightDeps {
    isZoomAnimating?: Ref<boolean> | (() => boolean);
    isUnmounting?: Ref<boolean> | (() => boolean);
    isPanningOrZooming?: Ref<boolean> | (() => boolean);
    getMapObject?: ((ctx?: string) => L.Map | null) | Ref<((ctx?: string) => L.Map | null)>;
    getSelectedTrackDetail?: (() => TrackDetail | null) | Ref<TrackDetail | null>;
    getPolylines?: (() => Polyline[]) | Ref<Polyline[]>;
    getActiveTrackId?: (() => string | null) | Ref<string | null>;
}

interface UseSegmentHighlightReturn {
    hoveredMarkerPolyline: Ref<L.Polyline | null>;
    hoveredMarker: Ref<L.Marker | null>;
    hoveredSegmentPolyline: Ref<L.Polyline | null>;
    markerGapLine: Ref<L.Polyline | null>;
    highlightedLayer: Ref<L.Layer | null>;
    highlightedLayerOrigStyle: Ref<HighlightedLayerStyle | null>;
    lastAutoPanTarget: Ref<L.LatLngExpression | null>;
    getPolylineWeight: (poly: Polyline) => number;
    getPolylineOpacity: (poly: Polyline) => number;
    getFeatureWeight: (feature: GeoJSON.Feature) => number;
    getFeatureOpacity: (feature: GeoJSON.Feature) => number;
    geoJsonStyle: (feature: GeoJSON.Feature) => { color?: string; weight: number; opacity: number };
    getMarkerStrokeColor: (markerData: MarkerData) => string;
    getMarkerFillColor: (markerData: MarkerData) => string;
    performAutoPan: (latlng: L.LatLngExpression, map: L.Map | null) => void;
    showMarkerPolyline: (track: Polyline, map: L.Map | null, marker: L.Marker | null) => void;
    clearSegmentHighlight: (map: L.Map | null) => void;
    highlightSegmentForMarker: (markerData: MarkerData) => void;
    findNearestPointOnCoords: (point: L.LatLngExpression, coords: L.LatLngExpression[]) => L.LatLngTuple | null;
    removeMarkerPolyline: (map: L.Map | null) => void;
}

/**
 * Composable that encapsulates hover / highlight logic for map segments.
 *
 * Originally extracted from TrackMap.vue to keep component markup lean
 * and make the highlighting behaviour independently testable.
 */
export function useSegmentHighlight(leafletAdapter: unknown, deps: UseSegmentHighlightDeps = {}): UseSegmentHighlightReturn {
    // ---------------------------------------------------------------------------
    // Safe window reference (undefined in Node test environments)
    // ---------------------------------------------------------------------------
    const _w = typeof window !== "undefined" ? window : undefined;

    // ---------------------------------------------------------------------------
    // Internal reactive state
    // ---------------------------------------------------------------------------
    const hoveredMarkerPolyline = ref<L.Polyline | null>(null);
    const hoveredMarker = ref<L.Marker | null>(null);
    const hoveredSegmentPolyline = ref<L.Polyline | null>(null);
    const markerGapLine = ref<L.Polyline | null>(null);
    // When highlighting a single-segment track we prefer to temporarily adjust the existing layer
    // instead of overlaying a new colored polyline (this preserves the original track color)
    const highlightedLayer = ref<L.Layer | null>(null);
    const highlightedLayerOrigStyle = ref<HighlightedLayerStyle | null>(null);
    // For testing/observability: record last auto-pan target
    const lastAutoPanTarget = ref<L.LatLngExpression | null>(null);

    // ---------------------------------------------------------------------------
    // Dependency accessors — resolve both ref (.value) and plain getter (fn())
    // patterns so the composable works with Vue refs in production *and*
    // simple objects in unit tests.
    // ---------------------------------------------------------------------------
    function _resolve<T>(dep: Ref<T> | (() => T) | T | undefined, fallback: T): T {
        if (dep == null) return fallback;
        if (typeof dep === "object" && "value" in dep) return (dep as Ref<T>).value;
        if (typeof dep === "function") return (dep as () => T)();
        return dep as T;
    }

    const _isZoomAnimating = () => _resolve(deps.isZoomAnimating, false);
    const _isUnmounting = () => _resolve(deps.isUnmounting, false);
    const _isPanningOrZooming = () => _resolve(deps.isPanningOrZooming, false);
    const _getMapObject = (ctx?: string): L.Map | null => {
        const d = deps.getMapObject;
        if (typeof d === "function") return d(ctx);
        if (d && typeof d === "object" && "value" in d && typeof (d as Ref<unknown>).value === "function") {
            return ((d as Ref<(ctx?: string) => L.Map | null>).value)(ctx);
        }
        return null;
    };
    const _getSelectedTrackDetail = () => _resolve(deps.getSelectedTrackDetail, null);
    const _getPolylines = () => _resolve(deps.getPolylines, []);
    const _getActiveTrackId = () => _resolve(deps.getActiveTrackId, null);

    // ---------------------------------------------------------------------------
    // Styling helpers
    // ---------------------------------------------------------------------------

    function getPolylineWeight(poly: Polyline): number {
        if (poly.properties && poly.properties.id === _getActiveTrackId()) {
            return POLYLINE_WEIGHT_ACTIVE;
        }
        if (_getSelectedTrackDetail()) {
            return POLYLINE_WEIGHT_SELECTED_DETAIL;
        }
        return POLYLINE_WEIGHT_DEFAULT;
    }

    function getPolylineOpacity(poly: Polyline): number {
        if (_getActiveTrackId()) {
            return poly.properties && poly.properties.id === _getActiveTrackId()
                ? POLYLINE_OPACITY_ACTIVE
                : POLYLINE_OPACITY_HOVER_DIM;
        }
        if (_getSelectedTrackDetail()) {
            return POLYLINE_OPACITY_SELECTED_DETAIL;
        }
        return POLYLINE_OPACITY_DEFAULT;
    }

    function getFeatureWeight(feature: GeoJSON.Feature): number {
        const props = feature.properties as { id?: string } | null;
        if (props && props.id === _getActiveTrackId()) {
            return POLYLINE_WEIGHT_ACTIVE;
        }
        if (_getSelectedTrackDetail()) {
            return POLYLINE_WEIGHT_SELECTED_DETAIL;
        }
        return POLYLINE_WEIGHT_DEFAULT;
    }

    function getFeatureOpacity(feature: GeoJSON.Feature): number {
        const props = feature.properties as { id?: string } | null;
        if (_getActiveTrackId()) {
            return props && props.id === _getActiveTrackId()
                ? POLYLINE_OPACITY_ACTIVE
                : POLYLINE_OPACITY_HOVER_DIM;
        }
        if (_getSelectedTrackDetail()) {
            return POLYLINE_OPACITY_SELECTED_DETAIL;
        }
        return POLYLINE_OPACITY_DEFAULT;
    }

    // GeoJSON layer styling function
    function geoJsonStyle(feature: GeoJSON.Feature): { color?: string; weight: number; opacity: number } {
        const props = feature.properties as { color?: string } | null;
        return {
            color: props?.color,
            weight: getFeatureWeight(feature),
            opacity: getFeatureOpacity(feature),
        };
    }

    // ---------------------------------------------------------------------------
    // Marker stroke / fill helpers
    // ---------------------------------------------------------------------------

    function getMarkerStrokeColor(markerData: MarkerData): string {
        // Default blue color for single-segment tracks or when segmentIndex is not provided
        if (!markerData.segmentIndex && markerData.segmentIndex !== 0) {
            return "#3B82F6"; // Default blue
        }

        // Use a color palette for multi-segment tracks
        const colors = [
            "#3B82F6", // Blue
            "#EF4444", // Red
            "#10B981", // Green
            "#F59E0B", // Amber
            "#8B5CF6", // Purple
            "#EC4899", // Pink
            "#14B8A6", // Teal
            "#F97316", // Orange
        ];

        return colors[markerData.segmentIndex! % colors.length] ?? "#3B82F6";
    }

    function getMarkerFillColor(markerData: MarkerData): string {
        // For fixed marker, use semi-transparent version of stroke color (alpha)
        const stroke = getMarkerStrokeColor(markerData) || "#3B82F6";
        // Tiny utility to add alpha to hex color (assumes #rrggbb)
        function withAlpha(hex: string, alpha: number): string {
            if (!hex || hex.length !== 7) return hex;
            const a = Math.round(alpha * 255)
                .toString(16)
                .padStart(2, "0");
            return `${hex}${a}`; // #rrggbbaa
        }
        return markerData && markerData.isFixed ? withAlpha(stroke, 0.28) : "white";
    }

    // ---------------------------------------------------------------------------
    // Hover / highlight functions
    // ---------------------------------------------------------------------------

    function performAutoPan(latlng: L.LatLngExpression, map: L.Map | null): void {
        lastAutoPanTarget.value = latlng;
        if (map && typeof map.panTo === "function") {
            try {
                map.panTo(latlng, { animate: true, duration: 0.25 });
            } catch (e) {
                // ignore pan errors
            }
        }
    }

    function showMarkerPolyline(track: Polyline, map: L.Map | null, marker: L.Marker | null): void {
        // Prevent hover polylines during zoom animations or unmounting to avoid conflicts
        if (
            !track ||
            !track.latlngs ||
            !map ||
            _isZoomAnimating() ||
            _isUnmounting()
        )
            return;

        try {
            removeMarkerPolyline(map);
            if (marker) {
                marker.setOpacity(0); // Hide marker
                hoveredMarker.value = marker;
            }
            const adapter = leafletAdapter as { createPolyline: (latlngs: L.LatLngExpression[], options: object) => L.Polyline; addLayer: (layer: L.Layer) => void };
            hoveredMarkerPolyline.value = adapter.createPolyline(track.latlngs as L.LatLngExpression[], {
                color: track.color || "#3388ff",
                weight: POLYLINE_WEIGHT_ACTIVE,
                opacity: POLYLINE_OPACITY_ACTIVE,
                pane: "overlayPane",
                interactive: false,
            });
            if (hoveredMarkerPolyline.value) {
                adapter.addLayer(hoveredMarkerPolyline.value);
            }
        } catch (error) {
            console.warn("[useSegmentHighlight] Error adding hover polyline:", error);
            // Clean up on error
            removeMarkerPolyline(map);
        }
    }

    function clearSegmentHighlight(map: L.Map | null): void {
        try {
            // If we had temporarily modified an existing GeoJSON layer (single-segment highlight), restore its style
            if (highlightedLayer.value && highlightedLayerOrigStyle.value) {
                try {
                    if (typeof highlightedLayer.value.setStyle === "function") {
                        highlightedLayer.value.setStyle(highlightedLayerOrigStyle.value);
                    }
                } catch (e) {
                    console.warn("[useSegmentHighlight] Error restoring highlighted layer style:", e);
                }
                highlightedLayer.value = null;
                highlightedLayerOrigStyle.value = null;
            }

            if (hoveredSegmentPolyline.value && map) {
                map.removeLayer(hoveredSegmentPolyline.value);
                hoveredSegmentPolyline.value = null;
            }
            if (markerGapLine.value && map) {
                map.removeLayer(markerGapLine.value);
                markerGapLine.value = null;
            }
            if (_w?.__e2e) {
                try {
                    _w.__e2e.lastGapLineExists = false;
                    _w.__e2e.lastHighlightedColor = null;
                } catch (e) {}
            }
        } catch (e) {
            console.warn("[useSegmentHighlight] Error clearing segment highlight:", e);
            hoveredSegmentPolyline.value = null;
            markerGapLine.value = null;
            highlightedLayer.value = null;
            highlightedLayerOrigStyle.value = null;
        }
    }

    function highlightSegmentForMarker(markerData: MarkerData): void {
        const map = _getMapObject("highlightSegmentForMarker");
        clearSegmentHighlight(map);
        // Allow fallback behavior in tests when map is not available (we still create polyline objects)
        if (
            !markerData ||
            !markerData.latlng ||
            _isPanningOrZooming() ||
            _isZoomAnimating()
        ) {
            // If the map is still animating/panning, schedule a short retry in E2E/dev mode
            try {
                if (_w?.__e2e) {
                    setTimeout(() => {
                        try {
                            highlightSegmentForMarker(markerData);
                        } catch (e) {}
                    }, 150);
                }
            } catch (e) {}
            return;
        }

        // Need selected track to locate segments
        const sel = _getSelectedTrackDetail();
        if (!sel || !sel.id) return;

        const poly = (_getPolylines() || []).find(
            (p) => p.properties && p.properties.id === sel.id
        );
        if (!poly) {
            // Poly not available yet - schedule retry in E2E/dev mode
            try {
                if (_w?.__e2e) {
                    setTimeout(() => highlightSegmentForMarker(markerData), 150);
                }
            } catch (e) {}
            return;
        }

        // Determine segments array format
        const rawLatlngs = poly.latlngs || [];
        const isNestedSegments =
            Array.isArray(rawLatlngs) &&
            rawLatlngs.length > 0 &&
            Array.isArray(rawLatlngs[0]) &&
            (Array.isArray(rawLatlngs[0][0]) ||
                (rawLatlngs[0][0] != null && typeof rawLatlngs[0][0] === "object"));
        const segments: L.LatLngExpression[][] =
            poly.segments ||
            (rawLatlngs.length > 0
                ? isNestedSegments
                    ? rawLatlngs as L.LatLngExpression[][]
                    : [rawLatlngs as L.LatLngExpression[]]
                : []);
        const segIdx = markerData.segmentIndex || 0;
        const seg = segments[segIdx];
        if (!seg || seg.length === 0) {
            // Segments not ready - schedule retry for E2E/dev
            try {
                if (_w?.__e2e) {
                    setTimeout(() => highlightSegmentForMarker(markerData), 150);
                }
            } catch (e) {}
            return;
        }

        const segCoords = seg;

        try {
            // If map object does not exist (e.g., test environment), still create polyline objects for assertions
            // Prefer using the original track color (if available) so we don't visually change the track color
            const trackColor =
                poly.properties?.color || getMarkerStrokeColor({ segmentIndex: segIdx });

            // Expose E2E observability early so tests can assert highlighting deterministically
            if (_w?.__e2e) {
                try {
                    _w.__e2e.lastHighlightedColor = trackColor;
                } catch (e) {}
            }
            // Debug: log when highlight is requested (helps e2e diagnostics)
            try {
                console.debug("[useSegmentHighlight][E2E] highlight requested", {
                    trackId: sel?.id,
                    segmentIndex: segIdx,
                    trackColor,
                });
            } catch (e) {}

            // If the track has only a single segment and we have a live map, prefer to emphasize the existing layer
            // by increasing weight/opacity rather than overlaying a new colored polyline — this preserves the
            // original track color and avoids a visual color change for single-segment tracks.
            const isSingleSegment = segments.length === 1;

            if (map && isSingleSegment) {
                try {
                    let foundLayer: L.Layer | null = null;
                    // Search for the GeoJSON layer by feature id
                    if (map.eachLayer) {
                        map.eachLayer((layer) => {
                            if (
                                !foundLayer &&
                                layer &&
                                (layer as L.GeoJSON).feature &&
                                ((layer as L.GeoJSON).feature as GeoJSON.Feature).properties &&
                                ((layer as L.GeoJSON).feature as GeoJSON.Feature).properties.id === sel.id
                            ) {
                                foundLayer = layer;
                            }
                        });
                    }

                    if (foundLayer && typeof foundLayer.setStyle === "function") {
                        // Save original style so it can be restored later
                        const foundLayerOptions = (foundLayer as unknown as { options: { color?: string; weight?: number; opacity?: number } }).options;
                        const foundLayerFeature = (foundLayer as L.GeoJSON).feature;
                        highlightedLayerOrigStyle.value = {
                            color: foundLayerOptions?.color ?? poly.properties?.color ?? null,
                            weight:
                                foundLayerOptions?.weight ??
                                (foundLayerFeature ? getFeatureWeight(foundLayerFeature) : POLYLINE_WEIGHT_DEFAULT),
                            opacity:
                                typeof foundLayerOptions?.opacity !== "undefined"
                                    ? foundLayerOptions.opacity
                                    : (foundLayerFeature ? getFeatureOpacity(foundLayerFeature) : POLYLINE_OPACITY_DEFAULT),
                        };
                        try {
                            console.log("[useSegmentHighlight][E2E] using foundLayer for highlight", {
                                foundLayerId: ((foundLayer as L.GeoJSON).feature as GeoJSON.Feature).properties?.id,
                                originalColor: highlightedLayerOrigStyle.value.color,
                            });

                            foundLayer.setStyle({
                                weight:
                                    (highlightedLayerOrigStyle.value.weight ||
                                        POLYLINE_WEIGHT_ACTIVE) + 2,
                                opacity: 1,
                            });

                            highlightedLayer.value = foundLayer;

                            if (_w?.__e2e) {
                                try {
                                    _w.__e2e.lastHighlightedColor =
                                        highlightedLayerOrigStyle.value.color || trackColor;
                                } catch (e) {}
                            }
                        } catch (e) {
                            console.warn(
                                "[useSegmentHighlight] Failed to style existing layer for highlight, falling back to overlay:",
                                e
                            );
                        }
                    }
                } catch (e) {
                    console.warn(
                        "[useSegmentHighlight] Error trying to locate layer for single-segment highlight:",
                        e
                    );
                }
            }

            // If we didn't apply style on an existing layer (multi-segment or layer not found), fall back to overlay polyline
            if (!highlightedLayer.value) {
                const adapter = leafletAdapter as { createPolyline: (latlngs: L.LatLngExpression[], options: object) => L.Polyline; addLayer: (layer: L.Layer) => void };
                if (!map) {
                    hoveredSegmentPolyline.value = adapter.createPolyline(segCoords, {
                        color: trackColor,
                        weight: (POLYLINE_WEIGHT_ACTIVE || 6) + 2,
                        opacity: 1,
                        interactive: false,
                        className: "chart-hover-segment",
                    });

                    // Expose E2E observability for tests (non-production only)
                    if (_w?.__e2e) {
                        try {
                            _w.__e2e.lastHighlightedColor = trackColor;
                        } catch (e) {}
                    }

                    const nearest = findNearestPointOnCoords(markerData.latlng, segCoords);
                    if (nearest) {
                        markerGapLine.value = adapter.createPolyline([markerData.latlng, nearest], {
                            color: trackColor,
                            weight: 1.5,
                            opacity: 0.6,
                            interactive: false,
                            className: "chart-gap-line",
                        });

                        if (_w?.__e2e) {
                            try {
                                _w.__e2e.lastGapLineExists = true;
                            } catch (e) {}
                        }
                    }

                    return;
                }

                hoveredSegmentPolyline.value = adapter.createPolyline(segCoords, {
                    color: trackColor,
                    weight: (POLYLINE_WEIGHT_ACTIVE || 6) + 2,
                    opacity: 1,
                    pane: "overlayPane",
                    interactive: false,
                    className: "chart-hover-segment",
                });
                if (hoveredSegmentPolyline.value) {
                    adapter.addLayer(hoveredSegmentPolyline.value);
                }

                // Expose highlight color for E2E in map-enabled environments
                if (import.meta.env.MODE !== "production" && _w?.__e2e) {
                    try {
                        _w.__e2e.lastHighlightedColor = trackColor;
                    } catch (e) {}
                }

                // Draw gap line from marker to nearest point on segment
                const nearest = findNearestPointOnCoords(markerData.latlng, segCoords);
                if (nearest) {
                    markerGapLine.value = adapter.createPolyline([markerData.latlng, nearest], {
                        color: trackColor,
                        weight: 1.5,
                        opacity: 0.6,
                        pane: "overlayPane",
                        interactive: false,
                        className: "chart-gap-line",
                    });
                    if (markerGapLine.value) {
                        adapter.addLayer(markerGapLine.value);
                    }

                    if (import.meta.env.MODE !== "production" && _w?.__e2e) {
                        try {
                            _w.__e2e.lastGapLineExists = true;
                        } catch (e) {}
                    }
                }
            }
        } catch (err) {
            console.warn("[useSegmentHighlight] Error highlighting segment:", err);
            clearSegmentHighlight(map);
        }
    }

    function findNearestPointOnCoords(point: L.LatLngExpression, coords: L.LatLngExpression[]): L.LatLngTuple | null {
        if (!point || !coords || coords.length === 0) return null;
        const pointArray = Array.isArray(point) ? point : [(point as L.LatLng).lat, (point as L.LatLng).lng];
        const [plat, plng] = pointArray;
        if (!Number.isFinite(plat) || !Number.isFinite(plng)) return null;
        let best: L.LatLngTuple | null = null;
        let bestDist = Infinity;
        for (let i = 0; i < coords.length; i++) {
            const coord = coords[i];
            const coordArray = Array.isArray(coord) ? coord : [(coord as L.LatLng).lat, (coord as L.LatLng).lng];
            const [lat, lng] = coordArray;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const d = (lat - plat) * (lat - plat) + (lng - plng) * (lng - plng);
            if (d < bestDist) {
                bestDist = d;
                best = coordArray as L.LatLngTuple;
            }
        }
        return best;
    }

    function removeMarkerPolyline(map: L.Map | null): void {
        try {
            if (hoveredMarkerPolyline.value && map) {
                map.removeLayer(hoveredMarkerPolyline.value);
                hoveredMarkerPolyline.value = null;
            }
            if (hoveredMarker.value) {
                hoveredMarker.value.setOpacity(1); // Restore marker
                hoveredMarker.value = null;
            }
        } catch (error) {
            console.warn("[useSegmentHighlight] Error removing hover polyline:", error);
            // Force clear references even on error
            hoveredMarkerPolyline.value = null;
            hoveredMarker.value = null;
        }
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------
    return {
        hoveredMarkerPolyline,
        hoveredMarker,
        hoveredSegmentPolyline,
        markerGapLine,
        highlightedLayer,
        highlightedLayerOrigStyle,
        lastAutoPanTarget,
        getPolylineWeight,
        getPolylineOpacity,
        getFeatureWeight,
        getFeatureOpacity,
        geoJsonStyle,
        getMarkerStrokeColor,
        getMarkerFillColor,
        performAutoPan,
        showMarkerPolyline,
        clearSegmentHighlight,
        highlightSegmentForMarker,
        findNearestPointOnCoords,
        removeMarkerPolyline,
    };
}
