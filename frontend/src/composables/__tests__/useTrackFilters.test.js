import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ref, nextTick } from "vue";
import { useTrackFilters } from "../useTrackFilters";

// Helper to create a mock polyline object
function makePoly({
  categories = ["hiking"],
  length_km = 10,
  elevation_gain = null,
  elevation_up = null,
  slope_min = null,
  slope_max = null,
  id = Math.random().toString(36).slice(2),
} = {}) {
  return {
    keyFallback: id,
    latlngs: [
      [0, 0],
      [1, 1],
    ],
    color: "#f00",
    properties: {
      id,
      categories,
      length_km,
      elevation_gain,
      elevation_up,
      slope_min,
      slope_max,
    },
  };
}

describe("useTrackFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    import.meta.env.MODE = "test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setup(polylines = [], opts = {}) {
    const props = ref({
      polylines,
      selectedTrackDetail: opts.selectedTrackDetail ?? null,
    });
    const emitted = [];
    const emit = (event, payload) => emitted.push({ event, payload });
    const isTransitioning = ref(false);
    const debouncedFilterUpdate = vi.fn();

    const result = useTrackFilters(props, emit, {
      isTransitioning,
      debouncedFilterUpdate,
    });

    return { props, emitted, isTransitioning, debouncedFilterUpdate, ...result };
  }

  // ── Session data ──────────────────────────────────────────────────────
  describe("session data refs", () => {
    it("initialises with empty Sets", () => {
      const { sessionCategories, sessionTrackLengths, sessionElevationGains, sessionSlopeValues } = setup();
      expect(sessionCategories.value.size).toBe(0);
      expect(sessionTrackLengths.value.size).toBe(0);
      expect(sessionElevationGains.value.size).toBe(0);
      expect(sessionSlopeValues.value.size).toBe(0);
    });

    it("populates session data from initial polylines", () => {
      const poly = makePoly({
        categories: ["hiking", "cycling"],
        length_km: 5,
        elevation_gain: 200,
        slope_min: 2,
        slope_max: 15,
      });
      const { sessionCategories, sessionTrackLengths, sessionElevationGains, sessionSlopeValues } = setup([poly]);

      expect(sessionCategories.value.has("hiking")).toBe(true);
      expect(sessionCategories.value.has("cycling")).toBe(true);
      expect(sessionTrackLengths.value.has(5)).toBe(true);
      expect(sessionElevationGains.value.has(200)).toBe(true);
      expect(sessionSlopeValues.value.has(2)).toBe(true);
      expect(sessionSlopeValues.value.has(15)).toBe(true);
    });

    it("falls back to elevation_up when elevation_gain is absent", () => {
      const poly = makePoly({ elevation_up: 300 });
      const { sessionElevationGains } = setup([poly]);
      expect(sessionElevationGains.value.has(300)).toBe(true);
    });
  });

  // ── Computed ranges ──────────────────────────────────────────────────
  describe("viewport-scoped computed ranges", () => {
    it("computes min/max track length from polylines", () => {
      const polys = [makePoly({ length_km: 3 }), makePoly({ length_km: 12 })];
      const { minTrackLength, maxTrackLength } = setup(polys);
      expect(minTrackLength.value).toBe(3);
      expect(maxTrackLength.value).toBe(12);
    });

    it("returns defaults when polylines are empty", () => {
      const { minTrackLength, maxTrackLength, maxElevationGain, maxSlope } = setup([]);
      expect(minTrackLength.value).toBe(0);
      expect(maxTrackLength.value).toBe(50);
      expect(maxElevationGain.value).toBe(2000);
      expect(maxSlope.value).toBe(20);
    });

    it("computes min/max elevation gain with fallback", () => {
      const polys = [
        makePoly({ elevation_up: 100 }),
        makePoly({ elevation_gain: 500 }),
      ];
      const { minElevationGain, maxElevationGain } = setup(polys);
      expect(minElevationGain.value).toBe(100);
      expect(maxElevationGain.value).toBe(500);
    });

    it("computes min/max slope", () => {
      const polys = [
        makePoly({ slope_min: 1, slope_max: 10 }),
        makePoly({ slope_min: 3, slope_max: 18 }),
      ];
      const { minSlope, maxSlope } = setup(polys);
      expect(minSlope.value).toBe(1);
      expect(maxSlope.value).toBe(18);
    });
  });

  // ── Global ranges ────────────────────────────────────────────────────
  describe("global session-based ranges", () => {
    it("tracks expanding session lengths across polylines", () => {
      const polys = [makePoly({ length_km: 4 }), makePoly({ length_km: 20 })];
      const { globalMinTrackLength, globalMaxTrackLength } = setup(polys);
      expect(globalMinTrackLength.value).toBe(4);
      expect(globalMaxTrackLength.value).toBe(20);
    });

    it("returns defaults when session data is empty", () => {
      const { globalMinElevationGain, globalMaxElevationGain } = setup([]);
      expect(globalMinElevationGain.value).toBe(0);
      expect(globalMaxElevationGain.value).toBe(2000);
    });

    it("computes globalCategories from session", () => {
      const polys = [
        makePoly({ categories: ["hiking"] }),
        makePoly({ categories: ["cycling"] }),
      ];
      const { globalCategories } = setup(polys);
      expect(globalCategories.value).toEqual(["cycling", "hiking"]);
    });
  });

  // ── hasElevationData / hasSlopeData ──────────────────────────────────
  describe("data availability checks", () => {
    it("hasElevationData returns true when elevation_gain is present", () => {
      const { hasElevationData } = setup([makePoly({ elevation_gain: 100 })]);
      expect(hasElevationData.value).toBe(true);
    });

    it("hasElevationData returns false when no elevation data", () => {
      const { hasElevationData } = setup([makePoly()]);
      expect(hasElevationData.value).toBe(false);
    });

    it("hasSlopeData returns true when slope_min is present", () => {
      const { hasSlopeData } = setup([makePoly({ slope_min: 1 })]);
      expect(hasSlopeData.value).toBe(true);
    });

    it("hasSlopeData returns false when no slope data", () => {
      const { hasSlopeData } = setup([makePoly()]);
      expect(hasSlopeData.value).toBe(false);
    });
  });

  // ── filterState ──────────────────────────────────────────────────────
  describe("filterState", () => {
    it("initialises with correct defaults", () => {
      const { filterState } = setup();
      // The initialization watcher fires immediately (immediate: true) and
      // updates lengthRange from [0,0] → [0,50] (the defaults for empty polylines).
      expect(filterState.value).toEqual({
        categories: [],
        lengthRange: [0, 50],
        elevationGainRange: [0, 2000],
        slopeRange: [0, 20],
        showHeatmap: false,
      });
    });
  });

  // ── geoJsonFilter ────────────────────────────────────────────────────
  describe("geoJsonFilter", () => {
    it("returns false when no categories are selected", () => {
      const { geoJsonFilter, filterState } = setup();
      filterState.value = { ...filterState.value, categories: [] };
      const feature = { properties: { categories: ["hiking"], length_km: 5 } };
      expect(geoJsonFilter(feature, null)).toBe(false);
    });

    it("filters by matching category", () => {
      const { geoJsonFilter, filterState } = setup();
      filterState.value = {
        ...filterState.value,
        categories: ["hiking"],
        lengthRange: [0, 100],
      };
      const match = { properties: { categories: ["hiking"], length_km: 10 } };
      const noMatch = { properties: { categories: ["cycling"], length_km: 10 } };
      expect(geoJsonFilter(match, null)).toBe(true);
      expect(geoJsonFilter(noMatch, null)).toBe(false);
    });

    it("filters by length range with epsilon tolerance", () => {
      const { geoJsonFilter, filterState } = setup();
      filterState.value = {
        ...filterState.value,
        categories: ["hiking"],
        lengthRange: [5, 10],
      };
      const feature = { properties: { categories: ["hiking"], length_km: 5.3 } };
      expect(geoJsonFilter(feature, null)).toBe(true);
    });

    it("filters by elevation gain range", () => {
      const { geoJsonFilter, filterState } = setup();
      filterState.value = {
        ...filterState.value,
        categories: ["hiking"],
        lengthRange: [0, 100],
        elevationGainRange: [100, 500],
      };
      const match = { properties: { categories: ["hiking"], length_km: 5, elevation_gain: 200 } };
      const noMatch = { properties: { categories: ["hiking"], length_km: 5, elevation_gain: 800 } };
      expect(geoJsonFilter(match, null)).toBe(true);
      expect(geoJsonFilter(noMatch, null)).toBe(false);
    });

    it("passes tracks with null elevation through elevation filter", () => {
      const { geoJsonFilter, filterState } = setup();
      filterState.value = {
        ...filterState.value,
        categories: ["hiking"],
        lengthRange: [0, 100],
        elevationGainRange: [100, 500],
      };
      const feature = { properties: { categories: ["hiking"], length_km: 5 } };
      expect(geoJsonFilter(feature, null)).toBe(true);
    });

    it("filters by slope range with overlap logic", () => {
      const { geoJsonFilter, filterState } = setup();
      filterState.value = {
        ...filterState.value,
        categories: ["hiking"],
        lengthRange: [0, 100],
        slopeRange: [5, 15],
      };
      const overlap = { properties: { categories: ["hiking"], length_km: 5, slope_min: 3, slope_max: 12 } };
      const noOverlap = { properties: { categories: ["hiking"], length_km: 5, slope_min: 16, slope_max: 20 } };
      expect(geoJsonFilter(overlap, null)).toBe(true);
      expect(geoJsonFilter(noOverlap, null)).toBe(false);
    });

    it("shows only selected track when selectedTrackDetail is set", () => {
      const selectedId = "abc-123";
      const { geoJsonFilter, props } = setup([], { selectedTrackDetail: { id: selectedId } });
      const match = { properties: { id: selectedId } };
      const noMatch = { properties: { id: "other-id" } };
      expect(geoJsonFilter(match, null)).toBe(true);
      expect(geoJsonFilter(noMatch, null)).toBe(false);
    });

    it("shows all tracks when transitioning with no categories", () => {
      const { geoJsonFilter, filterState, isTransitioning } = setup();
      isTransitioning.value = true;
      filterState.value = { ...filterState.value, categories: [] };
      const feature = { properties: { categories: ["hiking"], length_km: 5 } };
      expect(geoJsonFilter(feature, null)).toBe(true);
    });

    it("applies filter even during transition when categories are set", () => {
      const { geoJsonFilter, filterState, isTransitioning } = setup();
      isTransitioning.value = true;
      filterState.value = {
        ...filterState.value,
        categories: ["cycling"],
        lengthRange: [0, 100],
      };
      const match = { properties: { categories: ["cycling"], length_km: 5 } };
      const noMatch = { properties: { categories: ["hiking"], length_km: 5 } };
      expect(geoJsonFilter(match, null)).toBe(true);
      expect(geoJsonFilter(noMatch, null)).toBe(false);
    });
  });

  // ── filteredTracks ───────────────────────────────────────────────────
  describe("filteredTracks", () => {
    it("filters polylines based on current filter state", () => {
      const polys = [
        makePoly({ id: "a", categories: ["hiking"], length_km: 5 }),
        makePoly({ id: "b", categories: ["cycling"], length_km: 10 }),
      ];
      const { filteredTracks, filterState } = setup(polys);
      filterState.value = {
        ...filterState.value,
        categories: ["hiking"],
        lengthRange: [0, 100],
      };
      // filteredTracks is a computed, so it should update reactively
      expect(filteredTracks.value.length).toBe(1);
      expect(filteredTracks.value[0].properties.id).toBe("a");
    });

    it("returns empty array when polylines is empty", () => {
      const { filteredTracks } = setup([]);
      expect(filteredTracks.value).toEqual([]);
    });
  });

  // ── onFilterChange ───────────────────────────────────────────────────
  describe("onFilterChange", () => {
    it("updates filterState and emits filter-changed in test mode", () => {
      const { onFilterChange, filterState, emitted } = setup();
      const newState = {
        categories: ["hiking"],
        lengthRange: [0, 10],
        elevationGainRange: [0, 1000],
        slopeRange: [0, 15],
        showHeatmap: false,
      };
      onFilterChange(newState);
      expect(filterState.value.categories).toEqual(["hiking"]);
      expect(emitted.some((e) => e.event === "filter-changed")).toBe(true);
    });

    it("ignores identical filter state to avoid event loops", () => {
      const { onFilterChange, filterState, emitted } = setup();
      // Make filterState equal to newFilterState
      const state = { ...filterState.value };
      onFilterChange(state);
      // No change, so should not emit
      expect(emitted.length).toBe(0);
    });
  });

  // ── allCategories ────────────────────────────────────────────────────
  describe("allCategories", () => {
    it("returns categories from current polylines", () => {
      const polys = [
        makePoly({ categories: ["hiking"] }),
        makePoly({ categories: ["cycling", "hiking"] }),
      ];
      const { allCategories } = setup(polys);
      expect(allCategories.value).toEqual(["cycling", "hiking"]);
    });

    it("falls back to session categories when polylines are empty", async () => {
      const polys = [makePoly({ categories: ["hiking"] })];
      const { allCategories, props } = setup(polys);
      // Set polylines to empty after initial load
      props.value = { ...props.value, polylines: [] };
      await nextTick(); // let watchers settle
      // Should still show session categories
      expect(allCategories.value).toContain("hiking");
    });
  });
});
