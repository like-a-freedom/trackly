/**
 * MapAdapter — port interface for map rendering.
 *
 * Every adapter must implement these methods:
 * - renderTile(url, attribution) — render a tile layer
 * - renderGeoJson(data, style, onEach) — render GeoJSON features
 * - renderClusterGroup(points, options) — render clustered markers
 * - on(event, cb) / off(event, cb) — event delegation
 * - getCenter() — current map center [lat, lng]
 * - isIdle() — whether the map has finished animating
 * - fitBounds(bbox) — fit map to bounds [[south, west], [north, east]]
 * - setView(center, zoom) — set map view
 * - exposeE2E(namespace, api) — expose hooks for E2E testing
 */

/**
 * @typedef {{ south: number, west: number, north: number, east: number }} BoundingBox
 */

export const MAP_EVENTS = {
    MOVE_END: 'moveend',
    ZOOM_END: 'zoomend',
    CLICK: 'click',
    RESIZE: 'resize',
};
