/**
 * E2E testing utilities for TrackMap
 * Exposes hooks for automated testing in non-production environments
 */

export function useTrackMapE2E({
  isPanningOrZooming,
  mapIsReady,
  trackZoomAnimating,
  props
}) {
  // Only initialize in non-production modes
  if (import.meta.env.MODE === 'production') {
    return { initE2E: () => {}, cleanup: () => {} };
  }

  const initE2E = (map) => {
    if (!map) return;

    window.__e2e = window.__e2e || {};
    
    window.__e2e.getMapCenter = () => {
      try {
        const c = map.getCenter();
        return { lat: c?.lat ?? null, lng: c?.lng ?? null };
      } catch (e) {
        return { lat: null, lng: null };
      }
    };

    window.__e2e._lastMapInstance = map;
    
    window.__e2e.isMapIdle = () => {
      try {
        return !isPanningOrZooming.value && mapIsReady.value && !trackZoomAnimating.value;
      } catch (e) {
        return false;
      }
    };

    window.__e2e.lastGapLineExists = false;
    window.__e2e.lastHighlightedColor = null;

    window.__e2e.forceHighlightSegment = (lat, lng, segmentIndex = 0) => {
      try {
        if (typeof lat === 'undefined' || typeof lng === 'undefined') return false;
        
        const mapInstance = window.__e2e?._lastMapInstance;
        if (!mapInstance) return false;

        let foundLayer = null;
        mapInstance.eachLayer((layer) => {
          if (!foundLayer && layer?.feature?.properties?.id === props.selectedTrackDetail?.id) {
            foundLayer = layer;
          }
        });

        if (!foundLayer || typeof foundLayer.getLatLngs !== 'function') return false;

        const latlngs = foundLayer.getLatLngs();
        const segments = Array.isArray(latlngs[0]) ? latlngs : [latlngs];
        const seg = segments[segmentIndex] || segments[0];

        let best = null;
        let bestDist = Infinity;
        for (let i = 0; i < seg.length; i++) {
          const { lat: slat, lng: slng } = seg[i];
          const d = (slat - lat) ** 2 + (slng - lng) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = [seg[i].lat, seg[i].lng];
          }
        }

        return !!best;
      } catch (e) {
        console.warn('E2E forceHighlightSegment failed:', e);
        return false;
      }
    };
  };

  const cleanup = () => {
    if (window.__e2e) {
      delete window.__e2e.getMapCenter;
      delete window.__e2e._lastMapInstance;
      delete window.__e2e.isMapIdle;
      delete window.__e2e.forceHighlightSegment;
    }
  };

  return { initE2E, cleanup };
}