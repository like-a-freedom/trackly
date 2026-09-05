import type { LatLng } from 'leaflet';

/**
 * Extract Leaflet LatLng from a touch event.
 * @param map - Leaflet map instance
 * @param event - Leaflet event with originalEvent
 * @returns LatLng or null if unavailable
 */
export function getLatLngFromTouch(map: L.Map, event: L.LeafletMouseEvent): LatLng | null {
  if (!map || typeof map.mouseEventToLatLng !== 'function') return null;

  const originalEvent = event?.originalEvent as MouseEvent | TouchEvent | null;
  if (!originalEvent) return null;

  // Extract touch point from TouchEvent-like objects
  // Use property checks instead of instanceof to support test mocks
  const touchesLike = originalEvent as unknown as {
    changedTouches?: { clientX: number; clientY: number; pageX: number; pageY: number }[];
    touches?: { clientX: number; clientY: number; pageX: number; pageY: number }[];
  };

  if (touchesLike.changedTouches?.[0]) {
    return map.mouseEventToLatLng(touchesLike.changedTouches[0] as unknown as MouseEvent);
  }
  if (touchesLike.touches?.[0]) {
    return map.mouseEventToLatLng(touchesLike.touches[0] as unknown as MouseEvent);
  }

  return null;
}
