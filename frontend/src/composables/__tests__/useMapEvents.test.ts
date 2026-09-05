// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("leaflet", () => ({
  latLngBounds: vi.fn(() => ({})),
}));

vi.mock("../../utils/mapConstants.js", () => ({
  getDetailPanelFitBoundsOptions: vi.fn(() => ({ padding: [40, 40] })),
}));

import { useMapEvents } from "../useMapEvents.js";
import type { UseMapEventsOptions } from "../useMapEvents.js";

// ---------------------------------------------------------------------------
// Shared mock map (returned by getMapObject)
// ---------------------------------------------------------------------------

let mockMap;

function resetMockMap() {
  mockMap = {
    getZoom: vi.fn(() => 12),
    getCenter: vi.fn(() => ({ lat: 50, lng: 14 })),
    getBounds: vi.fn(() => ({ isValid: vi.fn(() => true) })),
    flyToBounds: vi.fn(),
    flyTo: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createDefaults(overrides = {}) {
  const emit = vi.fn();

  const props = {
    selectedTrackDetail: null,
    center: [50, 14],
    zoom: 12,
    bounds: null,
    polylines: [
      {
        properties: { id: "t1", color: "#ff0000" },
        latlngs: [
          [50, 14],
          [50.1, 14.1],
        ],
      },
    ],
    markerLatLng: null,
    activeTrackId: null,
    ...overrides.props,
  };

  const mapState = {
    value: {
      preSelection: { zoom: undefined, center: undefined },
      lastKnownGood: { zoom: undefined, center: undefined },
      userChangedZoomOrCenter: false,
    },
  };

  const isPanningOrZooming = { value: false };
  const isZoomAnimating = { value: false };
  const trackZoomAnimating = { value: false };
  const isTransitioning = { value: false };
  const stableBounds = { value: null };
  const mapIsReady = { value: true };
  const isUnmounting = { value: false };
  const displayMode = { value: "cluster" };
  const hoveredSegmentPolyline = { value: null };
  const filteredTracks = { value: [props.polylines[0]] };
  const mapBounds = { value: null };

  resetMockMap();
  const getMapObject = vi.fn(() => mockMap);

  const highlightSegmentForMarker = vi.fn();
  const removeMarkerPolyline = vi.fn();
  const showMarkerPolyline = vi.fn();
  const clearSegmentHighlight = vi.fn();
  const performAutoPan = vi.fn();
  const setTrackZoomAnimating = vi.fn();
  const updateStableBounds = vi.fn();
  const debouncedUpdateClustering = vi.fn();

  const clustering = {
    clusterGroup: {
      value: {
        getLayers: vi.fn(() => []),
        clearLayers: vi.fn(),
      },
    },
    updateZoomLevel: vi.fn(),
    addTracksToCluster: vi.fn(),
  };

  const leafletAdapter = {};
  const clusterAdapter = {};
  const layerKey = { value: 0 };

  return {
    emit,
    props,
    leafletAdapter,
    clusterAdapter,
    mapState,
    mapIsReady,
    isPanningOrZooming,
    isZoomAnimating,
    trackZoomAnimating,
    isTransitioning,
    stableBounds,
    highlightSegmentForMarker,
    removeMarkerPolyline,
    showMarkerPolyline,
    clearSegmentHighlight,
    performAutoPan,
    setTrackZoomAnimating,
    updateStableBounds,
    debouncedUpdateClustering,
    clustering,
    layerKey,
    getMapObject,
    displayMode,
    hoveredSegmentPolyline,
    isUnmounting,
    filteredTracks,
    mapBounds,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMapEvents", () => {
  let deps: UseMapEventsOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDefaults() as UseMapEventsOptions;
  });

  it("returns all expected handler functions", () => {
    const handlers = useMapEvents(deps);

    const expected = [
      "onTrackClick",
      "onTrackMouseOver",
      "onTrackMouseMove",
      "onTrackMouseOut",
      "onEachFeature",
      "onGeoJsonClick",
      "onGeoJsonMouseOver",
      "onGeoJsonMouseOut",
      "onMoveStart",
      "onMoveEnd",
      "onZoomStart",
      "onZoomEnd",
      "handleTrackSelected",
      "handleTrackDeselected",
      "onLocationFound",
      "onClusterClick",
      "onClusterMarkerClick",
      "updateClustering",
    ];

    for (const fn of expected) {
      expect(typeof handlers[fn]).toBe("function");
    }
  });

  // -----------------------------------------------------------------------
  // Track event handlers
  // -----------------------------------------------------------------------
  describe("onTrackClick", () => {
    it("emits trackClick with poly and event", () => {
      const { onTrackClick } = useMapEvents(deps);
      const poly = { id: "t1" };
      const event = { type: "click" };
      onTrackClick(poly, event);
      expect(deps.emit).toHaveBeenCalledWith("trackClick", poly, event);
    });
  });

  describe("onTrackMouseOver", () => {
    it("emits trackMouseOver when nothing is blocking", () => {
      const { onTrackMouseOver } = useMapEvents(deps);
      const poly = { id: "t1" };
      const event = { target: { bringToFront: vi.fn() } };
      onTrackMouseOver(poly, event);
      expect(deps.emit).toHaveBeenCalledWith("trackMouseOver", poly, event);
      expect(event.target.bringToFront).toHaveBeenCalled();
    });

    it("skips when selectedTrackDetail is set", () => {
      deps.props.selectedTrackDetail = { id: "t1" };
      const { onTrackMouseOver } = useMapEvents(deps);
      onTrackMouseOver({ id: "t1" }, { target: {} });
      expect(deps.emit).not.toHaveBeenCalled();
    });

    it("skips when isZoomAnimating", () => {
      deps.isZoomAnimating.value = true;
      const { onTrackMouseOver } = useMapEvents(deps);
      onTrackMouseOver({ id: "t1" }, { target: {} });
      expect(deps.emit).not.toHaveBeenCalled();
    });

    it("skips when isPanningOrZooming", () => {
      deps.isPanningOrZooming.value = true;
      const { onTrackMouseOver } = useMapEvents(deps);
      onTrackMouseOver({ id: "t1" }, { target: {} });
      expect(deps.emit).not.toHaveBeenCalled();
    });
  });

  describe("onTrackMouseMove", () => {
    it("emits trackMouseMove when not panning or zooming", () => {
      const { onTrackMouseMove } = useMapEvents(deps);
      const event = { type: "mousemove" };
      onTrackMouseMove(event);
      expect(deps.emit).toHaveBeenCalledWith("trackMouseMove", event);
    });

    it("skips when isPanningOrZooming", () => {
      deps.isPanningOrZooming.value = true;
      const { onTrackMouseMove } = useMapEvents(deps);
      onTrackMouseMove({ type: "mousemove" });
      expect(deps.emit).not.toHaveBeenCalled();
    });
  });

  describe("onTrackMouseOut", () => {
    it("emits trackMouseOut when no detail is selected", () => {
      const { onTrackMouseOut } = useMapEvents(deps);
      const event = { type: "mouseout" };
      onTrackMouseOut(event);
      expect(deps.emit).toHaveBeenCalledWith("trackMouseOut", event);
    });

    it("skips when selectedTrackDetail is set", () => {
      deps.props.selectedTrackDetail = { id: "t1" };
      const { onTrackMouseOut } = useMapEvents(deps);
      onTrackMouseOut({ type: "mouseout" });
      expect(deps.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GeoJSON event handlers
  // -----------------------------------------------------------------------
  describe("onGeoJsonClick", () => {
    it("emits trackClick for a recognized feature", () => {
      const { onGeoJsonClick } = useMapEvents(deps);
      const event = {
        target: {
          feature: { properties: { id: "t1" } },
        },
      };
      onGeoJsonClick(event);
      expect(deps.emit).toHaveBeenCalledWith(
        "trackClick",
        deps.props.polylines[0],
        event
      );
    });

    it("does nothing for unknown feature id", () => {
      const { onGeoJsonClick } = useMapEvents(deps);
      const event = {
        target: {
          feature: { properties: { id: "unknown" } },
        },
      };
      onGeoJsonClick(event);
      expect(deps.emit).not.toHaveBeenCalled();
    });
  });

  describe("onGeoJsonMouseOut", () => {
    it("emits trackMouseOut when no detail is selected", () => {
      const { onGeoJsonMouseOut } = useMapEvents(deps);
      onGeoJsonMouseOut({ type: "mouseout" });
      expect(deps.emit).toHaveBeenCalledWith("trackMouseOut", {
        type: "mouseout",
      });
    });
  });

  describe("onEachFeature", () => {
    it("binds event handlers to the layer", () => {
      const { onEachFeature } = useMapEvents(deps);
      const layerOn = vi.fn();
      onEachFeature({ properties: { id: "t1" } }, { on: layerOn });
      expect(layerOn).toHaveBeenCalledWith(
        expect.objectContaining({
          click: expect.any(Function),
          mouseover: expect.any(Function),
          mousemove: expect.any(Function),
          mouseout: expect.any(Function),
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Move / zoom handlers
  // -----------------------------------------------------------------------
  describe("onMoveStart", () => {
    it("sets isPanningOrZooming and cleans up", () => {
      const { onMoveStart } = useMapEvents(deps);
      const map = {};
      onMoveStart({ target: map });
      expect(deps.isPanningOrZooming.value).toBe(true);
      expect(deps.removeMarkerPolyline).toHaveBeenCalledWith(map);
      expect(deps.clearSegmentHighlight).toHaveBeenCalledWith(map);
    });
  });

  describe("onMoveEnd", () => {
    it("clears isPanningOrZooming and emits bounds", () => {
      const { onMoveEnd } = useMapEvents(deps);
      const map = {
        getCenter: vi.fn(() => ({ lat: 50, lng: 14 })),
        getBounds: vi.fn(() => ({ isValid: vi.fn(() => true) })),
        getZoom: vi.fn(() => 12),
      };
      onMoveEnd({ target: map });
      expect(deps.isPanningOrZooming.value).toBe(false);
      expect(deps.emit).toHaveBeenCalledWith(
        "update:bounds",
        expect.anything()
      );
    });
  });

  describe("onZoomStart", () => {
    it("sets isZoomAnimating and cleans up", () => {
      const { onZoomStart } = useMapEvents(deps);
      const map = {};
      onZoomStart({ target: map });
      expect(deps.isZoomAnimating.value).toBe(true);
      expect(deps.removeMarkerPolyline).toHaveBeenCalledWith(map);
    });
  });

  // -----------------------------------------------------------------------
  // Cluster handlers
  // -----------------------------------------------------------------------
  describe("onClusterClick", () => {
    it("zooms in to cluster bounds", () => {
      const { onClusterClick } = useMapEvents(deps);
      const bounds = {};
      const cluster = {
        getAllChildMarkers: vi.fn(),
        getBounds: vi.fn(() => bounds),
      };

      onClusterClick({ layer: cluster });
      expect(mockMap.fitBounds).toHaveBeenCalledWith(bounds, {
        padding: [20, 20],
      });
    });
  });

  describe("onClusterMarkerClick", () => {
    it("emits trackClick for individual marker", () => {
      const { onClusterMarkerClick } = useMapEvents(deps);
      const trackData = { id: "t1" };
      const marker = { trackData, getAllChildMarkers: undefined };
      const event = { layer: marker };
      onClusterMarkerClick(event);
      expect(deps.emit).toHaveBeenCalledWith("trackClick", trackData, event);
    });
  });

  // -----------------------------------------------------------------------
  // Geolocation
  // -----------------------------------------------------------------------
  describe("onLocationFound", () => {
    it("warns on location error", () => {
      const consoleSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const { onLocationFound } = useMapEvents(deps);
      onLocationFound({ error: "denied" });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("flies to user location on success", () => {
      const { onLocationFound } = useMapEvents(deps);

      onLocationFound({ latitude: 50, longitude: 14 });
      expect(mockMap.flyTo).toHaveBeenCalledWith([50, 14], 15, {
        duration: 1.5,
        easeLinearity: 0.25,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Track selection / deselection
  // -----------------------------------------------------------------------
  describe("handleTrackSelected", () => {
    it("skips flyToBounds when bounds prop is provided", async () => {
      deps.props.bounds = [
        [50, 14],
        [50.1, 14.1],
      ];
      const { handleTrackSelected } = useMapEvents(deps);
      await handleTrackSelected({ id: "t1" });
      // getMapObject was called to save state, but flyToBounds should not
      expect(mockMap.flyToBounds).not.toHaveBeenCalled();
    });

    it("flies to selected track polyline bounds", async () => {
      const { handleTrackSelected } = useMapEvents(deps);
      await handleTrackSelected({ id: "t1" });
      expect(mockMap.flyToBounds).toHaveBeenCalled();
      expect(deps.removeMarkerPolyline).toHaveBeenCalled();
    });
  });

  describe("handleTrackDeselected", () => {
    it("resets zoom animating state", async () => {
      const { handleTrackDeselected } = useMapEvents(deps);
      await handleTrackDeselected();
      expect(deps.setTrackZoomAnimating).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // updateClustering
  // -----------------------------------------------------------------------
  describe("updateClustering", () => {
    it("does nothing when displayMode is detail", () => {
      deps.displayMode.value = "detail";
      const { updateClustering } = useMapEvents(deps);
      updateClustering();
      expect(deps.clustering.addTracksToCluster).not.toHaveBeenCalled();
    });

    it("does nothing when clusterGroup is null", () => {
      deps.clustering.clusterGroup.value = null;
      const { updateClustering } = useMapEvents(deps);
      updateClustering();
      expect(deps.clustering.addTracksToCluster).not.toHaveBeenCalled();
    });

    it("handles cluster click with getAllChildMarkers", () => {
      const mockBounds = { isValid: () => true };
      const mockCluster = {
        getAllChildMarkers: vi.fn(() => []),
        getBounds: vi.fn(() => mockBounds),
      };
      const mockMap = {
        fitBounds: vi.fn(),
      };
      deps.getMapObject = vi.fn(() => mockMap);
      deps.removeMarkerPolyline = vi.fn();

      const { onClusterClick } = useMapEvents(deps);
      onClusterClick({ layer: mockCluster, target: mockCluster } as any);

      expect(mockMap.fitBounds).toHaveBeenCalled();
    });

    it("handles cluster marker click with trackData", () => {
      const mockMarker = {
        trackData: { id: 'track-123' },
      };
      const mockEvent = {
        layer: mockMarker,
        target: mockMarker,
      };

      const { onClusterMarkerClick } = useMapEvents(deps);
      onClusterMarkerClick(mockEvent);

      expect(deps.emit).toHaveBeenCalledWith('trackClick', mockMarker.trackData, mockEvent);
    });

    it("handles location found with error", () => {
      const { onLocationFound } = useMapEvents(deps);
      deps.getMapObject = vi.fn(() => null);

      onLocationFound({ error: 'Location access denied' });

      // Should not throw
    });

    it("handles location found when map not available", () => {
      const { onLocationFound } = useMapEvents(deps);
      deps.getMapObject = vi.fn(() => null);

      onLocationFound({ latitude: 50.0, longitude: 30.0 });

      // Should not throw
    });
  });
});
