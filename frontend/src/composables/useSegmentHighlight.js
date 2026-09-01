import { ref } from "vue";
import {
  POLYLINE_WEIGHT_ACTIVE,
  POLYLINE_WEIGHT_SELECTED_DETAIL,
  POLYLINE_WEIGHT_DEFAULT,
  POLYLINE_OPACITY_ACTIVE,
  POLYLINE_OPACITY_HOVER_DIM,
  POLYLINE_OPACITY_SELECTED_DETAIL,
  POLYLINE_OPACITY_DEFAULT,
} from "../utils/mapConstants.js";

/**
 * Composable that encapsulates hover / highlight logic for map segments.
 *
 * Originally extracted from TrackMap.vue to keep component markup lean
 * and make the highlighting behaviour independently testable.
 *
 * @param {Object} leafletAdapter - Adapter wrapping Leaflet map operations
 *   (createPolyline, addLayer, …).
 * @param {Object} [deps] - Reactive dependencies from the host component.
 * @param {import('vue').Ref<boolean>} [deps.isZoomAnimating]
 * @param {import('vue').Ref<boolean>} [deps.isUnmounting]
 * @param {import('vue').Ref<boolean>} [deps.isPanningOrZooming]
 * @param {Function} [deps.getMapObject] - Returns the raw Leaflet map instance.
 * @param {Function} [deps.getSelectedTrackDetail] - Returns the selected track detail.
 * @param {Function} [deps.getPolylines] - Returns the current polylines array.
 * @param {Function} [deps.getActiveTrackId] - Returns the active track id.
 */
