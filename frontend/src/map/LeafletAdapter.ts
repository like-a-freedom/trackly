/**
 * LeafletAdapter — wraps a Leaflet L.Map instance behind the MapAdapter port.
 *
 * Provides a thin, library-agnostic façade over every Leaflet API surface
 * used by TrackMap: view control, layer management, heatmap, polylines,
 * pane creation, and event delegation.
 *
 * The public interface conforms to MapAdapter (domain types only). Leaflet
 * types are confined to the internals.
 *
 * @module map/LeafletAdapter
 */

import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import type { Map, Layer, GeoJSON, Polyline } from 'leaflet';
import type { LatLngTuple } from '@/types';
import type {
    MapAdapter,
    Bounds,
    GeoJsonStyle,
    MapLayer,
    FlyToOptions,
    FitBoundsOptions,
    PanOptions,
    OnEachFeature,
    EventHandler,
    ControlPosition,
} from './MapAdapter';

// Type aliases for plugins
type MarkerClusterGroup = L.MarkerClusterGroup;
type HeatLayer = unknown;
type HeatLayerOptions = Record<string, unknown>;

/**
 * Wrap a Leaflet layer to provide the MapLayer interface.
 * Leaflet layers have addTo(map: L.Map), but MapLayer expects addTo(map: MapAdapter).
 */
function wrapLeafletLayer(leafletLayer: { addTo(map: unknown): unknown; remove?(): unknown }): MapLayer {
    return {
        addTo(map: MapAdapter) {
            const nativeMap = map.getMap();
            if (leafletLayer && nativeMap) {
                leafletLayer.addTo(nativeMap as L.Map);
            }
        },
        remove() {
            if (leafletLayer && leafletLayer.remove) {
                leafletLayer.remove();
            }
        },
    };
}

/**
 * Wrap a Leaflet layer with full MapLayer interface (including setLatLngs/setStyle).
 */
function wrapGeoJsonLayer(leafletLayer: { addTo(map: unknown): unknown; remove?(): unknown; setLatLngs?(latlngs: L.LatLngExpression[]): unknown; setStyle?(style: L.PathOptions): unknown }): MapLayer {
    return {
        addTo(map: MapAdapter) {
            const nativeMap = map.getMap();
            if (leafletLayer && nativeMap) {
                leafletLayer.addTo(nativeMap as L.Map);
            }
        },
        remove() {
            if (leafletLayer && leafletLayer.remove) {
                leafletLayer.remove();
            }
        },
        setLatLngs(latlngs: LatLngTuple[]) {
            if (leafletLayer.setLatLngs) {
                leafletLayer.setLatLngs(latlngs as L.LatLngExpression[]);
            }
        },
        setStyle(style: Partial<GeoJsonStyle>) {
            if (leafletLayer.setStyle) {
                leafletLayer.setStyle(style as L.PathOptions);
            }
        },
    };
}

/**
 * Create a LeafletAdapter instance.
 *
 * The returned object satisfies the MapAdapter interface.
 * Call `setMap(map)` with a live `L.Map` before using any method that
 * touches the map; all methods are null-guarded so they no-op when the
 * map is not yet available.
 *
 * @returns MapAdapter instance backed by Leaflet
 */
