import type { LatLngTuple } from '@/types';

// ============================================================================
// Domain types (no Leaflet imports)
// ============================================================================

/** Geographic bounds as a 2-corner rectangle. */
export interface Bounds {
    sw: LatLngTuple;
    ne: LatLngTuple;
}

/** Options for flyTo animations. */
export interface FlyToOptions {
    duration?: number;
    easeLinearity?: number;
}

/** Options for fitBounds. */
export interface FitBoundsOptions {
    padding?: [number, number];
    maxZoom?: number;
}

/** Options for panTo. */
export interface PanOptions {
    animate?: boolean;
    duration?: number;
}

/** Style properties for GeoJSON features. */
export interface GeoJsonStyle {
    color?: string;
    weight?: number;
    opacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    dashArray?: string;
}

/** Callback for each GeoJSON feature rendered. */
export type OnEachFeature = (feature: GeoJSON.Feature, layer: MapLayer) => void;

/**
 * Opaque handle to a map layer (returned by createPolyline, createHeatLayer, etc.).
 * Consumers pass it back to addLayer/removeLayer without knowing the concrete type.
 */
export interface MapLayer {
    addTo(map: MapAdapter): void;
    remove(): void;
    setLatLngs?(latlngs: LatLngTuple[]): void;
    setStyle?(style: Partial<GeoJsonStyle>): void;
}

/** Event handler callback. */
export type EventHandler = (event: unknown) => void;

/** Attribution control position. */
export type ControlPosition = 'topright' | 'topleft' | 'bottomright' | 'bottomleft';

/** Map event names. */
export const MAP_EVENTS = {
    MOVE_END: 'moveend',
    MOVE_START: 'movestart',
    ZOOM_END: 'zoomend',
    ZOOM_START: 'zoomstart',
    CLICK: 'click',
    RESIZE: 'resize',
    MOUSE_OVER: 'mouseover',
    MOUSE_OUT: 'mouseout',
    CLUSTER_CLICK: 'clusterclick',
} as const;

export type MapEvent = (typeof MAP_EVENTS)[keyof typeof MAP_EVENTS];

// ============================================================================
// MapAdapter interface
// ============================================================================

/**
 * MapAdapter — port interface for map rendering.
 *
 * Adapters wrap a concrete map implementation (Leaflet, Mapbox, test double)
 * behind this library-agnostic façade. All consumer code should depend on this
 * interface, never on a specific adapter implementation.
 */
export interface MapAdapter {
    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /** Bind the adapter to a live map instance. Call once on map ready. */
    setMap(map: unknown): void;

    /** Get the underlying native map instance (for advanced use / fallback). */
    getMap(): unknown;

    // -----------------------------------------------------------------------
    // View control
    // -----------------------------------------------------------------------

    /** Get current map center as [lat, lng]. */
    getCenter(): LatLngTuple | null;

    /** Get current zoom level. */
    getZoom(): number | null;

    /** Get current viewport bounds. */
    getBounds(): Bounds | null;

    /** Instantly set view (no animation). */
    setView(center: LatLngTuple, zoom: number): void;

    /** Animated fly to a center/zoom. */
    flyTo(center: LatLngTuple, zoom: number, options?: FlyToOptions): void;

    /** Animated fly to fit bounds. */
    flyToBounds(bounds: Bounds, options?: FitBoundsOptions): void;

    /** Instantly fit viewport to bounds (with optional padding). */
    fitBounds(bounds: Bounds, options?: FitBoundsOptions): void;

    /** Pan to a coordinate (preserves zoom). */
    panTo(latlng: LatLngTuple, options?: PanOptions): void;

    /** Stop all in-progress animations. */
    stop(): void;

    /** Whether the map has finished all animations and is idle. */
    isIdle(): boolean;

    // -----------------------------------------------------------------------
    // Layer management
    // -----------------------------------------------------------------------

    /** Add a layer to the map. */
    addLayer(layer: MapLayer): void;

    /** Remove a layer from the map. */
    removeLayer(layer: MapLayer): void;

    /** Iterate all layers currently on the map. */
    eachLayer(cb: (layer: MapLayer) => void): void;

    // -----------------------------------------------------------------------
    // Pane management (for z-index layering)
    // -----------------------------------------------------------------------

    /** Get a pane element by name. */
    getPane(name: string): HTMLElement | null;

    /** Create a new pane with the given name. */
    createPane(name: string, container?: HTMLElement): HTMLElement | undefined;

    // -----------------------------------------------------------------------
    // Event delegation
    // -----------------------------------------------------------------------

    /** Subscribe to a map event. */
    on(event: MapEvent | string, cb: EventHandler): void;

    /** Unsubscribe from a map event. */
    off(event: MapEvent | string, cb: EventHandler): void;

    // -----------------------------------------------------------------------
    // Tile layer
    // -----------------------------------------------------------------------

    /** Render a tile layer from a URL template. */
    renderTile(url: string, attribution: string): void;

    // -----------------------------------------------------------------------
    // GeoJSON rendering
    // -----------------------------------------------------------------------

    /** Render GeoJSON features with styling and per-feature callbacks. */
    renderGeoJson(
        data: GeoJSON.GeoJsonObject,
        style: GeoJsonStyle | ((feature: GeoJSON.Feature) => GeoJsonStyle),
        onEach: OnEachFeature,
    ): MapLayer | null;

    // -----------------------------------------------------------------------
    // Heatmap
    // -----------------------------------------------------------------------

    /** Create a heatmap layer from [lat, lng, weight] triples. */
    createHeatLayer(
        latlngs: Array<[number, number, number]>,
        options?: {
            radius?: number;
            blur?: number;
            minOpacity?: number;
            maxZoom?: number;
            max?: number;
            pane?: string;
        },
    ): MapLayer | null;

    // -----------------------------------------------------------------------
    // Polyline
    // -----------------------------------------------------------------------

    /** Create a polyline (not yet added to the map). */
    createPolyline(
        latlngs: LatLngTuple[],
        options?: {
            color?: string;
            weight?: number;
            opacity?: number;
            pane?: string;
            interactive?: boolean;
            className?: string;
        },
    ): MapLayer | null;

    // -----------------------------------------------------------------------
    // Cluster group (creates a cluster group — caller adds to map)
    // -----------------------------------------------------------------------

    /** Create a marker cluster group (does not add to map). */
    renderClusterGroup(
        points: unknown[],
        options?: {
            disableClusteringAtZoom?: number;
            maxClusterRadius?: number;
            showCoverageOnHover?: boolean;
            zoomToBoundsOnClick?: boolean;
            animate?: boolean;
        },
    ): MapLayer | null;

    // -----------------------------------------------------------------------
    // Attribution control
    // -----------------------------------------------------------------------

    /** Reposition the attribution control. */
    repositionAttribution(position: ControlPosition): void;

    // -----------------------------------------------------------------------
    // E2E testing hooks
    // -----------------------------------------------------------------------

    /** Expose an API object under `window[namespace]` for test automation. */
    exposeE2E(namespace: string, api: Record<string, unknown>): void;
}
