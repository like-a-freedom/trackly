/**
 * ClusterAdapter — manages a MarkerClusterGroup lifecycle.
 *
 * Wraps `L.markerClusterGroup` creation, marker CRUD, event wiring,
 * and cleanup behind a single, testable factory function.
 *
 * @module map/ClusterAdapter
 */

import L from 'leaflet';
import 'leaflet.markercluster';
import type { Marker, Layer } from 'leaflet';

// Type alias for MarkerClusterGroup from leaflet.markercluster
type MarkerClusterGroup = L.MarkerClusterGroup;

interface ClusterConfig {
    disableClusteringAtZoom?: number;
    maxClusterRadius?: number;
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    animate?: boolean;
    animateAddingMarkers?: boolean;
}

export interface ClusterAdapter {
    initialize: (overrides?: ClusterConfig) => MarkerClusterGroup | object | null;
    addMarker: (marker: Marker) => void;
    addMarkers: (markers: Marker[]) => void;
    removeMarker: (marker: Marker) => void;
    clearLayers: () => void;
    getGroup: () => MarkerClusterGroup | object | null;
    getLayers: () => Layer[];
    getBounds: () => L.LatLngBounds | null;
    addTo: (map: L.Map) => void;
    remove: () => void;
    on: (event: string, cb: L.LeafletEventHandlerFn) => void;
    off: (event: string, cb: L.LeafletEventHandlerFn) => void;
    cleanup: () => void;
}

/**
 * Create a ClusterAdapter.
 *
 * @param config - Cluster configuration overrides.
 * @returns ClusterAdapter instance
 */
export function createClusterAdapter(config: ClusterConfig = {}): ClusterAdapter {
    /** @type {MarkerClusterGroup | object | null} */
    let _group: MarkerClusterGroup | object | null = null;

    /**
     * Initialise (or re-initialise) the underlying MarkerClusterGroup.
     *
     * @param overrides - Configuration overrides merged on top
     *   of the defaults provided at construction time.
     * @returns The newly created group, or null when
     *   `L.markerClusterGroup` is unavailable.
     */
    function initialize(overrides: ClusterConfig = {}): MarkerClusterGroup | object | null {
        // Tear down any previous group first
        if (_group) {
            cleanup();
        }

        const opts = { ...config, ...overrides };

        if (typeof L.markerClusterGroup !== 'function') {
            // Return a minimal stub so callers never have to null-check
            _group = {
                addLayer() {},
                addLayers() {},
                removeLayer() {},
                clearLayers() {},
                addTo() { return this; },
                on() { return this; },
                off() { return this; },
                remove() {},
                getLayers() { return []; },
                getBounds() { return null; },
                getChildCount() { return 0; },
                getAllChildMarkers() { return []; },
            };
            return _group;
        }

        _group = L.markerClusterGroup({
            disableClusteringAtZoom: opts.disableClusteringAtZoom ?? 14,
            maxClusterRadius: opts.maxClusterRadius ?? 36,
            showCoverageOnHover: opts.showCoverageOnHover ?? true,
            zoomToBoundsOnClick: opts.zoomToBoundsOnClick ?? true,
            animate: opts.animate ?? true,
            animateAddingMarkers: opts.animateAddingMarkers ?? true,
            chunkedLoading: true,
            removeOutsideVisibleBounds: true,
            spiderfyOnMaxZoom: false,
        });

        return _group;
    }

    // ----- marker CRUD -----

    /**
     * Add a single marker to the cluster group.
     */
    function addMarker(marker: Marker): void {
        if (_group && marker) {
            (_group as MarkerClusterGroup).addLayer(marker);
        }
    }

    /**
     * Add an array of markers in one call.
     */
    function addMarkers(markers: Marker[]): void {
        if (_group && Array.isArray(markers) && markers.length > 0) {
            (_group as MarkerClusterGroup).addLayers(markers);
        }
    }

    /**
     * Remove a single marker from the cluster group.
     */
    function removeMarker(marker: Marker): void {
        if (_group && marker) {
            (_group as MarkerClusterGroup).removeLayer(marker);
        }
    }

    /** Remove all markers from the group. */
    function clearLayers(): void {
        if (_group && 'getLayers' in _group && typeof _group.getLayers === 'function' && _group.getLayers().length > 0) {
            (_group as MarkerClusterGroup).clearLayers();
        }
    }

    // ----- accessors -----

    function getGroup(): MarkerClusterGroup | object | null {
        return _group;
    }

    function getLayers(): Layer[] {
        if (!_group || !('getLayers' in _group)) return [];
        return (_group as MarkerClusterGroup).getLayers();
    }

    function getBounds(): L.LatLngBounds | null {
        if (!_group || !('getBounds' in _group)) return null;
        return (_group as MarkerClusterGroup).getBounds();
    }

    // ----- map integration -----

    /**
     * Add the cluster group to a map.
     */
    function addTo(map: L.Map): void {
        if (_group && map) {
            map.addLayer(_group as MarkerClusterGroup);
        }
    }

    /** Remove the cluster group from whatever map it is on. */
    function remove(): void {
        if (_group) {
            (_group as MarkerClusterGroup).remove();
        }
    }

    // ----- events -----

    function on(event: string, cb: L.LeafletEventHandlerFn): void {
        if (_group) {
            (_group as MarkerClusterGroup).on(event, cb);
        }
    }

    function off(event: string, cb: L.LeafletEventHandlerFn): void {
        if (_group) {
            (_group as MarkerClusterGroup).off(event, cb);
        }
    }

    // ----- cleanup -----

    /** Tear down the group completely and release references. */
    function cleanup(): void {
        if (!_group) return;

        try {
            // Remove zoom animation listeners from individual markers first
            if ('getLayers' in _group && typeof _group.getLayers === 'function') {
                const layers = _group.getLayers();
                layers.forEach((layer) => {
                    try {
                        if ((layer as unknown as { _map?: L.Map })._map) {
                            (layer as unknown as { _map?: L.Map })._map?.off('zoomanim', (layer as unknown as { _animateZoom?: () => void })._animateZoom, layer);
                            (layer as unknown as { _map?: L.Map })._map = undefined;
                        }
                    } catch (_) { /* noop */ }
                });
                (_group as MarkerClusterGroup).clearLayers();
            }

            if ('off' in _group && typeof _group.off === 'function') {
                (_group as MarkerClusterGroup).off();
            }

            (_group as MarkerClusterGroup).remove();
        } catch (_) { /* noop */ }

        _group = null;
    }

    // ----- public API -----

    return {
        initialize,
        addMarker,
        addMarkers,
        removeMarker,
        clearLayers,
        getGroup,
        getLayers,
        getBounds,
        addTo,
        remove,
        on,
        off,
        cleanup,
    };
}