export function createLeafletAdapter(): MapAdapter {
    let _map: Map | null = null;
    let _idle = false;

    // ----- lifecycle -----

    function setMap(map: unknown): void {
        _map = map as Map | null;
        _idle = false;

        if (map) {
            const m = map as Map;
            m.on('moveend', () => { _idle = true; });
            m.on('zoomend', () => { _idle = true; });
            m.on('movestart', () => { _idle = false; });
            m.on('zoomstart', () => { _idle = false; });
        }
    }

    function getMap(): unknown {
        return _map;
    }

    // ----- tile layer (programmatic) -----

    function renderTile(url: string, attribution: string): void {
        if (!_map) return;
        L.tileLayer(url, { attribution }).addTo(_map);
    }

    // ----- GeoJSON layer (programmatic) -----

    function renderGeoJson(
        data: GeoJSON.GeoJsonObject,
        style: GeoJsonStyle | ((feature: GeoJSON.Feature) => GeoJsonStyle),
        onEach: OnEachFeature,
    ): MapLayer | null {
        if (!_map) return null;
        const layer = L.geoJson(data, {
            style: style as L.GeoJSONOptions['style'],
            onEachFeature: (feature, layer) => onEach(feature, wrapGeoJsonLayer(layer)),
        }).addTo(_map);
        return wrapGeoJsonLayer(layer);
    }

    // ----- cluster group (delegates to L.markerClusterGroup) -----

    function renderClusterGroup(_points: unknown, options: object = {}): MapLayer | null {
        if (typeof L.markerClusterGroup !== 'function') {
            return {
                addLayer() {},
                removeLayer() {},
                clearLayers() {},
                addTo() {},
                on() {},
                off() {},
                remove() {},
                getLayers() { return []; },
                getBounds() { return null; },
                getChildCount() { return 0; },
                getAllChildMarkers() { return []; },
            } as unknown as MapLayer;
        }
        return L.markerClusterGroup(options as L.MarkerClusterGroupOptions) as unknown as MapLayer;
    }

    // ----- heatmap -----

    function createHeatLayer(latlngs: Array<[number, number, number]>, options: HeatLayerOptions = {}): MapLayer | null {
        if (!_map) return null;
        if (typeof (L as unknown as { heatLayer?: unknown }).heatLayer !== 'function') return null;
        const layer = (L as unknown as { heatLayer: (latlngs: L.LatLngExpression[], opts: Record<string, unknown>) => unknown }).heatLayer(latlngs, options);
        if (layer && _map) {
            (layer as unknown as { addTo(map: unknown): void }).addTo(_map);
        }
        return wrapLeafletLayer(layer as unknown as { addTo(map: unknown): unknown });
    }

    // ----- polyline -----

    function createPolyline(latlngs: LatLngTuple[], options: Record<string, unknown> = {}): MapLayer | null {
        if (typeof L.polyline !== 'function') return null;
        const layer = L.polyline(latlngs, options as L.PolylineOptions);
        return wrapLeafletLayer(layer);
    }

    // ----- view control -----

    function getCenter(): LatLngTuple | null {
        if (!_map) return null;
        const c = _map.getCenter();
        return [c.lat, c.lng];
    }

    function getZoom(): number | null {
        if (!_map) return null;
        return _map.getZoom();
    }

    function getBounds(): Bounds | null {
        if (!_map) return null;
        const b = _map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        return { sw: [sw.lat, sw.lng], ne: [ne.lat, ne.lng] };
    }

    function setView(center: LatLngTuple, zoom: number): void {
        if (!_map) return;
        _map.setView(center, zoom);
    }

    function flyTo(center: LatLngTuple, zoom: number, options?: FlyToOptions): void {
        if (!_map) return;
        _map.flyTo(center, zoom, options as L.ZoomPanOptions);
    }

    function flyToBounds(bounds: Bounds, options?: FitBoundsOptions): void {
        if (!_map) return;
        _map.flyToBounds([bounds.sw, bounds.ne] as unknown as L.LatLngBoundsExpression, options as L.FitBoundsOptions);
    }

    function fitBounds(bounds: Bounds, options?: FitBoundsOptions): void {
        if (!_map) return;
        _map.fitBounds([bounds.sw, bounds.ne] as unknown as L.LatLngBoundsExpression, options as L.FitBoundsOptions);
    }

    function panTo(latlng: LatLngTuple, options?: PanOptions): void {
        if (!_map) return;
        _map.panTo(latlng, options as L.PanOptions);
    }

    function stop(): void {
        if (!_map) return;
        try { _map.stop(); } catch (_) { /* noop */ }
    }

    // ----- layer management -----

    function addLayer(layer: MapLayer): void {
        if (!_map) return;
        _map.addLayer(layer as unknown as Layer);
    }

    function removeLayer(layer: MapLayer): void {
        if (!_map) return;
        try { _map.removeLayer(layer as unknown as Layer); } catch (_) { /* noop */ }
    }

    function eachLayer(cb: (layer: MapLayer) => void): void {
        if (!_map) return;
        _map.eachLayer(cb as unknown as (layer: Layer) => void);
    }

    // ----- pane management -----

    function getPane(name: string): HTMLElement | null {
        if (!_map) return null;
        return (_map.getPane(name) as HTMLElement) || null;
    }

    function createPane(name: string, container?: HTMLElement): HTMLElement | undefined {
        if (!_map) return undefined;
        return _map.createPane(name, container);
    }

    // ----- attribution control -----

    function repositionAttribution(position: ControlPosition): void {
        if (!_map || !_map.attributionControl) return;
        try {
            _map.removeControl(_map.attributionControl);
            _map.attributionControl.setPosition(position);
            _map.addControl(_map.attributionControl);
        } catch (_) { /* noop */ }
    }

    // ----- events -----

    function on(event: string, cb: EventHandler): void {
        if (!_map) return;
        _map.on(event, cb as L.LeafletEventHandlerFn);
    }

    function off(event: string, cb: EventHandler): void {
        if (!_map) return;
        _map.off(event, cb as L.LeafletEventHandlerFn);
    }

    // ----- idle state -----

    function isIdle(): boolean {
        return _idle;
    }

    // ----- E2E hooks (lightweight delegate) -----

    function exposeE2E(namespace: string, api: Record<string, unknown>): void {
        if (typeof window === 'undefined') return;
        const win = window as unknown as Record<string, Record<string, unknown>>;
        win[namespace] = win[namespace] || {};
        if (win[namespace]) Object.assign(win[namespace], api);
    }

    // ----- public interface -----

    return {
        setMap,
        getMap,
        renderTile,
        renderGeoJson,
        renderClusterGroup,
        createHeatLayer,
        createPolyline,
        getCenter,
        getZoom,
        getBounds,
        setView,
        flyTo,
        flyToBounds,
        fitBounds,
        panTo,
        stop,
        addLayer,
        removeLayer,
        eachLayer,
        getPane,
        createPane,
        repositionAttribution,
        on,
        off,
        isIdle,
        exposeE2E,
    };
}
