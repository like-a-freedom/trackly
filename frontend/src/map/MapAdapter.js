/**
 * MapAdapter — port interface for map rendering.
 *
 * Every adapter must implement these methods:
 * - renderTile(url, attribution) — render a tile layer
 * - renderGeoJson(data, style, onEach) — render GeoJSON features
 * - renderClusterGroup(points, options) — render clustered markers
 * - on(event, cb) / off(event, cb) — event delegation
 * - getCenter() — current map center [lat, lng]
 * - getZoom() — current zoom level
 * - getBounds() — current map bounds
 * - isIdle() — whether the map has finished animating
 * - fitBounds(bbox, options) — fit map to bounds
 * - setView(center, zoom) — set map view
 * - flyTo(center, zoom, options) — animated fly to center/zoom
 * - flyToBounds(bounds, options) — animated fly to fit bounds
 * - panTo(latlng, options) — pan to a lat/lng
 * - stop() — stop all map animations
 * - addLayer(layer) / removeLayer(layer) — layer management
 * - eachLayer(cb) — iterate all layers on the map
 * - getPane(name) / createPane(name, container) — pane management
 * - exposeE2E(namespace, api) — expose hooks for E2E testing
 *
 * @module map/MapAdapter
 */

/**
 * @typedef {{ south: number, west: number, north: number, east: number }} BoundingBox
 */

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
};
