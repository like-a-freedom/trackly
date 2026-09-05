// frontend/src/leaflet-patch.ts
// Comprehensive Leaflet patches based on GitHub issues #4453 and #999
import L from 'leaflet';
import type { ZoomAnimEvent } from 'leaflet';

// Declare global for debug flag
declare global {
    interface Window {
        DEBUG_LEAFLET_ERRORS?: boolean;
    }
}

// Type for internal Leaflet properties not exposed in public types
interface InternalLayer {
    _map: L.Map | null;
    _animateZoom?: (e: ZoomAnimEvent) => void;
    _onZoomEnd?: () => void;
}

interface InternalMap {
    _mapPane: HTMLElement | null;
    _latLngToNewLayerPoint?: (latlng: L.LatLng, zoom: number, center: L.LatLng) => L.Point;
}

interface InternalMarker {
    _icon: HTMLElement | null;
}

interface InternalPolyline {
    _parts: L.LatLng[][];
}

// 1. Patch Layer._animateZoom to handle null map references (Issue #4453)
const origLayerAnimateZoom = (L.Layer.prototype as unknown as { _animateZoom: (e: ZoomAnimEvent) => void })._animateZoom;
(L.Layer.prototype as unknown as { _animateZoom: (e: ZoomAnimEvent) => void })._animateZoom = function (e: ZoomAnimEvent) {
    const layer = this as unknown as InternalLayer;
    try {
        // Check if this layer has been removed from the map
        if (!layer._map || !(layer._map as unknown as InternalMap)._mapPane || !(layer._map as unknown as InternalMap)._latLngToNewLayerPoint) {
            return; // Silently ignore removed layers
        }
        origLayerAnimateZoom.call(this, e);
    } catch (err: unknown) {
        if (
            err instanceof Error &&
            (err.message.includes('_latLngToNewLayerPoint') ||
                err.message.includes('Cannot read property') ||
                err.message.includes('Cannot read properties'))
        ) {
            // Suppress known harmless errors during zoom animations
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED LEAFLET ERROR]', err.message, this);
            }
            return;
        }
        throw err;
    }
};

// 2. Patch Marker._animateZoom specifically (Issue #4453)
if (L.Marker && (L.Marker.prototype as unknown as { _animateZoom?: unknown })._animateZoom) {
    const origMarkerAnimateZoom = (L.Marker.prototype as unknown as { _animateZoom: (e: ZoomAnimEvent) => void })._animateZoom;
    (L.Marker.prototype as unknown as { _animateZoom: (e: ZoomAnimEvent) => void })._animateZoom = function (e: ZoomAnimEvent) {
        const marker = this as unknown as InternalMarker & { _map: L.Map | null };
        try {
            // Additional checks for marker-specific issues
            if (!marker._map || !(marker._map as unknown as InternalMap)._mapPane || !marker._icon) {
                return; // Marker has been removed or not properly initialized
            }
            origMarkerAnimateZoom.call(this, e);
        } catch (err: unknown) {
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED MARKER ZOOM ERROR]', err instanceof Error ? err.message : String(err), this);
            }
            return;
        }
    };
}

// 3. Patch Polyline._animateZoom for polyline-specific issues
if (L.Polyline && (L.Polyline.prototype as unknown as { _animateZoom?: unknown })._animateZoom) {
    const origPolylineAnimateZoom = (L.Polyline.prototype as unknown as { _animateZoom: (e: ZoomAnimEvent) => void })._animateZoom;
    (L.Polyline.prototype as unknown as { _animateZoom: (e: ZoomAnimEvent) => void })._animateZoom = function (e: ZoomAnimEvent) {
        const polyline = this as unknown as InternalPolyline & { _map: L.Map | null };
        try {
            if (!polyline._map || !(polyline._map as unknown as InternalMap)._mapPane || !polyline._parts || polyline._parts.length === 0) {
                return; // Polyline has been removed or has no parts
            }
            origPolylineAnimateZoom.call(this, e);
        } catch (err: unknown) {
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED POLYLINE ZOOM ERROR]', err instanceof Error ? err.message : String(err), this);
            }
            return;
        }
    };
}

// 4. Patch Map.latLngToContainerPoint to handle null cases
if (L.Map && L.Map.prototype.latLngToContainerPoint) {
    const origLatLngToContainerPoint = L.Map.prototype.latLngToContainerPoint;
    L.Map.prototype.latLngToContainerPoint = function (latlng: L.LatLngExpression) {
        try {
            if (!latlng || !(this as unknown as InternalMap)._mapPane) {
                return new L.Point(0, 0); // Return safe default
            }
            return origLatLngToContainerPoint.call(this, latlng);
        } catch (err: unknown) {
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED LATLNG_TO_CONTAINER_POINT ERROR]', err instanceof Error ? err.message : String(err));
            }
            return new L.Point(0, 0);
        }
    };
}

// 5. Enhanced Layer removal with proper event cleanup
const origLayerRemove = L.Layer.prototype.remove;
L.Layer.prototype.remove = function () {
    const layer = this as unknown as InternalLayer & { _map: L.Map | null };
    try {
        // Clear any pending zoom animation listeners (only if they exist)
        if (layer._map && layer._map.off) {
            if (typeof layer._animateZoom === 'function') {
                layer._map.off('zoomanim', layer._animateZoom, this);
            }
            if (typeof layer._onZoomEnd === 'function') {
                layer._map.off('zoomend', layer._onZoomEnd, this);
            }
        }
        return origLayerRemove.call(this);
    } catch (err: unknown) {
        if (window.DEBUG_LEAFLET_ERRORS) {
            console.warn('[LAYER REMOVAL ERROR]', err instanceof Error ? err.message : String(err), this);
        }
        // Force cleanup even on error
        layer._map = null;
        return this;
    }
};
