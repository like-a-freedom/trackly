import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useSegmentHighlight } from "../useSegmentHighlight.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockLeafletAdapter(overrides = {}) {
  return {
    createPolyline: vi.fn((_latlngs, _options) => ({
      _options,
      _latlngs,
      setStyle: vi.fn(),
    })),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    ...overrides,
  };
}

function createMockMap(overrides = {}) {
  return {
    panTo: vi.fn(),
    removeLayer: vi.fn(),
    eachLayer: vi.fn(),
    ...overrides,
  };
}

function defaultDeps(overrides = {}) {
  return {
    isZoomAnimating: ref(false),
    isUnmounting: ref(false),
    isPanningOrZooming: ref(false),
    getMapObject: vi.fn(() => null),
    getSelectedTrackDetail: ref(null),
    getPolylines: ref([]),
    getActiveTrackId: ref(null),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useSegmentHighlight", () => {
  let adapter;
  let deps;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockLeafletAdapter();
    deps = defaultDeps();
  });

  // -- Factory / return shape ------------------------------------------------
  describe("return shape", () => {
    it("exposes all expected refs and functions", () => {
      const h = useSegmentHighlight(adapter, deps);
      // Refs
      expect(h.hoveredMarkerPolyline).toBeDefined();
      expect(h.hoveredMarker).toBeDefined();
      expect(h.hoveredSegmentPolyline).toBeDefined();
      expect(h.markerGapLine).toBeDefined();
      expect(h.highlightedLayer).toBeDefined();
      expect(h.highlightedLayerOrigStyle).toBeDefined();
      expect(h.lastAutoPanTarget).toBeDefined();
      // Functions
      expect(typeof h.getPolylineWeight).toBe("function");
      expect(typeof h.getPolylineOpacity).toBe("function");
      expect(typeof h.getFeatureWeight).toBe("function");
      expect(typeof h.getFeatureOpacity).toBe("function");
      expect(typeof h.geoJsonStyle).toBe("function");
      expect(typeof h.getMarkerStrokeColor).toBe("function");
      expect(typeof h.getMarkerFillColor).toBe("function");
      expect(typeof h.performAutoPan).toBe("function");
      expect(typeof h.showMarkerPolyline).toBe("function");
      expect(typeof h.clearSegmentHighlight).toBe("function");
      expect(typeof h.highlightSegmentForMarker).toBe("function");
      expect(typeof h.findNearestPointOnCoords).toBe("function");
      expect(typeof h.removeMarkerPolyline).toBe("function");
    });
  });

  // -- findNearestPointOnCoords ---------------------------------------------
  describe("findNearestPointOnCoords", () => {
    it("returns null for empty coords", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.findNearestPointOnCoords([50, 14], [])).toBeNull();
    });

    it("returns null for null point", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.findNearestPointOnCoords(null, [[50, 14]])).toBeNull();
    });

    it("finds the closest coordinate (array form)", () => {
      const h = useSegmentHighlight(adapter, deps);
      const coords = [
        [50.0, 14.0],
        [50.1, 14.1],
        [50.5, 14.5],
      ];
      const nearest = h.findNearestPointOnCoords([50.01, 14.01], coords);
      expect(nearest).toEqual([50.0, 14.0]);
    });

    it("handles {lat,lng} objects", () => {
      const h = useSegmentHighlight(adapter, deps);
      const coords = [
        { lat: 50, lng: 14 },
        { lat: 51, lng: 15 },
      ];
      const nearest = h.findNearestPointOnCoords({ lat: 50.9, lng: 14.9 }, coords);
      expect(nearest).toEqual([51, 15]);
    });

    it("skips non-finite coordinates", () => {
      const h = useSegmentHighlight(adapter, deps);
      const coords = [
        [NaN, 14],
        [50, 14],
      ];
      const nearest = h.findNearestPointOnCoords([50, 14], coords);
      expect(nearest).toEqual([50, 14]);
    });
  });

  // -- performAutoPan -------------------------------------------------------
  describe("performAutoPan", () => {
    it("calls map.panTo and sets lastAutoPanTarget", () => {
      const map = createMockMap();
      const h = useSegmentHighlight(adapter, deps);
      const latlng = [50, 14];
      h.performAutoPan(latlng, map);
      expect(map.panTo).toHaveBeenCalledWith(latlng, {
        animate: true,
        duration: 0.25,
      });
      expect(h.lastAutoPanTarget.value).toStrictEqual(latlng);
    });

    it("does not throw when map is null", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(() => h.performAutoPan([50, 14], null)).not.toThrow();
    });
  });

  // -- getMarkerStrokeColor -------------------------------------------------
  describe("getMarkerStrokeColor", () => {
    it("returns default blue when no segmentIndex", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getMarkerStrokeColor({})).toBe("#3B82F6");
    });

    it("cycles through color palette by segmentIndex", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getMarkerStrokeColor({ segmentIndex: 0 })).toBe("#3B82F6");
      expect(h.getMarkerStrokeColor({ segmentIndex: 1 })).toBe("#EF4444");
      expect(h.getMarkerStrokeColor({ segmentIndex: 7 })).toBe("#F97316");
      expect(h.getMarkerStrokeColor({ segmentIndex: 8 })).toBe("#3B82F6"); // wraps
    });
  });

  // -- getMarkerFillColor ---------------------------------------------------
  describe("getMarkerFillColor", () => {
    it("returns white for non-fixed markers", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getMarkerFillColor({ segmentIndex: 0, isFixed: false })).toBe("white");
    });

    it("returns semi-transparent hex for fixed markers", () => {
      const h = useSegmentHighlight(adapter, deps);
      const color = h.getMarkerFillColor({ segmentIndex: 0, isFixed: true });
      expect(color).toMatch(/^#[0-9a-fA-F]{8}$/);
    });
  });

  // -- Styling helpers ------------------------------------------------------
  describe("getPolylineWeight / getFeatureWeight", () => {
    it("returns ACTIVE weight when track matches activeTrackId", () => {
      deps.getActiveTrackId.value = "track-1";
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getPolylineWeight({ properties: { id: "track-1" } })).toBe(7);
      expect(h.getFeatureWeight({ properties: { id: "track-1" } })).toBe(7);
    });

    it("returns DEFAULT weight when nothing is selected or active", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getPolylineWeight({ properties: { id: "other" } })).toBe(4);
      expect(h.getFeatureWeight({ properties: { id: "other" } })).toBe(4);
    });

    it("returns SELECTED_DETAIL weight when a track detail is selected", () => {
      deps.getSelectedTrackDetail.value = { id: "track-1" };
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getPolylineWeight({ properties: { id: "other" } })).toBe(5);
      expect(h.getFeatureWeight({ properties: { id: "other" } })).toBe(5);
    });
  });

  describe("getPolylineOpacity / getFeatureOpacity", () => {
    it("returns ACTIVE opacity for the active track", () => {
      deps.getActiveTrackId.value = "track-1";
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getPolylineOpacity({ properties: { id: "track-1" } })).toBe(1);
      expect(h.getFeatureOpacity({ properties: { id: "track-1" } })).toBe(1);
    });

    it("returns HOVER_DIM opacity for non-active tracks when one is active", () => {
      deps.getActiveTrackId.value = "track-1";
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getPolylineOpacity({ properties: { id: "other" } })).toBe(0.75);
      expect(h.getFeatureOpacity({ properties: { id: "other" } })).toBe(0.75);
    });

    it("returns DEFAULT opacity when nothing is active", () => {
      const h = useSegmentHighlight(adapter, deps);
      expect(h.getPolylineOpacity({ properties: { id: "x" } })).toBe(0.85);
      expect(h.getFeatureOpacity({ properties: { id: "x" } })).toBe(0.85);
    });
  });

  // -- geoJsonStyle ---------------------------------------------------------
  describe("geoJsonStyle", () => {
    it("returns color, weight, opacity from feature properties", () => {
      deps.getActiveTrackId.value = "track-1";
      const h = useSegmentHighlight(adapter, deps);
      const style = h.geoJsonStyle({
        properties: { id: "track-1", color: "#ff0000" },
      });
      expect(style.color).toBe("#ff0000");
      expect(style.weight).toBe(7);
      expect(style.opacity).toBe(1);
    });
  });

  // -- clearSegmentHighlight ------------------------------------------------
  describe("clearSegmentHighlight", () => {
    it("resets all refs to null", () => {
      const map = createMockMap();
      const h = useSegmentHighlight(adapter, deps);
      h.hoveredSegmentPolyline.value = { fake: true };
      h.markerGapLine.value = { fake: true };
      h.highlightedLayer.value = { fake: true };
      h.highlightedLayerOrigStyle.value = { fake: true };

      h.clearSegmentHighlight(map);

      expect(h.hoveredSegmentPolyline.value).toBeNull();
      expect(h.markerGapLine.value).toBeNull();
      expect(h.highlightedLayer.value).toBeNull();
      expect(h.highlightedLayerOrigStyle.value).toBeNull();
    });

    it("restores original style on highlighted layer", () => {
      const origStyle = { color: "#aaa", weight: 4, opacity: 0.8 };
      const foundLayer = { setStyle: vi.fn() };
      const map = createMockMap();
      const h = useSegmentHighlight(adapter, deps);
      h.highlightedLayer.value = foundLayer;
      h.highlightedLayerOrigStyle.value = origStyle;

      h.clearSegmentHighlight(map);

      expect(foundLayer.setStyle).toHaveBeenCalledWith(origStyle);
      expect(h.highlightedLayer.value).toBeNull();
    });
  });

  // -- removeMarkerPolyline -------------------------------------------------
  describe("removeMarkerPolyline", () => {
    it("removes polyline from map and restores marker opacity", () => {
      const map = createMockMap();
      const marker = { setOpacity: vi.fn() };
      const h = useSegmentHighlight(adapter, deps);
      h.hoveredMarkerPolyline.value = { fake: true };
      h.hoveredMarker.value = marker;

      h.removeMarkerPolyline(map);

      expect(map.removeLayer).toHaveBeenCalled();
      expect(marker.setOpacity).toHaveBeenCalledWith(1);
      expect(h.hoveredMarkerPolyline.value).toBeNull();
      expect(h.hoveredMarker.value).toBeNull();
    });
  });

  // -- highlightSegmentForMarker (no-map fallback) -------------------------
  describe("highlightSegmentForMarker (no-map path)", () => {
    it("creates polyline objects even when getMapObject returns null", () => {
      deps.getSelectedTrackDetail.value = { id: "t1" };
      deps.getPolylines.value = [
        {
          properties: { id: "t1", color: "#ff0000" },
          latlngs: [
            [50, 14],
            [50.1, 14.1],
            [50.2, 14.2],
          ],
        },
      ];

      const h = useSegmentHighlight(adapter, deps);
      h.highlightSegmentForMarker({
        latlng: [50.05, 14.05],
        segmentIndex: 0,
      });

      // Should have created a segment polyline (overlay path) and a gap line
      expect(adapter.createPolyline).toHaveBeenCalledTimes(2);
      expect(h.hoveredSegmentPolyline.value).toBeTruthy();
      expect(h.markerGapLine.value).toBeTruthy();
    });

    it("does nothing when markerData is null", () => {
      const h = useSegmentHighlight(adapter, deps);
      h.highlightSegmentForMarker(null);
      expect(adapter.createPolyline).not.toHaveBeenCalled();
    });

    it("does nothing when no latlng is present", () => {
      const h = useSegmentHighlight(adapter, deps);
      h.highlightSegmentForMarker({ segmentIndex: 0 });
      expect(adapter.createPolyline).not.toHaveBeenCalled();
    });

    it("does nothing when panning or zooming", () => {
      deps.isPanningOrZooming.value = true;
      const h = useSegmentHighlight(adapter, deps);
      h.highlightSegmentForMarker({ latlng: [50, 14], segmentIndex: 0 });
      expect(adapter.createPolyline).not.toHaveBeenCalled();
    });

    it("does nothing when selectedTrackDetail is missing", () => {
      const h = useSegmentHighlight(adapter, deps);
      h.highlightSegmentForMarker({ latlng: [50, 14], segmentIndex: 0 });
      expect(adapter.createPolyline).not.toHaveBeenCalled();
    });
  });

  // -- showMarkerPolyline ---------------------------------------------------
  describe("showMarkerPolyline", () => {
    it("creates and adds a polyline to the map", () => {
      const map = createMockMap();
      const h = useSegmentHighlight(adapter, deps);
      const marker = { setOpacity: vi.fn() };
      const track = { latlngs: [[50, 14]], color: "#ff0000" };

      h.showMarkerPolyline(track, map, marker);

      expect(marker.setOpacity).toHaveBeenCalledWith(0);
      expect(adapter.createPolyline).toHaveBeenCalled();
      expect(adapter.addLayer).toHaveBeenCalled();
      expect(h.hoveredMarkerPolyline.value).toBeTruthy();
      expect(h.hoveredMarker.value).toStrictEqual(marker);
    });

    it("does nothing when zoom is animating", () => {
      deps.isZoomAnimating.value = true;
      const h = useSegmentHighlight(adapter, deps);
      h.showMarkerPolyline({ latlngs: [[50, 14]] }, createMockMap(), {});
      expect(adapter.createPolyline).not.toHaveBeenCalled();
    });

    it("does nothing when track is null", () => {
      const h = useSegmentHighlight(adapter, deps);
      h.showMarkerPolyline(null, createMockMap(), {});
      expect(adapter.createPolyline).not.toHaveBeenCalled();
    });
  });
});
