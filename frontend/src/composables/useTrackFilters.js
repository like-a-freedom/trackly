/**
 * Composable that encapsulates all track-filter logic previously inlined in TrackMap.vue.
 *
 * Extracted state:
 *   – session-wide category / range Sets that only ever expand
 *   – viewport-scoped min/max computed values
 *   – global (session) min/max computed values for reset
 *   – filterState ref
 *   – geoJsonFilter predicate (for <l-geo-json :filter>)
 *   – filteredTracks computed
 *   – onFilterChange / batchedFilterUpdate handlers
 *   – watchers that initialise filter ranges when track data arrives
 *
 * External dependencies accepted via the third argument so the composable
 * stays decoupled from map-specific concerns (layer re-keying, transition guards).
 */
import { ref, computed, watch, toValue } from "vue";
import { useAdvancedDebounce } from "./useAdvancedDebounce.js";

/**
 * @param {import('vue').Ref|object}  props            – component props (needs .polylines, .selectedTrackDetail)
 * @param {Function}                  emit             – component emit function
 * @param {object}                    deps
 * @param {import('vue').Ref<boolean>} deps.isTransitioning – ref that is true while a detail-view transition is running
 * @param {Function}                  deps.debouncedFilterUpdate – callback that bumps the GeoJSON layer key (owned by TrackMap)
 */