export function useSegmentHighlight(leafletAdapter, deps = {}) {
  // ---------------------------------------------------------------------------
  // Safe window reference (undefined in Node test environments)
  // ---------------------------------------------------------------------------
  const _w = typeof window !== "undefined" ? window : undefined;

  // ---------------------------------------------------------------------------
  // Internal reactive state
  // ---------------------------------------------------------------------------
  const hoveredMarkerPolyline = ref(null);
  const hoveredMarker = ref(null);
  const hoveredSegmentPolyline = ref(null);
  const markerGapLine = ref(null);
  // When highlighting a single-segment track we prefer to temporarily adjust the existing layer
  // instead of overlaying a new colored polyline (this preserves the original track color)
  const highlightedLayer = ref(null);
  const highlightedLayerOrigStyle = ref(null);
  // For testing/observability: record last auto-pan target
  const lastAutoPanTarget = ref(null);

  // ---------------------------------------------------------------------------
  // Dependency accessors — resolve both ref (.value) and plain getter (fn())
  // patterns so the composable works with Vue refs in production *and*
  // simple objects in unit tests.
  // ---------------------------------------------------------------------------
  function _resolve(dep, fallback) {
    if (dep == null) return fallback;
    if (typeof dep === "object" && "value" in dep) return dep.value;
    if (typeof dep === "function") return dep();
    return dep;
  }

  const _isZoomAnimating = () => _resolve(deps.isZoomAnimating, false);
  const _isUnmounting = () => _resolve(deps.isUnmounting, false);
  const _isPanningOrZooming = () => _resolve(deps.isPanningOrZooming, false);
  const _getMapObject = (ctx) => {
    const d = deps.getMapObject;
    if (typeof d === "function") return d(ctx);
    if (d && typeof d === "object" && "value" in d && typeof d.value === "function")
      return d.value(ctx);
    return null;
  };
  const _getSelectedTrackDetail = () => _resolve(deps.getSelectedTrackDetail, null);
  const _getPolylines = () => _resolve(deps.getPolylines, []);
  const _getActiveTrackId = () => _resolve(deps.getActiveTrackId, null);

  // ---------------------------------------------------------------------------
  // Styling helpers
  // ---------------------------------------------------------------------------

  /**
   * Calculates the weight for a given polyline based on the current map state.
   * @param {Object} poly - The polyline object.
   * @returns {number} The weight for the polyline.
   */
  function getPolylineWeight(poly) {
    if (poly.properties && poly.properties.id === _getActiveTrackId()) {
      return POLYLINE_WEIGHT_ACTIVE;
    }
    if (_getSelectedTrackDetail()) {
      return POLYLINE_WEIGHT_SELECTED_DETAIL;
    }
    return POLYLINE_WEIGHT_DEFAULT;
  }

  /**
   * Calculates the opacity for a given polyline based on the current map state.
   * @param {Object} poly - The polyline object.
   * @returns {number} The opacity for the polyline.
   */
  function getPolylineOpacity(poly) {
    if (_getActiveTrackId()) {
      return poly.properties && poly.properties.id === _getActiveTrackId()
        ? POLYLINE_OPACITY_ACTIVE
        : POLYLINE_OPACITY_HOVER_DIM;
    }
    if (_getSelectedTrackDetail()) {
      return POLYLINE_OPACITY_SELECTED_DETAIL;
    }
    return POLYLINE_OPACITY_DEFAULT;
  }

  /**
   * Calculates the weight for a given GeoJSON feature based on the current map state.
   * @param {Object} feature - The GeoJSON feature object.
   * @returns {number} The weight for the feature.
   */
  function getFeatureWeight(feature) {
    if (feature.properties && feature.properties.id === _getActiveTrackId()) {
      return POLYLINE_WEIGHT_ACTIVE;
    }
    if (_getSelectedTrackDetail()) {
      return POLYLINE_WEIGHT_SELECTED_DETAIL;
    }
    return POLYLINE_WEIGHT_DEFAULT;
  }

  /**
   * Calculates the opacity for a given GeoJSON feature based on the current map state.
   * @param {Object} feature - The GeoJSON feature object.
   * @returns {number} The opacity for the feature.
   */
  function getFeatureOpacity(feature) {
    if (_getActiveTrackId()) {
      return feature.properties && feature.properties.id === _getActiveTrackId()
        ? POLYLINE_OPACITY_ACTIVE
        : POLYLINE_OPACITY_HOVER_DIM;
    }
    if (_getSelectedTrackDetail()) {
      return POLYLINE_OPACITY_SELECTED_DETAIL;
    }
    return POLYLINE_OPACITY_DEFAULT;
  }

  // GeoJSON layer styling function
  function geoJsonStyle(feature) {
    return {
      color: feature.properties.color,
      weight: getFeatureWeight(feature),
      opacity: getFeatureOpacity(feature),
    };
  }

  // ---------------------------------------------------------------------------
  // Marker stroke / fill helpers
  // ---------------------------------------------------------------------------

  /**
   * Get stroke color for chart hover marker based on segment index.
   * @param {Object} markerData - Marker data with segmentIndex property
   * @returns {string} Color hex string
   */
  function getMarkerStrokeColor(markerData) {
    // Default blue color for single-segment tracks or when segmentIndex is not provided
    if (!markerData.segmentIndex && markerData.segmentIndex !== 0) {
      return "#3B82F6"; // Default blue
    }

    // Use a color palette for multi-segment tracks
    const colors = [
      "#3B82F6", // Blue
      "#EF4444", // Red
      "#10B981", // Green
      "#F59E0B", // Amber
      "#8B5CF6", // Purple
      "#EC4899", // Pink
      "#14B8A6", // Teal
      "#F97316", // Orange
    ];

    return colors[markerData.segmentIndex % colors.length];
  }

  /**
   * Get fill color for chart hover marker.
   * @param {Object} markerData - Marker data with segmentIndex property
   * @returns {string} Color hex string
   */
  function getMarkerFillColor(markerData) {
    // For fixed marker, use semi-transparent version of stroke color (alpha)
    const stroke = getMarkerStrokeColor(markerData) || "#3B82F6";
    // Tiny utility to add alpha to hex color (assumes #rrggbb)
    function withAlpha(hex, alpha) {
      if (!hex || hex.length !== 7) return hex;
      const a = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0");
      return `${hex}${a}`; // #rrggbbaa
    }
    return markerData && markerData.isFixed ? withAlpha(stroke, 0.28) : "white";
  }

  // ---------------------------------------------------------------------------
  // Hover / highlight functions
  // ---------------------------------------------------------------------------

  function performAutoPan(latlng, map) {
    lastAutoPanTarget.value = latlng;
    if (map && typeof map.panTo === "function") {
      try {
        map.panTo(latlng, { animate: true, duration: 0.25 });
      } catch (e) {
        // ignore pan errors
      }
    }
  }

  function showMarkerPolyline(track, map, marker) {
    // Prevent hover polylines during zoom animations or unmounting to avoid conflicts
    if (
      !track ||
      !track.latlngs ||
      !map ||
      _isZoomAnimating() ||
      _isUnmounting()
    )
      return;

    try {
      removeMarkerPolyline(map);
      if (marker) {
        marker.setOpacity(0); // Hide marker
        hoveredMarker.value = marker;
      }
      hoveredMarkerPolyline.value = leafletAdapter.createPolyline(track.latlngs, {
        color: track.color || "#3388ff",
        weight: POLYLINE_WEIGHT_ACTIVE,
        opacity: POLYLINE_OPACITY_ACTIVE,
        pane: "overlayPane",
        interactive: false,
      });
      if (hoveredMarkerPolyline.value) {
        leafletAdapter.addLayer(hoveredMarkerPolyline.value);
      }
    } catch (error) {
      console.warn("[useSegmentHighlight] Error adding hover polyline:", error);
      // Clean up on error
      removeMarkerPolyline(map);
    }
  }

  function clearSegmentHighlight(map) {
    try {
      // If we had temporarily modified an existing GeoJSON layer (single-segment highlight), restore its style
      if (highlightedLayer.value && highlightedLayerOrigStyle.value) {
        try {
          if (typeof highlightedLayer.value.setStyle === "function") {
            highlightedLayer.value.setStyle(highlightedLayerOrigStyle.value);
          }
        } catch (e) {
          console.warn("[useSegmentHighlight] Error restoring highlighted layer style:", e);
        }
        highlightedLayer.value = null;
        highlightedLayerOrigStyle.value = null;
      }

      if (hoveredSegmentPolyline.value && map) {
        map.removeLayer(hoveredSegmentPolyline.value);
        hoveredSegmentPolyline.value = null;
      }
      if (markerGapLine.value && map) {
        map.removeLayer(markerGapLine.value);
        markerGapLine.value = null;
      }
      if (_w?.__e2e) {
        try {
          _w.__e2e.lastGapLineExists = false;
          _w.__e2e.lastHighlightedColor = null;
        } catch (e) {}
      }
    } catch (e) {
      console.warn("[useSegmentHighlight] Error clearing segment highlight:", e);
      hoveredSegmentPolyline.value = null;
      markerGapLine.value = null;
      highlightedLayer.value = null;
      highlightedLayerOrigStyle.value = null;
    }
  }

  function highlightSegmentForMarker(markerData) {
    const map = _getMapObject("highlightSegmentForMarker");
    clearSegmentHighlight(map);
    // Allow fallback behavior in tests when map is not available (we still create polyline objects)
    if (
      !markerData ||
      !markerData.latlng ||
      _isPanningOrZooming() ||
      _isZoomAnimating()
    ) {
      // If the map is still animating/panning, schedule a short retry in E2E/dev mode
      try {
        if (_w?.__e2e) {
          setTimeout(() => {
            try {
              highlightSegmentForMarker(markerData);
            } catch (e) {}
          }, 150);
        }
      } catch (e) {}
      return;
    }

    // Need selected track to locate segments
    const sel = _getSelectedTrackDetail();
    if (!sel || !sel.id) return;

    const poly = (_getPolylines() || []).find(
      (p) => p.properties && p.properties.id === sel.id
    );
    if (!poly) {
      // Poly not available yet - schedule retry in E2E/dev mode
      try {
        if (_w?.__e2e) {
          setTimeout(() => highlightSegmentForMarker(markerData), 150);
        }
      } catch (e) {}
      return;
    }

    // Determine segments array format
    const rawLatlngs = poly.latlngs || [];
    const isNestedSegments =
      Array.isArray(rawLatlngs) &&
      rawLatlngs.length > 0 &&
      Array.isArray(rawLatlngs[0]) &&
      (Array.isArray(rawLatlngs[0][0]) ||
        (rawLatlngs[0][0] && typeof rawLatlngs[0][0] === "object"));
    const segments =
      poly.segments ||
      (rawLatlngs.length > 0
        ? isNestedSegments
          ? rawLatlngs
          : [rawLatlngs]
        : []);
    const segIdx = markerData.segmentIndex || 0;
    if (!segments[segIdx] || segments[segIdx].length === 0) {
      // Segments not ready - schedule retry for E2E/dev
      try {
        if (_w?.__e2e) {
          setTimeout(() => highlightSegmentForMarker(markerData), 150);
        }
      } catch (e) {}
      return;
    }

    const segCoords = segments[segIdx];

    try {
      // If map object does not exist (e.g., test environment), still create polyline objects for assertions
      // Prefer using the original track color (if available) so we don't visually change the track color
      const trackColor =
        poly.properties?.color || getMarkerStrokeColor({ segmentIndex: segIdx });

      // Expose E2E observability early so tests can assert highlighting deterministically
      if (_w?.__e2e) {
        try {
          _w.__e2e.lastHighlightedColor = trackColor;
        } catch (e) {}
      }
      // Debug: log when highlight is requested (helps e2e diagnostics)
      try {
        console.debug("[useSegmentHighlight][E2E] highlight requested", {
          trackId: sel?.id,
          segmentIndex: segIdx,
          trackColor,
        });
      } catch (e) {}

      // If the track has only a single segment and we have a live map, prefer to emphasize the existing layer
      // by increasing weight/opacity rather than overlaying a new colored polyline — this preserves the
      // original track color and avoids a visual color change for single-segment tracks.
      const isSingleSegment = segments.length === 1;

      if (map && isSingleSegment) {
        try {
          let foundLayer = null;
          // Search for the GeoJSON layer by feature id
          if (map.eachLayer) {
            map.eachLayer((layer) => {
              if (
                !foundLayer &&
                layer &&
                layer.feature &&
                layer.feature.properties &&
                layer.feature.properties.id === sel.id
              ) {
                foundLayer = layer;
              }
            });
          }

          if (foundLayer && typeof foundLayer.setStyle === "function") {
            // Save original style so it can be restored later
            highlightedLayerOrigStyle.value = {
              color: foundLayer.options?.color ?? poly.properties?.color ?? null,
              weight:
                foundLayer.options?.weight ??
                getFeatureWeight(foundLayer.feature),
              opacity:
                typeof foundLayer.options?.opacity !== "undefined"
                  ? foundLayer.options.opacity
                  : getFeatureOpacity(foundLayer.feature),
            };
            try {
              console.log("[useSegmentHighlight][E2E] using foundLayer for highlight", {
                foundLayerId: foundLayer.feature?.properties?.id,
                originalColor: highlightedLayerOrigStyle.value.color,
              });

              foundLayer.setStyle({
                weight:
                  (highlightedLayerOrigStyle.value.weight ||
                    POLYLINE_WEIGHT_ACTIVE) + 2,
                opacity: 1,
              });

              highlightedLayer.value = foundLayer;

              if (_w?.__e2e) {
                try {
                  _w.__e2e.lastHighlightedColor =
                    highlightedLayerOrigStyle.value.color || trackColor;
                } catch (e) {}
              }
            } catch (e) {
              console.warn(
                "[useSegmentHighlight] Failed to style existing layer for highlight, falling back to overlay:",
                e
              );
            }
          }
        } catch (e) {
          console.warn(
            "[useSegmentHighlight] Error trying to locate layer for single-segment highlight:",
            e
          );
        }
      }

      // If we didn't apply style on an existing layer (multi-segment or layer not found), fall back to overlay polyline
      if (!highlightedLayer.value) {
        if (!map) {
          hoveredSegmentPolyline.value = leafletAdapter.createPolyline(segCoords, {
            color: trackColor,
            weight: (POLYLINE_WEIGHT_ACTIVE || 6) + 2,
            opacity: 1,
            interactive: false,
            className: "chart-hover-segment",
          });

          // Expose E2E observability for tests (non-production only)
          if (_w?.__e2e) {
            try {
              _w.__e2e.lastHighlightedColor = trackColor;
            } catch (e) {}
          }

          const nearest = findNearestPointOnCoords(markerData.latlng, segCoords);
          if (nearest) {
            markerGapLine.value = leafletAdapter.createPolyline([markerData.latlng, nearest], {
              color: trackColor,
              weight: 1.5,
              opacity: 0.6,
              interactive: false,
              className: "chart-gap-line",
            });

            if (_w?.__e2e) {
              try {
                _w.__e2e.lastGapLineExists = true;
              } catch (e) {}
            }
          }

          return;
        }

        hoveredSegmentPolyline.value = leafletAdapter.createPolyline(segCoords, {
          color: trackColor,
          weight: (POLYLINE_WEIGHT_ACTIVE || 6) + 2,
          opacity: 1,
          pane: "overlayPane",
          interactive: false,
          className: "chart-hover-segment",
        });
        if (hoveredSegmentPolyline.value) {
          leafletAdapter.addLayer(hoveredSegmentPolyline.value);
        }

        // Expose highlight color for E2E in map-enabled environments
        if (import.meta.env.MODE !== "production" && _w?.__e2e) {
          try {
            _w.__e2e.lastHighlightedColor = trackColor;
          } catch (e) {}
        }

        // Draw gap line from marker to nearest point on segment
        const nearest = findNearestPointOnCoords(markerData.latlng, segCoords);
        if (nearest) {
          markerGapLine.value = leafletAdapter.createPolyline([markerData.latlng, nearest], {
            color: trackColor,
            weight: 1.5,
            opacity: 0.6,
            pane: "overlayPane",
            interactive: false,
            className: "chart-gap-line",
          });
          if (markerGapLine.value) {
            leafletAdapter.addLayer(markerGapLine.value);
          }

          if (import.meta.env.MODE !== "production" && _w?.__e2e) {
            try {
              _w.__e2e.lastGapLineExists = true;
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn("[useSegmentHighlight] Error highlighting segment:", err);
      clearSegmentHighlight(map);
    }
  }

  function findNearestPointOnCoords(point, coords) {
    if (!point || !coords || coords.length === 0) return null;
    const pointArray = Array.isArray(point) ? point : [point.lat, point.lng];
    const [plat, plng] = pointArray;
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) return null;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const coord = coords[i];
      const coordArray = Array.isArray(coord) ? coord : [coord.lat, coord.lng];
      const [lat, lng] = coordArray;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const d = (lat - plat) * (lat - plat) + (lng - plng) * (lng - plng);
      if (d < bestDist) {
        bestDist = d;
        best = coordArray;
      }
    }
    return best;
  }

  function removeMarkerPolyline(map) {
    try {
      if (hoveredMarkerPolyline.value && map) {
        map.removeLayer(hoveredMarkerPolyline.value);
        hoveredMarkerPolyline.value = null;
      }
      if (hoveredMarker.value) {
        hoveredMarker.value.setOpacity(1); // Restore marker
        hoveredMarker.value = null;
      }
    } catch (error) {
      console.warn("[useSegmentHighlight] Error removing hover polyline:", error);
      // Force clear references even on error
      hoveredMarkerPolyline.value = null;
      hoveredMarker.value = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    hoveredMarkerPolyline,
    hoveredMarker,
    hoveredSegmentPolyline,
    markerGapLine,
    highlightedLayer,
    highlightedLayerOrigStyle,
    lastAutoPanTarget,
    getPolylineWeight,
    getPolylineOpacity,
    getFeatureWeight,
    getFeatureOpacity,
    geoJsonStyle,
    getMarkerStrokeColor,
    getMarkerFillColor,
    performAutoPan,
    showMarkerPolyline,
    clearSegmentHighlight,
    highlightSegmentForMarker,
    findNearestPointOnCoords,
    removeMarkerPolyline,
  };
}
