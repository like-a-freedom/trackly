import { nextTick } from "vue";
import type { Ref } from "vue";
import L from "leaflet";
import { latLngBounds } from "leaflet";
import type { MapAdapter } from "../map/MapAdapter";
import {
    getDetailPanelFitBoundsOptions,
} from "../utils/mapConstants";
import {
    saveMapStateToStorage,
    loadMapStateFromStorage,
} from "./useMapState";

interface UseMapEventsOptions {
    props: {
        selectedTrackDetail?: unknown;
        polylines: Array<{ properties?: { id?: string }; latlngs?: L.LatLngExpression[] }>;
        center?: [number, number];
        zoom?: number;
        markerLatLng?: { latlng: [number, number]; segmentIndex?: number; isFixed?: boolean };
        bounds?: [number, number][];
        [key: string]: unknown;
    };
    emit: (event: string, ...args: unknown[]) => void;
    leafletAdapter: MapAdapter;
    clusterAdapter: unknown;
    mapState: Ref<{
        lastKnownGood: { zoom?: number; center: [number, number] };
        preSelection: { zoom?: number; center: [number, number] };
        userChangedZoomOrCenter: boolean;
    }>;
    mapIsReady: Ref<boolean>;
    isPanningOrZooming: Ref<boolean>;
    isZoomAnimating: Ref<boolean>;
    trackZoomAnimating: Ref<boolean>;
    isTransitioning: Ref<boolean>;
    stableBounds: Ref<L.LatLngBounds | undefined>;
    highlightSegmentForMarker: (data: { latlng: [number, number]; segmentIndex?: number; isFixed?: boolean }) => void;
    removeMarkerPolyline: (map: L.Map | null) => void;
    showMarkerPolyline: (track: unknown, map: L.Map | null, marker: L.Marker | null) => void;
    clearSegmentHighlight: (map: L.Map | null) => void;
    performAutoPan: (latlng: L.LatLngExpression, map: L.Map | null) => void;
    setTrackZoomAnimating: (value: boolean) => void;
    updateStableBounds: (bounds: L.LatLngBounds) => void;
    debouncedUpdateClustering: () => void;
    clustering: {
        clusterGroup: Ref<unknown>;
        updateZoomLevel: (zoom: number) => void;
        addTracksToCluster: (tracks: unknown[], group: unknown, _null: unknown, strategy: string) => void;
    };
    layerKey: unknown;
    getMapObject: (ctx?: string) => L.Map | null;
    displayMode: Ref<string>;
    hoveredSegmentPolyline: Ref<L.Polyline | null>;
    isUnmounting: Ref<boolean>;
    filteredTracks: Ref<unknown[]>;
    mapBounds: Ref<L.LatLngBounds | null>;
}

interface UseMapEventsReturn {
    onTrackClick: (poly: unknown, event: L.LeafletMouseEvent) => void;
    onTrackMouseOver: (poly: unknown, event: L.LeafletMouseEvent) => void;
    onTrackMouseMove: (event: L.LeafletMouseEvent) => void;
    onTrackMouseOut: (event: L.LeafletMouseEvent) => void;
    onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer) => void;
    onGeoJsonClick: (event: L.LeafletMouseEvent) => void;
    onGeoJsonMouseOver: (event: L.LeafletMouseEvent) => void;
    onGeoJsonMouseOut: (event: L.LeafletMouseEvent) => void;
    onMoveStart: (e: L.LeafletEvent) => void;
    onMoveEnd: (e: L.LeafletEvent) => void;
    onZoomStart: (e: L.LeafletEvent) => void;
    onZoomEnd: (e: L.LeafletEvent) => void;
    handleTrackSelected: (newDetail: { id: string }) => Promise<void>;
    handleTrackDeselected: () => Promise<void>;
    onLocationFound: (location: { latitude: number; longitude: number; error?: string }) => void;
    onClusterClick: (e: L.LeafletMouseEvent) => void;
    onClusterMarkerClick: (e: L.LeafletMouseEvent) => void;
    updateClustering: () => void;
}

/**
 * Composable that encapsulates all map event handlers for TrackMap.
 *
 * Extracted from TrackMap.vue to separate event-handling concerns from
 * template/rendering logic. All external dependencies are injected via
 * the options object so the composable stays framework-agnostic
 * (no direct imports of Vue refs or component state).
 */