export function useTrackFilters(
  props,
  emit,
  { isTransitioning, debouncedFilterUpdate } = {}
) {
  // Normalize: works with both a Vue Ref (tests) and a reactive proxy (defineProps)
  const p = () => toValue(props);

  // ── Session data refs ───────────────────────────────────────────────────
  // Track session-wide categories that only expand, never shrink when new
  // tracks are loaded. This prevents the filter UI from losing the user's
  // current selection when panning to areas without matching tracks.
  const sessionCategories = ref(new Set());
  const sessionTrackLengths = ref(new Set());
  const sessionElevationGains = ref(new Set());
  const sessionSlopeValues = ref(new Set());

  // ── Watch for new tracks & update session data ──────────────────────────
  // Combined watcher to prevent multiple reactive cycles.
  watch(
    () => p().polylines,
    (newPolylines) => {
      if (newPolylines) {
        newPolylines.forEach((poly) => {
          // Update session categories
          if (poly.properties && Array.isArray(poly.properties.categories)) {
            poly.properties.categories.forEach((cat) => {
              if (cat && typeof cat === "string") {
                sessionCategories.value.add(cat);
              }
            });
          }

          // Update session lengths
          const length = poly.properties?.length_km;
          if (typeof length === "number" && length >= 0) {
            sessionTrackLengths.value.add(length);
          }

          // Update session elevation gains
          const elevationGain = poly.properties?.elevation_gain;
          const elevationUp = poly.properties?.elevation_up;
          const effectiveGain =
            typeof elevationGain === "number" && elevationGain >= 0
              ? elevationGain
              : typeof elevationUp === "number" && elevationUp >= 0
                ? elevationUp
                : null;

          if (effectiveGain !== null) {
            sessionElevationGains.value.add(effectiveGain);
          }

          // Update session slope values
          const slopeMin = poly.properties?.slope_min;
          const slopeMax = poly.properties?.slope_max;
          if (typeof slopeMin === "number") {
            sessionSlopeValues.value.add(slopeMin);
          }
          if (typeof slopeMax === "number") {
            sessionSlopeValues.value.add(slopeMax);
          }
        });
      }
    },
    { immediate: true, deep: true }
  );

  // ── Computed ranges (viewport-scoped) ───────────────────────────────────

  // Compute categories with smart fallback logic:
  // - If there are tracks in viewport: show only their categories
  // - If no tracks in viewport: show all session categories to preserve user selection
  const allCategories = computed(() => {
    const currentPolylines = p().polylines || [];

    if (currentPolylines.length > 0) {
      // There are tracks in viewport - show only their categories
      const currentCategories = new Set();
      currentPolylines.forEach((poly) => {
        if (poly.properties && Array.isArray(poly.properties.categories)) {
          poly.properties.categories.forEach((cat) => {
            if (cat && typeof cat === "string") {
              currentCategories.add(cat);
            }
          });
        }
      });
      return Array.from(currentCategories).sort();
    } else {
      // No tracks in viewport - show all session categories to preserve filter state
      return Array.from(sessionCategories.value).sort();
    }
  });

  // min/max lengths for visible tracks (p().polylines)
  const minTrackLength = computed(() => {
    const polylines = p().polylines || [];
    const lengths = polylines
      .map((poly) => poly.properties?.length_km)
      .filter((len) => typeof len === "number" && len >= 0);
    if (lengths.length > 0) {
      return Math.min(...lengths);
    }
    return 0;
  });

  const maxTrackLength = computed(() => {
    const polylines = p().polylines || [];
    const lengths = polylines
      .map((poly) => poly.properties?.length_km)
      .filter((len) => typeof len === "number" && len >= 0);
    if (lengths.length > 0) {
      return Math.max(...lengths);
    }
    return 50;
  });

  // Elevation gain bounds for current viewport
  // Use elevation_gain if available, fallback to elevation_up for backward compatibility
  const minElevationGain = computed(() => {
    const polylines = p().polylines || [];
    const elevationGains = polylines
      .map((poly) => {
        const gain = poly.properties?.elevation_gain;
        const up = poly.properties?.elevation_up;
        return typeof gain === "number" && gain >= 0
          ? gain
          : typeof up === "number" && up >= 0
            ? up
            : null;
      })
      .filter((gain) => gain !== null);
    if (elevationGains.length > 0) {
      return Math.min(...elevationGains);
    }
    return 0;
  });

  const maxElevationGain = computed(() => {
    const polylines = p().polylines || [];
    const elevationGains = polylines
      .map((poly) => {
        const gain = poly.properties?.elevation_gain;
        const up = poly.properties?.elevation_up;
        return typeof gain === "number" && gain >= 0
          ? gain
          : typeof up === "number" && up >= 0
            ? up
            : null;
      })
      .filter((gain) => gain !== null);
    if (elevationGains.length > 0) {
      return Math.max(...elevationGains);
    }
    return 2000;
  });

  // Slope bounds for current viewport
  const minSlope = computed(() => {
    const polylines = p().polylines || [];
    const slopes = polylines
      .map((poly) => poly.properties?.slope_min)
      .filter(
        (slope) =>
          slope !== null && slope !== undefined && typeof slope === "number"
      );
    if (slopes.length > 0) {
      return Math.min(...slopes);
    }
    return 0;
  });

  const maxSlope = computed(() => {
    const polylines = p().polylines || [];
    const slopes = polylines
      .map((poly) => poly.properties?.slope_max)
      .filter(
        (slope) =>
          slope !== null && slope !== undefined && typeof slope === "number"
      );
    if (slopes.length > 0) {
      return Math.max(...slopes);
    }
    return 20;
  });

  // ── Global session-based ranges (for reset functionality) ───────────────

  const globalMinTrackLength = computed(() => {
    const sessionLengths = Array.from(sessionTrackLengths.value);
    if (sessionLengths.length > 0) {
      return Math.min(...sessionLengths);
    }
    return 0;
  });

  const globalMaxTrackLength = computed(() => {
    const sessionLengths = Array.from(sessionTrackLengths.value);
    if (sessionLengths.length > 0) {
      return Math.max(...sessionLengths);
    }
    return 50;
  });

  const globalMinElevationGain = computed(() => {
    const elevationGains = Array.from(sessionElevationGains.value);
    if (elevationGains.length > 0) {
      return Math.min(...elevationGains);
    }
    return 0;
  });

  const globalMaxElevationGain = computed(() => {
    const elevationGains = Array.from(sessionElevationGains.value);
    if (elevationGains.length > 0) {
      return Math.max(...elevationGains);
    }
    return 2000;
  });

  const globalMinSlope = computed(() => {
    const slopes = Array.from(sessionSlopeValues.value);
    if (slopes.length > 0) {
      return Math.min(...slopes);
    }
    return 0;
  });

  const globalMaxSlope = computed(() => {
    const slopes = Array.from(sessionSlopeValues.value);
    if (slopes.length > 0) {
      return Math.max(...slopes);
    }
    return 20;
  });

  // Global session categories for reset functionality
  const globalCategories = computed(() => {
    return Array.from(sessionCategories.value).sort();
  });

  // Check if there's elevation data available in tracks
  const hasElevationData = computed(() => {
    if (!p().polylines || !p().polylines.length) return false;
    return p().polylines.some(
      (track) => track.properties && track.properties.elevation_gain != null
    );
  });

  // Check if there's slope data available in tracks
  const hasSlopeData = computed(() => {
    if (!p().polylines || !p().polylines.length) return false;
    return p().polylines.some(
      (track) =>
        track.properties &&
        (track.properties.slope_min != null ||
          track.properties.slope_max != null ||
          track.properties.slope_avg != null)
    );
  });

  // ── Filter state ────────────────────────────────────────────────────────
  const filterState = ref({
    categories: [],
    lengthRange: [0, 0],
    elevationGainRange: [0, 2000],
    slopeRange: [0, 20],
    showHeatmap: false,
  });

  // ── Native Leaflet filter function ──────────────────────────────────────
  function geoJsonFilter(feature, _layer) {
    // During transition, maintain the same filter behavior as before the transition
    // to prevent layers from being removed during L-geo-json cleanup
    const transitioning = isTransitioning?.value ?? false;

    if (transitioning) {
      // Keep showing the tracks that were visible before transition started
      // This prevents the dramatic filter behavior change that causes race condition
      const cats = feature.properties?.categories || [];
      const len = feature.properties?.length_km;

      // If we have selected categories, use them; otherwise show all tracks
      if (filterState.value.categories.length > 0) {
        const catMatch = filterState.value.categories.some((cat) =>
          cats.includes(cat)
        );
        const EPSILON = 0.5;
        const min = filterState.value.lengthRange[0];
        const max = filterState.value.lengthRange[1];
        const lenMatch = len >= min - EPSILON && len <= max + EPSILON;

        // Elevation gain filtering with fallback
        const elevationGain = feature.properties?.elevation_gain;
        const elevationUp = feature.properties?.elevation_up;
        const effectiveGain =
          typeof elevationGain === "number"
            ? elevationGain
            : typeof elevationUp === "number"
              ? elevationUp
              : null;

        const elevationMin = filterState.value.elevationGainRange[0];
        const elevationMax = filterState.value.elevationGainRange[1];
        const EPSILON_ELEVATION = 10;
        const elevationMatch =
          effectiveGain === null ||
          (effectiveGain >= elevationMin - EPSILON_ELEVATION &&
            effectiveGain <= elevationMax + EPSILON_ELEVATION);

        // Slope filtering
        const slopeMin = feature.properties?.slope_min;
        const slopeMax = feature.properties?.slope_max;
        const slopeFilterMin = filterState.value.slopeRange?.[0] ?? 0;
        const slopeFilterMax = filterState.value.slopeRange?.[1] ?? 20;
        const EPSILON_SLOPE = 0.1;

        const slopeMatch =
          slopeMin === null ||
          slopeMin === undefined ||
          slopeMax === null ||
          slopeMax === undefined ||
          (slopeMax >= slopeFilterMin - EPSILON_SLOPE &&
            slopeMin <= slopeFilterMax + EPSILON_SLOPE);

        return catMatch && lenMatch && elevationMatch && slopeMatch;
      } else {
        // During transition with no categories selected, show all tracks
        return true;
      }
    }

    // When track detail panel is open, show ONLY the selected track
    if (p().selectedTrackDetail && p().selectedTrackDetail.id) {
      return (
        feature.properties &&
        feature.properties.id === p().selectedTrackDetail.id
      );
    }

    // Apply category and length filters (only when no track detail is selected)
    const cats = feature.properties?.categories || [];
    const len = feature.properties?.length_km;

    // If no categories are selected, show nothing (test expectation)
    if (filterState.value.categories.length === 0) {
      return false;
    }

    const catMatch = filterState.value.categories.some((cat) =>
      cats.includes(cat)
    );

    // Use epsilon for both min and max to handle rounding errors
    const EPSILON = 0.5;
    const min = filterState.value.lengthRange[0];
    const max = filterState.value.lengthRange[1];
    const lenMatch = len >= min - EPSILON && len <= max + EPSILON;

    // Elevation gain filtering with fallback and larger tolerance for boundary values
    const elevationGain = feature.properties?.elevation_gain;
    const elevationUp = feature.properties?.elevation_up;
    const effectiveGain =
      typeof elevationGain === "number"
        ? elevationGain
        : typeof elevationUp === "number"
          ? elevationUp
          : null;

    const elevationMin = filterState.value.elevationGainRange[0];
    const elevationMax = filterState.value.elevationGainRange[1];
    const EPSILON_ELEVATION = 10;
    const elevationMatch =
      effectiveGain === null ||
      (effectiveGain >= elevationMin - EPSILON_ELEVATION &&
        effectiveGain <= elevationMax + EPSILON_ELEVATION);

    // Slope filtering
    const slopeMin = feature.properties?.slope_min;
    const slopeMax = feature.properties?.slope_max;
    const slopeFilterMin = filterState.value.slopeRange?.[0] ?? 0;
    const slopeFilterMax = filterState.value.slopeRange?.[1] ?? 20;
    const EPSILON_SLOPE = 0.1;

    const slopeMatch =
      slopeMin === null ||
      slopeMin === undefined ||
      slopeMax === null ||
      slopeMax === undefined ||
      (slopeMax >= slopeFilterMin - EPSILON_SLOPE &&
        slopeMin <= slopeFilterMax + EPSILON_SLOPE);

    return catMatch && lenMatch && elevationMatch && slopeMatch;
  }

  // ── Tracks that pass the current filter ─────────────────────────────────
  const filteredTracks = computed(() => {
    if (!p().polylines || !p().polylines.length) {
      return [];
    }

    return p().polylines.filter((track) => {
      const feature = {
        properties: track.properties,
      };
      return geoJsonFilter(feature, null);
    });
  });

  // ── Filter change handlers ──────────────────────────────────────────────

  // Handle filter changes from the control component with proper debouncing
  const debouncedOnFilterChange = useAdvancedDebounce(
    (newFilterState) => {
      filterState.value = { ...newFilterState };
      // Use debounced filter update to prevent excessive re-renders
      if (debouncedFilterUpdate) debouncedFilterUpdate();
      // Propagate (debounced) to parent to avoid spamming requests
      emit("filter-changed", newFilterState);
    },
    150,
    { leading: false, trailing: true }
  );

  function onFilterChange(newFilterState) {
    // Ignore emissions that don't change the filter to avoid event loops
    try {
      if (JSON.stringify(filterState.value) === JSON.stringify(newFilterState)) {
        return;
      }
    } catch (_e) {
      // If serialization fails for some reason, fall back to processing
    }

    if (import.meta.env.MODE === "test") {
      // In test mode, update immediately without debouncing
      filterState.value = { ...newFilterState };
      if (debouncedFilterUpdate) debouncedFilterUpdate();
      // Propagate filter up so parent (HomeView) can trigger server-side fetches
      emit("filter-changed", newFilterState);
    } else {
      // In production, use debounced function to prevent excessive updates
      debouncedOnFilterChange(newFilterState);
    }
  }

  // Batched filter update — waits until all range changes settle before
  // triggering a single layer re-key.
  const batchedFilterUpdate = useAdvancedDebounce(
    () => {
      if (debouncedFilterUpdate) debouncedFilterUpdate();
    },
    50,
    { leading: false, trailing: true }
  );

  // ── Watch for changes in track ranges and initialise filter ─────────────
  // Only for initialization — when filter ranges are still at their defaults
  // we snap them to the first observed track values.
  watch(
    [
      minTrackLength,
      maxTrackLength,
      minElevationGain,
      maxElevationGain,
      minSlope,
      maxSlope,
    ],
    ([minLen, maxLen, minElev, maxElev, minSlopeVal, maxSlopeVal]) => {
      let hasUpdates = false;

      // Length range
      if (
        filterState.value.lengthRange[0] === 0 &&
        filterState.value.lengthRange[1] === 0
      ) {
        filterState.value.lengthRange = [minLen, maxLen];
        hasUpdates = true;
      }

      // Elevation gain range
      if (
        filterState.value.elevationGainRange[0] === 0 &&
        filterState.value.elevationGainRange[1] === 2000
      ) {
        filterState.value.elevationGainRange = [minElev, maxElev];
        hasUpdates = true;
      }

      // Slope range
      if (
        (filterState.value.slopeRange?.[0] ?? 0) === 0 &&
        (filterState.value.slopeRange?.[1] ?? 20) === 20
      ) {
        if (!filterState.value.slopeRange) {
          filterState.value.slopeRange = [0, 20];
        }
        filterState.value.slopeRange = [minSlopeVal, maxSlopeVal];
        hasUpdates = true;
      }

      // Only trigger update if we actually changed something
      if (hasUpdates) {
        batchedFilterUpdate();
      }
    },
    { immediate: true }
  );

  // ── Public API ──────────────────────────────────────────────────────────
  return {
    sessionCategories,
    sessionTrackLengths,
    sessionElevationGains,
    sessionSlopeValues,
    allCategories,
    minTrackLength,
    maxTrackLength,
    minElevationGain,
    maxElevationGain,
    minSlope,
    maxSlope,
    globalMinTrackLength,
    globalMaxTrackLength,
    globalMinElevationGain,
    globalMaxElevationGain,
    globalMinSlope,
    globalMaxSlope,
    globalCategories,
    hasElevationData,
    hasSlopeData,
    filterState,
    geoJsonFilter,
    filteredTracks,
    onFilterChange,
    batchedFilterUpdate,
  };
}
