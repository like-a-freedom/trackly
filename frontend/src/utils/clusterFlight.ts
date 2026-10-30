import type L from 'leaflet';

/** Symmetric acceleration with zero velocity and acceleration at both ends. */
export const cinematicProgress = (time: number): number => {
  const t = Math.max(0, Math.min(1, time));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Compensate for magnification so the target never drifts away on screen. */
export const clusterPanProgress = (progress: number, zoomDelta: number): number =>
  1 - (1 - progress) / 2 ** (zoomDelta * progress);

// Keep Leaflet's movement lifecycle and cancellation handle: setView per frame
// would emit moveend repeatedly and trigger API/URL updates during the flight.
type FlightMap = L.Map & {
  _stop(): void;
  _getBoundsCenterZoom(bounds: L.LatLngBounds, options: L.FitBoundsOptions): {center: L.LatLng; zoom: number};
  _moveStart(zoom: boolean): void;
  _move(center: L.LatLng, zoom: number, data?: {flyTo: boolean}): FlightMap;
  _moveEnd(zoom: boolean): void;
  _flyToFrame: number;
};

export const flyToCluster = (map: L.Map, bounds: L.LatLngBounds, options: L.FitBoundsOptions): void => {
  const camera = map as FlightMap;
  camera._stop();
  const target = camera._getBoundsCenterZoom(bounds, options);
  const zoom = map.getZoom();
  const from = map.project(map.getCenter(), zoom);
  const delta = map.project(target.center, zoom).subtract(from);
  const start = performance.now();
  camera._moveStart(true);
  const frame = () => {
    const time = (performance.now() - start) / 1100;
    if (time >= 1) {
      camera._move(target.center, target.zoom)._moveEnd(true);
      return;
    }
    const progress = cinematicProgress(time);
    camera._move(map.unproject(from.add(delta.multiplyBy(clusterPanProgress(progress, target.zoom - zoom))), zoom), zoom + (target.zoom - zoom) * progress, {flyTo:true});
    camera._flyToFrame = requestAnimationFrame(frame);
  };
  camera._flyToFrame = requestAnimationFrame(frame);
};
