// @ts-nocheck - Test mocks don't need full type fidelity
/**
 * Tests for useMapState composable
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick } from "vue";
import { useMapState } from "../useMapState";

interface MapStateProps {
  zoom: number;
  center: [number, number];
  bounds: null | unknown;
  selectedTrackDetail: null | unknown;
}

describe("useMapState", () => {
  let props: MapStateProps;

  beforeEach(() => {
    // Reset localStorage
    localStorage.clear();

    props = {
      zoom: 13,
      center: [48.8566, 2.3522],
      bounds: null,
      selectedTrackDetail: null,
    };
  });

  // ---------------------------------------------------------------------------
  // mapState ref
  // ---------------------------------------------------------------------------

  describe("mapState", () => {
    it("initialises lastKnownGood and preSelection from props", () => {
      const { mapState } = useMapState(props);

      expect(mapState.value.lastKnownGood).toEqual({
        zoom: 13,
        center: [48.8566, 2.3522],
      });
      expect(mapState.value.preSelection).toEqual({
        zoom: 13,
        center: [48.8566, 2.3522],
      });
      expect(mapState.value.userChangedZoomOrCenter).toBe(false);
      expect(mapState.value.pendingRestoreCenterZoom).toBe(false);
    });

    it("does not share the center array reference with props", () => {
      const { mapState } = useMapState(props);
      // Mutating the ref should not change props
      mapState.value.lastKnownGood.center[0] = 0;
      expect(props.center[0]).toBe(48.8566);
    });

    it("defaults center to null when props.center is falsy", () => {
      props.center = null;
      const { mapState } = useMapState(props);
      expect(mapState.value.lastKnownGood.center).toBeNull();
      expect(mapState.value.preSelection.center).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // effectiveZoom / effectiveCenter
  // ---------------------------------------------------------------------------

  describe("effectiveZoom", () => {
    it("returns props.zoom when there are no bounds", () => {
      const { effectiveZoom } = useMapState(props);
      expect(effectiveZoom.value).toBe(13);
    });

    it("returns props.zoom when bounds exist but no selectedTrackDetail", () => {
      props.bounds = [
        [48.8, 2.3],
        [48.9, 2.4],
      ];
      const { effectiveZoom } = useMapState(props);
      expect(effectiveZoom.value).toBe(13);
    });

    it("returns lastKnownGood.zoom when bounds + selectedTrackDetail present", () => {
      props.bounds = [
        [48.8, 2.3],
        [48.9, 2.4],
      ];
      props.selectedTrackDetail = { id: 1 };
      const { effectiveZoom, mapState } = useMapState(props);

      mapState.value.lastKnownGood.zoom = 11;
      expect(effectiveZoom.value).toBe(11);
    });

    it("falls back to props.zoom when lastKnownGood.zoom is falsy", () => {
      props.bounds = [
        [48.8, 2.3],
        [48.9, 2.4],
      ];
      props.selectedTrackDetail = { id: 1 };
      props.zoom = 15;
      const { effectiveZoom, mapState } = useMapState(props);

      mapState.value.lastKnownGood.zoom = 0;
      expect(effectiveZoom.value).toBe(15);
    });
  });

  describe("effectiveCenter", () => {
    it("returns props.center when there are no bounds", () => {
      const { effectiveCenter } = useMapState(props);
      expect(effectiveCenter.value).toEqual([48.8566, 2.3522]);
    });

    it("returns lastKnownGood.center when bounds + selectedTrackDetail present", () => {
      props.bounds = [
        [48.8, 2.3],
        [48.9, 2.4],
      ];
      props.selectedTrackDetail = { id: 1 };
      const { effectiveCenter, mapState } = useMapState(props);

      mapState.value.lastKnownGood.center = [51.5, -0.12];
      expect(effectiveCenter.value).toEqual([51.5, -0.12]);
    });

    it("falls back to props.center when lastKnownGood.center is falsy", () => {
      props.bounds = [
        [48.8, 2.3],
        [48.9, 2.4],
      ];
      props.selectedTrackDetail = { id: 1 };
      props.center = [40.0, -74.0];
      const { effectiveCenter, mapState } = useMapState(props);

      mapState.value.lastKnownGood.center = null;
      expect(effectiveCenter.value).toEqual([40.0, -74.0]);
    });
  });

  // ---------------------------------------------------------------------------
  // saveMapStateToStorage / loadMapStateFromStorage
  // ---------------------------------------------------------------------------

  describe("saveMapStateToStorage", () => {
    it("persists zoom and center to localStorage", () => {
      const { saveMapStateToStorage } = useMapState(props);

      saveMapStateToStorage(14, [51.5, -0.12]);

      expect(localStorage.getItem("trackly_preSelectionZoom")).toBe("14");
      expect(localStorage.getItem("trackly_preSelectionCenterLat")).toBe("51.5");
      expect(localStorage.getItem("trackly_preSelectionCenterLng")).toBe("-0.12");
    });

    it("does not write center keys when center is missing", () => {
      const { saveMapStateToStorage } = useMapState(props);

      saveMapStateToStorage(10, undefined);

      expect(localStorage.getItem("trackly_preSelectionZoom")).toBe("10");
      expect(localStorage.getItem("trackly_preSelectionCenterLat")).toBeNull();
    });

    it("does not throw when localStorage.setItem throws", () => {
      const { saveMapStateToStorage } = useMapState(props);
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      expect(() => saveMapStateToStorage(1, [1, 2])).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("loadMapStateFromStorage", () => {
    it("returns zoom and center when all three keys exist", () => {
      localStorage.setItem("trackly_preSelectionZoom", "12");
      localStorage.setItem("trackly_preSelectionCenterLat", "48.85");
      localStorage.setItem("trackly_preSelectionCenterLng", "2.35");

      const { loadMapStateFromStorage } = useMapState(props);
      const result = loadMapStateFromStorage();

      expect(result).toEqual({ zoom: 12, center: [48.85, 2.35] });
    });

    it("returns null when any key is missing", () => {
      localStorage.setItem("trackly_preSelectionZoom", "12");
      // missing center keys

      const { loadMapStateFromStorage } = useMapState(props);
      expect(loadMapStateFromStorage()).toBeNull();
    });

    it("returns null when localStorage.getItem throws", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("access denied");
      });

      const { loadMapStateFromStorage } = useMapState(props);
      expect(loadMapStateFromStorage()).toBeNull();
      spy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // updateInitialMapState
  // ---------------------------------------------------------------------------

  describe("updateInitialMapState", () => {
    it("updates lastKnownGood and preSelection from map event", () => {
      const { updateInitialMapState, mapState } = useMapState(props);

      const fakeMap = {
        getZoom: () => 15,
        getCenter: () => ({ lat: 51.5074, lng: -0.1278 }),
      };

      updateInitialMapState({ target: fakeMap });

      expect(mapState.value.lastKnownGood.zoom).toBe(15);
      expect(mapState.value.lastKnownGood.center).toEqual([51.5074, -0.1278]);
      expect(mapState.value.preSelection.zoom).toBe(15);
      expect(mapState.value.preSelection.center).toEqual([51.5074, -0.1278]);
      expect(mapState.value.userChangedZoomOrCenter).toBe(true);
    });

    it("does nothing when selectedTrackDetail is active", () => {
      props.selectedTrackDetail = { id: 1 };
      const { updateInitialMapState, mapState } = useMapState(props);

      const fakeMap = {
        getZoom: () => 15,
        getCenter: () => ({ lat: 51.5074, lng: -0.1278 }),
      };

      updateInitialMapState({ target: fakeMap });

      // Should still be the initial values from props
      expect(mapState.value.lastKnownGood.zoom).toBe(13);
      expect(mapState.value.lastKnownGood.center).toEqual([48.8566, 2.3522]);
      expect(mapState.value.userChangedZoomOrCenter).toBe(false);
    });

    it("copies preSelection center by value, not reference", () => {
      const { updateInitialMapState, mapState } = useMapState(props);

      const fakeMap = {
        getZoom: () => 10,
        getCenter: () => ({ lat: 40.0, lng: -74.0 }),
      };

      updateInitialMapState({ target: fakeMap });

      // Mutate one, verify the other is unchanged
      mapState.value.lastKnownGood.center[0] = 999;
      expect(mapState.value.preSelection.center[0]).toBe(40.0);
    });
  });
});
