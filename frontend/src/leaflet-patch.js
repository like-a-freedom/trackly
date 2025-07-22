// frontend/src/leaflet-patch.js
// Comprehensive Leaflet patches based on GitHub issues #4453 and #999
import L from 'leaflet';

// 1. Patch Layer._animateZoom to handle null map references (Issue #4453)
const origLayerAnimateZoom = L.Layer.prototype._animateZoom;
L.Layer.prototype._animateZoom = function (e) {
    try {
        // Check if this layer has been removed from the map
        if (!this._map || !this._map._mapPane || !this._map._latLngToNewLayerPoint) {
            return; // Silently ignore removed layers
        }
        origLayerAnimateZoom.call(this, e);
    } catch (err) {
        if (
            err.message &&
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
if (L.Marker && L.Marker.prototype._animateZoom) {
    const origMarkerAnimateZoom = L.Marker.prototype._animateZoom;
    L.Marker.prototype._animateZoom = function (e) {
        try {
            // Additional checks for marker-specific issues
            if (!this._map || !this._map._mapPane || !this._icon) {
                return; // Marker has been removed or not properly initialized
            }
            origMarkerAnimateZoom.call(this, e);
        } catch (err) {
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED MARKER ZOOM ERROR]', err.message, this);
            }
            return;
        }
    };
}

// 3. Patch Polyline._animateZoom for polyline-specific issues
if (L.Polyline && L.Polyline.prototype._animateZoom) {
    const origPolylineAnimateZoom = L.Polyline.prototype._animateZoom;
    L.Polyline.prototype._animateZoom = function (e) {
        try {
            if (!this._map || !this._map._mapPane || !this._parts || this._parts.length === 0) {
                return; // Polyline has been removed or has no parts
            }
            origPolylineAnimateZoom.call(this, e);
        } catch (err) {
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED POLYLINE ZOOM ERROR]', err.message, this);
            }
            return;
        }
    };
}

// 4. Patch Map.latLngToContainerPoint to handle null cases
if (L.Map && L.Map.prototype.latLngToContainerPoint) {
    const origLatLngToContainerPoint = L.Map.prototype.latLngToContainerPoint;
    L.Map.prototype.latLngToContainerPoint = function (latlng) {
        try {
            if (!latlng || !this._mapPane) {
                return new L.Point(0, 0); // Return safe default
            }
            return origLatLngToContainerPoint.call(this, latlng);
        } catch (err) {
            if (window.DEBUG_LEAFLET_ERRORS) {
                console.warn('[SUPPRESSED LATLNG_TO_CONTAINER_POINT ERROR]', err.message);
            }
            return new L.Point(0, 0);
        }
    };
}

// 5. Enhanced Layer removal with proper event cleanup
const origLayerRemove = L.Layer.prototype.remove;
L.Layer.prototype.remove = function () {
    try {
        // Clear any pending zoom animation listeners
        if (this._map && this._map.off) {
            this._map.off('zoomanim', this._animateZoom, this);
            this._map.off('zoomend', this._onZoomEnd, this);
        }
        return origLayerRemove.call(this);
    } catch (err) {
        if (window.DEBUG_LEAFLET_ERRORS) {
            console.warn('[LAYER REMOVAL ERROR]', err.message, this);
        }
        // Force cleanup even on error
        if (this._map) {
            this._map = null;
        }
        return this;
    }
};
