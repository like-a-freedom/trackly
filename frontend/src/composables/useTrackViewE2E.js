/**
 * E2E testing utilities for TrackView
 * Exposes hooks for automated testing in non-production environments
 */
import { ref, computed } from 'vue';

export function useTrackViewE2E({
  track,
  coordinateData,
  isChartPointFixed,
  chartHoverPoint,
  markerLatLng,
  handleChartPointHover
}) {
  // Only initialize in non-production modes
  if (import.meta.env.MODE === 'production') {
    return { cleanup: () => {} };
  }

  const initE2E = () => {
    window.__e2e = window.__e2e || {};

    // Simulate hovering at a chart index
    window.__e2e.hoverAtIndex = (index, opts = {}) => {
      try {
        const idx = Number(index);
        if (!Number.isFinite(idx) || !coordinateData.value || coordinateData.value.length === 0) return false;
        const i = Math.max(0, Math.min(idx, coordinateData.value.length - 1));
        const latlng = coordinateData.value[i];
        const payload = {
          index: i,
          latlng,
          distanceKm: undefined,
          elevation: undefined,
          isFixed: !!(opts && opts.isFixed)
        };
        handleChartPointHover(payload);
        return true;
      } catch (e) {
        console.warn('E2E hoverAtIndex failed:', e);
        return false;
      }
    };

    // Fix a point at index
    window.__e2e.fixAtIndex = (index) => {
      try {
        return window.__e2e.hoverAtIndex(index, { isFixed: true });
      } catch (e) {
        console.warn('E2E fixAtIndex failed:', e);
        return false;
      }
    };

    // Allow hovering at a specific lat/lng for gap testing
    window.__e2e.hoverAtLatLng = (lat, lng, opts = {}) => {
      try {
        if (lat === undefined || lng === undefined) return false;
        const payload = { latlng: [lat, lng], isFixed: !!(opts && opts.isFixed) };
        if (opts && typeof opts.index !== 'undefined') payload.index = opts.index;
        handleChartPointHover(payload);
        if (opts && typeof opts.segmentIndex !== 'undefined' && markerLatLng?.value) {
          try { markerLatLng.value.segmentIndex = opts.segmentIndex; } catch (e) {}
        }
        return true;
      } catch (e) {
        console.warn('E2E hoverAtLatLng failed:', e);
        return false;
      }
    };

    // Clear any marker or fixed points
    window.__e2e.clearMarker = () => {
      try {
        isChartPointFixed.value = false;
        chartHoverPoint.value = null;
        markerLatLng.value = null;
        return true;
      } catch (e) {
        console.warn('E2E clearMarker failed:', e);
        return false;
      }
    };

    // Expose last marker latlng and fixed state
    window.__e2e.getLastMarkerLatLng = () => {
      try {
        const v = markerLatLng?.value?.latlng ?? null;
        if (!v) return null;
        if (Array.isArray(v) && v.length >= 2) return { lat: v[0], lng: v[1] };
        if (typeof v === 'object' && v.lat !== undefined && v.lng !== undefined) return v;
        return null;
      } catch (e) {
        return null;
      }
    };

    window.__e2e.isMarkerFixed = () => {
      try {
        return !!isChartPointFixed.value;
      } catch (e) {
        return false;
      }
    };

    window.__e2e.getLastMarkerDetails = () => {
      try {
        return markerLatLng?.value ? { ...markerLatLng.value } : null;
      } catch (e) {
        return null;
      }
    };

    window.__e2e.getCoordinateDataLength = () => {
      try {
        return coordinateData?.value?.length ?? 0;
      } catch (e) {
        return 0;
      }
    };

    window.__e2e.getLastHoverPayload = () => {
      try {
        return window.__e2e?.lastHoverPayload ? { ...window.__e2e.lastHoverPayload } : null;
      } catch (e) {
        return null;
      }
    };
  };

  const cleanup = () => {
    if (window.__e2e) {
      delete window.__e2e.hoverAtIndex;
      delete window.__e2e.fixAtIndex;
      delete window.__e2e.clearMarker;
      delete window.__e2e.getLastMarkerLatLng;
      delete window.__e2e.isMarkerFixed;
    }
  };

  return { initE2E, cleanup };
}