export function useMapEvents({
    props,
    emit,
    mapState,
    mapIsReady: _mapIsReady,
    isPanningOrZooming,
    isZoomAnimating,
    trackZoomAnimating: _trackZoomAnimating,
    isTransitioning: _isTransitioning,
    stableBounds: _stableBounds,
    highlightSegmentForMarker,
    removeMarkerPolyline,
    showMarkerPolyline: _showMarkerPolyline,
    clearSegmentHighlight,
    performAutoPan: _performAutoPan,
    setTrackZoomAnimating,
    updateStableBounds,
    debouncedUpdateClustering: _debouncedUpdateClustering,
    clustering,
    layerKey: _layerKey,
    getMapObject,
    displayMode,
    hoveredSegmentPolyline,
    isUnmounting,
    filteredTracks,
    mapBounds,
}: UseMapEventsOptions): UseMapEventsReturn {
    // -----------------------------------------------------------------------
    // Internal timeout management (mirrors the original component-scoped vars)
    // -----------------------------------------------------------------------
    let clusteringUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let mapUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

    function clearClusteringUpdateTimeout(): void {
        if (clusteringUpdateTimeout) {
            clearTimeout(clusteringUpdateTimeout);
            clusteringUpdateTimeout = null;
        }
    }

    function clearMapUpdateTimeout(): void {
        if (mapUpdateTimeout) {
            clearTimeout(mapUpdateTimeout);
            mapUpdateTimeout = null;
        }
    }

    // -----------------------------------------------------------------------
    // Internal helper – updateInitialMapState
    // -----------------------------------------------------------------------
    function updateInitialMapState(e: L.LeafletEvent): void {
        if (!props.selectedTrackDetail) {
            const map = e.target as L.Map;
            mapState.value.lastKnownGood.zoom = map.getZoom();
            mapState.value.lastKnownGood.center = [
                map.getCenter().lat,
                map.getCenter().lng,
            ];

            // When no detail view is active, also update preSelection values
            // to match the current state for next time a track is selected
            mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
            mapState.value.preSelection.center = [
                ...mapState.value.lastKnownGood.center,
            ];

            mapState.value.userChangedZoomOrCenter = true;
        }
    }

    // -----------------------------------------------------------------------
    // 1. Track event handlers
    // -----------------------------------------------------------------------
    function onTrackClick(poly: unknown, event: L.LeafletMouseEvent): void {
        emit("trackClick", poly, event);
    }

    function onTrackMouseOver(poly: unknown, event: L.LeafletMouseEvent): void {
        // Skip hover events during zoom animations or panning to reduce processing
        if (
            props.selectedTrackDetail ||
            isZoomAnimating.value ||
            isPanningOrZooming.value
        )
            return;

        const leafletLayer = event.target as L.Layer & { bringToFront: () => void };
        if (leafletLayer && typeof leafletLayer.bringToFront === "function") {
            leafletLayer.bringToFront();
        }
        emit("trackMouseOver", poly, event);
    }

    function onTrackMouseMove(event: L.LeafletMouseEvent): void {
        // Skip mouse move events during active operations
        if (!isPanningOrZooming.value && !isZoomAnimating.value) {
            emit("trackMouseMove", event);
        }
    }

    function onTrackMouseOut(event: L.LeafletMouseEvent): void {
        if (props.selectedTrackDetail) return;
        emit("trackMouseOut", event);
    }

    // -----------------------------------------------------------------------
    // 2. GeoJSON event handlers
    // -----------------------------------------------------------------------
    function onEachFeature(_feature: GeoJSON.Feature, layer: L.Layer): void {
        layer.on({
            click: (event: L.LeafletMouseEvent) => onGeoJsonClick(event),
            mouseover: (event: L.LeafletMouseEvent) => onGeoJsonMouseOver(event),
            mousemove: (event: L.LeafletMouseEvent) => onTrackMouseMove(event),
            mouseout: (event: L.LeafletMouseEvent) => onGeoJsonMouseOut(event),
        });
    }

    function onGeoJsonClick(event: L.LeafletMouseEvent): void {
        // In GeoJSON layer events, the feature is accessed via event.target.feature
        const layer = event.target as L.Layer & { feature?: GeoJSON.Feature };
        const feature = layer?.feature;

        if (!feature?.properties?.id) {
            return;
        }

        const poly = props.polylines.find(
            (p) => p.properties?.id === (feature.properties as { id?: string }).id
        );
        if (poly) {
            emit("trackClick", poly, event);
        }
    }

    function onGeoJsonMouseOver(event: L.LeafletMouseEvent): void {
        // Skip hover events during zoom animations or panning to reduce processing
        if (
            props.selectedTrackDetail ||
            isZoomAnimating.value ||
            isPanningOrZooming.value
        )
            return;

        const layer = event.target as L.Layer & { feature?: GeoJSON.Feature; bringToFront: () => void };
        const feature = layer?.feature;

        if (!feature?.properties?.id) {
            return;
        }

        // Bring the layer to front
        if (layer && typeof layer.bringToFront === "function") {
            layer.bringToFront();
        }

        const poly = props.polylines.find(
            (p) => p.properties?.id === (feature.properties as { id?: string }).id
        );
        if (poly) {
            emit("trackMouseOver", poly, event);
        }
    }

    function onGeoJsonMouseOut(event: L.LeafletMouseEvent): void {
        if (props.selectedTrackDetail) return;
        emit("trackMouseOut", event);
    }

    // -----------------------------------------------------------------------
    // 3. Move / zoom handlers
    // -----------------------------------------------------------------------
    function onMoveStart(e: L.LeafletEvent): void {
        // Set panning state to optimize certain operations during pan
        isPanningOrZooming.value = true;
        // Remove hover polylines during move to prevent visual glitches
        const map = e.target as L.Map;
        removeMarkerPolyline(map);
        clearSegmentHighlight(map);
    }

    function onMoveEnd(e: L.LeafletEvent): void {
        const map = e.target as L.Map;
        const center_val = map.getCenter();
        const mapBoundsLocal = map.getBounds();

        // Clear panning state immediately
        isPanningOrZooming.value = false;

        // Update stable bounds with debouncing to reduce reactive updates
        updateStableBounds(mapBoundsLocal);

        // Only emit center update if it's meaningfully different to prevent oscillation
        const newCenter: [number, number] = [center_val.lat, center_val.lng];
        if (
            !props.center ||
            Math.abs(newCenter[0] - props.center[0]) > 0.0001 ||
            Math.abs(newCenter[1] - props.center[1]) > 0.0001
        ) {
            emit("update:center", newCenter);
        }

        emit("update:bounds", mapBoundsLocal);
        updateInitialMapState(e);

        // If we have a marker persisted, re-draw the segment highlight after pan ends
        if (props.markerLatLng) {
            // Delay slightly to let map repaint
            setTimeout(() => {
                highlightSegmentForMarker(props.markerLatLng!);
            }, 150);
        }
    }

    function onZoomStart(e: L.LeafletEvent): void {
        // Set zoom animating state and clean up hover polylines immediately
        isZoomAnimating.value = true;
        const map = e.target as L.Map;
        removeMarkerPolyline(map);
    }

    function onZoomEnd(e: L.LeafletEvent): void {
        const map = e.target as L.Map;
        const currentZoom = map.getZoom();

        // Update stable bounds with debouncing to reduce reactive updates
        updateStableBounds(map.getBounds());

        // Debounced update of clustering and animation states
        clearMapUpdateTimeout();
        mapUpdateTimeout = setTimeout(() => {
            try {
                clustering.updateZoomLevel(currentZoom);

                // Only emit zoom update if it's meaningfully different to prevent oscillation
                if (Math.abs(currentZoom - (props.zoom ?? 0)) > 0.1) {
                    emit("update:zoom", currentZoom);
                }

                // Clear zoom animating state after debounced update
                isZoomAnimating.value = false;
            } catch (error) {
                console.error("[useMapEvents] Error updating clustering zoom level:", error);
                // Ensure states are cleared even on error
                isZoomAnimating.value = false;
            }
        }, 100); // Slightly increased debounce time to prevent rapid-fire updates

        emit("update:zoom", map.getZoom());
        updateInitialMapState(e);
    }

    // -----------------------------------------------------------------------
    // 4. Track selection / deselection
    // -----------------------------------------------------------------------
    async function handleTrackSelected(newDetail: { id: string }): Promise<void> {
        try {
            // If bounds prop is provided, let the bounds watch handle positioning
            // This prevents double-positioning and conflicts
            if (
                props.bounds &&
                Array.isArray(props.bounds) &&
                props.bounds.length === 2
            ) {
                console.log(
                    "[useMapEvents] Bounds provided, skipping handleTrackSelected flyToBounds"
                );
                // Just save pre-selection state for returning later
                const map = getMapObject("handleTrackSelected-saveState");
                if (map) {
                    mapState.value.preSelection.zoom = map.getZoom();
                    mapState.value.preSelection.center = [
                        map.getCenter().lat,
                        map.getCenter().lng,
                    ];
                    saveMapStateToStorage(
                        mapState.value.preSelection.zoom,
                        mapState.value.preSelection.center
                    );
                }
                return;
            }

            const selectedPolyline = props.polylines.find(
                (poly) => poly.properties && poly.properties.id === newDetail.id
            );
            if (
                !selectedPolyline ||
                !selectedPolyline.latlngs ||
                !selectedPolyline.latlngs.length
            )
                return;

            const map = getMapObject("handleTrackSelected");
            if (map) {
                // Clean up any hover polylines before flying to track
                removeMarkerPolyline(map);

                // Save current state before flying to track
                mapState.value.preSelection.zoom = map.getZoom();
                mapState.value.preSelection.center = [
                    map.getCenter().lat,
                    map.getCenter().lng,
                ];
                saveMapStateToStorage(
                    mapState.value.preSelection.zoom,
                    mapState.value.preSelection.center
                );

                const ll = selectedPolyline.latlngs;
                const polyLineBounds = latLngBounds(ll[0], ll[1]);
                map.flyToBounds(polyLineBounds, {
                    ...getDetailPanelFitBoundsOptions(),
                    duration: 1.5,
                    easeLinearity: 0.25,
                });
            } else {
                // Fallback when map object is not available
                if (
                    mapState.value.lastKnownGood.zoom !== undefined &&
                    mapState.value.lastKnownGood.center
                ) {
                    mapState.value.preSelection.zoom = mapState.value.lastKnownGood.zoom;
                    mapState.value.preSelection.center = [
                        ...mapState.value.lastKnownGood.center,
                    ];
                    saveMapStateToStorage(
                        mapState.value.preSelection.zoom,
                        mapState.value.preSelection.center
                    );
                }

                mapBounds.value = null;
                await nextTick();
                const ll2 = selectedPolyline.latlngs;
                mapBounds.value = latLngBounds(ll2[0], ll2[1]);
            }
        } catch (error) {
            console.error("[useMapEvents] Error in handleTrackSelected:", error, {
                newDetail,
            });
        }
    }

    async function handleTrackDeselected(): Promise<void> {
        try {
            setTrackZoomAnimating(true);
            const map = getMapObject("handleTrackDeselected");

            // Clean up any hover polylines before flying back
            removeMarkerPolyline(map);

            mapBounds.value = null;

            let center: [number, number] = mapState.value.preSelection.center;
            let zoom = mapState.value.preSelection.zoom;

            // Try to load from localStorage if not available in memory
            if (!center || zoom === undefined) {
                const storedState = loadMapStateFromStorage();
                if (storedState) {
                    zoom = storedState.zoom;
                    center = storedState.center;
                }
            }

            // Final fallback to last known good state
            if (!center || zoom === undefined) {
                center = mapState.value.lastKnownGood.center;
                zoom = mapState.value.lastKnownGood.zoom;
            }

            if (map && center && zoom !== undefined && !isUnmounting.value) {
                // Clean up hover polylines before starting flyTo
                removeMarkerPolyline(map);

                setTimeout(() => {
                    // Double-check if component is still mounted
                    if (isUnmounting.value) return;

                    try {
                        map.flyTo(center, zoom, {
                            duration: 1.5,
                            easeLinearity: 0.25,
                        });
                        // Update state after successful fly
                        mapState.value.lastKnownGood.center = [center[0], center[1]];
                        mapState.value.lastKnownGood.zoom = zoom;
                    } catch (flyError) {
                        console.warn("[useMapEvents] flyTo failed, trying setView:", flyError);
                        try {
                            if (!isUnmounting.value) {
                                map.setView(center, zoom, { animate: false }); // Disable animation on fallback
                            }
                        } catch (setViewError) {
                            console.error("[useMapEvents] setView also failed:", setViewError);
                        }
                    }
                }, 50);
            }
        } catch (error) {
            console.error("[useMapEvents] Error in handleTrackDeselected:", error);
            // Recovery attempt
            try {
                const map = getMapObject("handleTrackDeselected-recovery");
                if (map && !isUnmounting.value) {
                    const center =
                        mapState.value.preSelection.center ||
                        mapState.value.lastKnownGood.center;
                    const zoom =
                        mapState.value.preSelection.zoom || mapState.value.lastKnownGood.zoom;
                    if (center && zoom !== undefined) {
                        map.setView(center, zoom, { animate: false }); // Disable animation in recovery
                    }
                }
            } catch (recoveryError) {
                console.error(
                    "[useMapEvents] Failed to recover from deselection error:",
                    recoveryError
                );
            }
        }
    }

    // -----------------------------------------------------------------------
    // 5. Geolocation
    // -----------------------------------------------------------------------
    function onLocationFound(location: { latitude: number; longitude: number; error?: string }): void {
        if (location.error) {
            console.warn("[useMapEvents] Geolocation error:", location.error);
            return;
        }

        const map = getMapObject("onLocationFound");
        if (!map) {
            console.warn("[useMapEvents] Map not available for geolocation");
            return;
        }

        try {
            // Center the map on the user's location
            // Check if component is still mounted before flying
            if (isUnmounting.value) return;

            map.flyTo([location.latitude, location.longitude], 15, {
                duration: 1.5,
                easeLinearity: 0.25,
            });

            // If we have a highlighted segment or gap lines, keep them in sync (no-op here)
            // This is a placeholder for more advanced sync logic if needed later
            if (hoveredSegmentPolyline.value) {
                // No action required now
            }
        } catch (error) {
            console.error("[useMapEvents] Error centering map on user location:", error);
        }
    }

    // -----------------------------------------------------------------------
    // 6. Cluster event handlers
    // -----------------------------------------------------------------------
    function onClusterClick(e: L.LeafletMouseEvent): void {
        const cluster = (e.layer || e.target) as unknown as { getAllChildMarkers?: () => L.Marker[]; getBounds?: () => L.LatLngBounds };

        if (cluster.getAllChildMarkers) {
            // This is a cluster, zoom in to show individual tracks
            const map = getMapObject("onClusterClick");
            if (map && cluster.getBounds) {
                // Clean up hover polylines before fitting bounds
                removeMarkerPolyline(map);
                const bounds = cluster.getBounds();
                map.fitBounds(bounds, { padding: [20, 20] });
            }
        }
    }

    function onClusterMarkerClick(e: L.LeafletMouseEvent): void {
        const marker = (e.layer || e.target) as L.Marker & { trackData?: unknown; getAllChildMarkers?: unknown };

        // Check if this is an individual marker (not a cluster)
        if (marker.trackData && !marker.getAllChildMarkers) {
            // Emit track click event with track data
            emit("trackClick", marker.trackData, e);
        }
    }

    function updateClustering(): void {
        if (!clustering.clusterGroup.value || displayMode.value === "detail") {
            return;
        }

        // Clear any pending clustering updates to debounce
        clearClusteringUpdateTimeout();

        clusteringUpdateTimeout = setTimeout(() => {
            try {
                if (displayMode.value === "cluster") {
                    // Add filtered tracks to cluster
                    clustering.addTracksToCluster(
                        filteredTracks.value,
                        clustering.clusterGroup.value,
                        null,
                        "center" // Use center point strategy
                    );
                } else {
                    // Clear clusters when showing individual tracks
                    const clusterGroup = clustering.clusterGroup.value as unknown as { getLayers: () => { length: number }; clearLayers: () => void };
                    if (
                        clusterGroup.getLayers &&
                        clusterGroup.getLayers().length > 0
                    ) {
                        clusterGroup.clearLayers();
                    }
                }
            } catch (error) {
                console.error("[useMapEvents] Error updating clustering:", error);
            }
            clusteringUpdateTimeout = null;
        }, 150); // Debounce clustering updates by 150ms
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    return {
        onTrackClick,
        onTrackMouseOver,
        onTrackMouseMove,
        onTrackMouseOut,
        onEachFeature,
        onGeoJsonClick,
        onGeoJsonMouseOver,
        onGeoJsonMouseOut,
        onMoveStart,
        onMoveEnd,
        onZoomStart,
        onZoomEnd,
        handleTrackSelected,
        handleTrackDeselected,
        onLocationFound,
        onClusterClick,
        onClusterMarkerClick,
        updateClustering,
    };
}
