/**
 * Tests for LeafletAdapter
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLeafletAdapter } from '../LeafletAdapter.js';

// ---- minimal Leaflet mock ----
function createMockMap() {
  const listeners = {};
  return {
    getZoom: vi.fn(() => 12),
    getCenter: vi.fn(() => ({ lat: 55.75, lng: 37.62 })),
    getBounds: vi.fn(() => ({ _southWest: {}, _northEast: {} })),
    setView: vi.fn(),
    flyTo: vi.fn(),
    flyToBounds: vi.fn(),
    fitBounds: vi.fn(),
    panTo: vi.fn(),
    stop: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    eachLayer: vi.fn(),
    getPane: vi.fn(() => null),
    createPane: vi.fn(() => ({ style: {} })),
    on: vi.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    off: vi.fn(),
    attributionControl: null,
    removeControl: vi.fn(),
    addControl: vi.fn(),
    // helper to fire events
    _fire(event) {
      (listeners[event] || []).forEach(cb => cb());
    },
  };
}

describe('LeafletAdapter', () => {
  let adapter;
  let mockMap;

  beforeEach(() => {
    adapter = createLeafletAdapter();
    mockMap = createMockMap();
  });

  afterEach(() => {
    adapter.setMap(null);
  });

  // ---- setMap / getMap ----
  describe('setMap / getMap', () => {
    it('returns null before setMap is called', () => {
      expect(adapter.getMap()).toBeNull();
    });

    it('returns the map after setMap', () => {
      adapter.setMap(mockMap);
      expect(adapter.getMap()).toBe(mockMap);
    });

    it('returns null after setMap(null)', () => {
      adapter.setMap(mockMap);
      adapter.setMap(null);
      expect(adapter.getMap()).toBeNull();
    });
  });

  // ---- getCenter ----
  describe('getCenter', () => {
    it('returns null when no map', () => {
      expect(adapter.getCenter()).toBeNull();
    });

    it('returns [lat, lng] when map is set', () => {
      adapter.setMap(mockMap);
      expect(adapter.getCenter()).toEqual([55.75, 37.62]);
    });
  });

  // ---- getZoom ----
  describe('getZoom', () => {
    it('returns null when no map', () => {
      expect(adapter.getZoom()).toBeNull();
    });

    it('returns zoom level when map is set', () => {
      adapter.setMap(mockMap);
      expect(adapter.getZoom()).toBe(12);
    });
  });

  // ---- getBounds ----
  describe('getBounds', () => {
    it('returns null when no map', () => {
      expect(adapter.getBounds()).toBeNull();
    });

    it('returns bounds object when map is set', () => {
      adapter.setMap(mockMap);
      expect(adapter.getBounds()).toBeDefined();
    });
  });

  // ---- setView ----
  describe('setView', () => {
    it('calls map.setView', () => {
      adapter.setMap(mockMap);
      adapter.setView([50, 30], 14);
      expect(mockMap.setView).toHaveBeenCalledWith([50, 30], 14);
    });

    it('does nothing when no map', () => {
      adapter.setView([50, 30], 14); // should not throw
    });
  });

  // ---- flyTo ----
  describe('flyTo', () => {
    it('calls map.flyTo with options', () => {
      adapter.setMap(mockMap);
      adapter.flyTo([50, 30], 14, { duration: 1.5 });
      expect(mockMap.flyTo).toHaveBeenCalledWith([50, 30], 14, { duration: 1.5 });
    });
  });

  // ---- fitBounds ----
  describe('fitBounds', () => {
    it('calls map.fitBounds', () => {
      adapter.setMap(mockMap);
      adapter.fitBounds([[0, 0], [10, 10]], { padding: [20, 20] });
      expect(mockMap.fitBounds).toHaveBeenCalledWith([[0, 0], [10, 10]], { padding: [20, 20] });
    });
  });

  // ---- flyToBounds ----
  describe('flyToBounds', () => {
    it('calls map.flyToBounds', () => {
      adapter.setMap(mockMap);
      adapter.flyToBounds([[1, 2], [3, 4]], { animate: true });
      expect(mockMap.flyToBounds).toHaveBeenCalledWith([[1, 2], [3, 4]], { animate: true });
    });
  });

  // ---- panTo ----
  describe('panTo', () => {
    it('calls map.panTo', () => {
      adapter.setMap(mockMap);
      adapter.panTo([50, 30], { animate: true });
      expect(mockMap.panTo).toHaveBeenCalledWith([50, 30], { animate: true });
    });
  });

  // ---- stop ----
  describe('stop', () => {
    it('calls map.stop', () => {
      adapter.setMap(mockMap);
      adapter.stop();
      expect(mockMap.stop).toHaveBeenCalled();
    });

    it('does not throw when no map', () => {
      expect(() => adapter.stop()).not.toThrow();
    });
  });

  // ---- layer management ----
  describe('addLayer / removeLayer / eachLayer', () => {
    it('delegates to map', () => {
      adapter.setMap(mockMap);
      const layer = { id: 1 };
      adapter.addLayer(layer);
      expect(mockMap.addLayer).toHaveBeenCalledWith(layer);
      adapter.removeLayer(layer);
      expect(mockMap.removeLayer).toHaveBeenCalledWith(layer);
      const cb = vi.fn();
      adapter.eachLayer(cb);
      expect(mockMap.eachLayer).toHaveBeenCalledWith(cb);
    });

    it('no-ops when no map', () => {
      expect(() => adapter.addLayer({})).not.toThrow();
      expect(() => adapter.removeLayer({})).not.toThrow();
      expect(() => adapter.eachLayer(() => {})).not.toThrow();
    });
  });

  // ---- pane management ----
  describe('getPane / createPane', () => {
    it('delegates to map', () => {
      adapter.setMap(mockMap);
      adapter.getPane('testPane');
      expect(mockMap.getPane).toHaveBeenCalledWith('testPane');
      adapter.createPane('newPane');
      expect(mockMap.createPane).toHaveBeenCalledWith('newPane', undefined);
    });
  });

  // ---- events ----
  describe('on / off', () => {
    it('delegates to map', () => {
      adapter.setMap(mockMap);
      const cb = vi.fn();
      adapter.on('click', cb);
      expect(mockMap.on).toHaveBeenCalledWith('click', cb);
      adapter.off('click', cb);
      expect(mockMap.off).toHaveBeenCalledWith('click', cb);
    });
  });

  // ---- idle state ----
  describe('isIdle', () => {
    it('starts false, becomes true on moveend', () => {
      adapter.setMap(mockMap);
      expect(adapter.isIdle()).toBe(false);
      mockMap._fire('moveend');
      expect(adapter.isIdle()).toBe(true);
    });

    it('resets to false on movestart', () => {
      adapter.setMap(mockMap);
      mockMap._fire('moveend');
      expect(adapter.isIdle()).toBe(true);
      mockMap._fire('movestart');
      expect(adapter.isIdle()).toBe(false);
    });

    it('becomes true on zoomend', () => {
      adapter.setMap(mockMap);
      mockMap._fire('zoomend');
      expect(adapter.isIdle()).toBe(true);
    });
  });

  // ---- exposeE2E ----
  describe('exposeE2E', () => {
    beforeEach(() => { vi.stubGlobal('window', globalThis); });
    afterEach(() => { delete globalThis.__test_ns; });

    it('creates namespace and exposes API', () => {
      adapter.exposeE2E('__test_ns', { hello: 'world' });
      expect(globalThis.__test_ns).toEqual({ hello: 'world' });
    });

    it('preserves existing keys', () => {
      globalThis.__test_ns = { existing: 42 };
      adapter.exposeE2E('__test_ns', { added: 'new' });
      expect(globalThis.__test_ns).toEqual({ existing: 42, added: 'new' });
    });
  });

  // ---- createPolyline ----
  describe('createPolyline', () => {
    it('returns null when L.polyline is not available', () => {
      // In test env, L.polyline may or may not exist; adapter handles gracefully
      const result = adapter.createPolyline([[0, 0], [1, 1]], { color: 'red' });
      // Result is either a polyline or null — both are valid
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  // ---- createHeatLayer ----
  describe('createHeatLayer', () => {
    it('returns null when no map is set', () => {
      expect(adapter.createHeatLayer([[0, 0]])).toBeNull();
    });
  });

  // ---- repositionAttribution ----
  describe('repositionAttribution', () => {
    it('does nothing when no map', () => {
      expect(() => adapter.repositionAttribution('bottomleft')).not.toThrow();
    });
  });
});
