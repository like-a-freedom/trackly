/**
 * Extract Leaflet LatLng from a touch event.
 * @param {Object} map - Leaflet map instance
 * @param {Object} event - Leaflet event with originalEvent
 * @returns {Object|null} LatLng or null if unavailable
 */
export function getLatLngFromTouch(map, event) {
  if (!map || typeof map.mouseEventToLatLng !== 'function') return null;

  const touch =
    event?.originalEvent?.changedTouches?.[0] ||
    event?.originalEvent?.touches?.[0] ||
    null;

  if (!touch) return null;

  return map.mouseEventToLatLng(touch);
}
