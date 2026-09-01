/**
 * Tests for ClusterAdapter
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClusterAdapter } from '../ClusterAdapter.js';

describe('ClusterAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = createClusterAdapter({ animate: false });
  });

  afterEach(() => {
    adapter.cleanup();
  });

  // ---- initialize ----
  describe('initialize', () => {
    it('returns a cluster group object', () => {
      const group = adapter.initialize();
      expect(group).toBeDefined();
    });

    it('replaces previous group on second call', () => {
      const g1 = adapter.initialize();
      const g2 = adapter.initialize();
      expect(g2).toBeDefined();
      expect(g2).not.toBe(g1);
    });

    it('returns stub group when L.markerClusterGroup is unavailable', () => {
      // In test env, L.markerClusterGroup may not exist; adapter returns a stub
      const group = adapter.initialize();
      expect(group).toBeDefined();
      // Stub should have the expected interface
      expect(typeof group.addLayer).toBe('function');
      expect(typeof group.clearLayers).toBe('function');
      expect(typeof group.on).toBe('function');
      expect(typeof group.off).toBe('function');
      expect(typeof group.remove).toBe('function');
      expect(typeof group.getLayers).toBe('function');
      expect(typeof group.getBounds).toBe('function');
      expect(typeof group.getChildCount).toBe('function');
      expect(typeof group.getAllChildMarkers).toBe('function');
    });
  });

  // ---- getGroup ----
  describe('getGroup', () => {
    it('returns null before initialize', () => {
      expect(adapter.getGroup()).toBeNull();
    });

    it('returns the group after initialize', () => {
      adapter.initialize();
      expect(adapter.getGroup()).toBeDefined();
    });

    it('returns null after cleanup', () => {
      adapter.initialize();
      adapter.cleanup();
      expect(adapter.getGroup()).toBeNull();
    });
  });

  // ---- addMarker / addMarkers / removeMarker ----
  describe('marker CRUD', () => {
    it('addMarker does not throw on stub group', () => {
      adapter.initialize();
      expect(() => adapter.addMarker({ id: 1 })).not.toThrow();
    });

    it('addMarkers does not throw on stub group', () => {
      adapter.initialize();
      expect(() => adapter.addMarkers([{ id: 1 }, { id: 2 }])).not.toThrow();
    });

    it('removeMarker does not throw on stub group', () => {
      adapter.initialize();
      expect(() => adapter.removeMarker({ id: 1 })).not.toThrow();
    });

    it('addMarker does not throw when no group', () => {
      expect(() => adapter.addMarker({})).not.toThrow();
    });

    it('addMarkers does not throw when no group', () => {
      expect(() => adapter.addMarkers([{}])).not.toThrow();
    });
  });

  // ---- clearLayers ----
  describe('clearLayers', () => {
    it('does not throw when no group', () => {
      expect(() => adapter.clearLayers()).not.toThrow();
    });

    it('does not throw after initialize', () => {
      adapter.initialize();
      expect(() => adapter.clearLayers()).not.toThrow();
    });
  });

  // ---- getLayers / getBounds ----
  describe('getLayers / getBounds', () => {
    it('returns empty array when no group', () => {
      expect(adapter.getLayers()).toEqual([]);
    });

    it('returns empty array from stub group', () => {
      adapter.initialize();
      expect(adapter.getLayers()).toEqual([]);
    });

    it('getBounds returns null from stub group', () => {
      adapter.initialize();
      expect(adapter.getBounds()).toBeNull();
    });

    it('getBounds returns null when no group', () => {
      expect(adapter.getBounds()).toBeNull();
    });
  });

  // ---- addTo ----
  describe('addTo', () => {
    it('does not throw when no group', () => {
      expect(() => adapter.addTo({})).not.toThrow();
    });

    it('does not throw with mock map', () => {
      adapter.initialize();
      const map = { addLayer: vi.fn() };
      adapter.addTo(map);
      // For real L.markerClusterGroup, map.addLayer would be called
      // For stub, nothing happens
    });
  });

  // ---- remove ----
  describe('remove', () => {
    it('does not throw when no group', () => {
      expect(() => adapter.remove()).not.toThrow();
    });

    it('does not throw after initialize', () => {
      adapter.initialize();
      expect(() => adapter.remove()).not.toThrow();
    });
  });

  // ---- on / off ----
  describe('on / off', () => {
    it('does not throw when no group', () => {
      expect(() => adapter.on('click', () => {})).not.toThrow();
      expect(() => adapter.off('click', () => {})).not.toThrow();
    });

    it('does not throw after initialize', () => {
      adapter.initialize();
      const cb = vi.fn();
      expect(() => adapter.on('click', cb)).not.toThrow();
      expect(() => adapter.off('click', cb)).not.toThrow();
    });
  });

  // ---- cleanup ----
  describe('cleanup', () => {
    it('does not throw when no group', () => {
      expect(() => adapter.cleanup()).not.toThrow();
    });

    it('nulls out the group', () => {
      adapter.initialize();
      expect(adapter.getGroup()).not.toBeNull();
      adapter.cleanup();
      expect(adapter.getGroup()).toBeNull();
    });

    it('can be called multiple times', () => {
      adapter.initialize();
      adapter.cleanup();
      expect(() => adapter.cleanup()).not.toThrow();
    });
  });
});
