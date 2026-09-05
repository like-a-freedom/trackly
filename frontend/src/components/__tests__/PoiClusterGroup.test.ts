// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, provide, shallowRef } from 'vue';

// Mock the leaflet.markercluster plugin (not available in jsdom).
const mockGroup = { addLayer: vi.fn(), clearLayers: vi.fn(), addLayers: vi.fn() };
vi.mock('leaflet.markercluster', () => ({
  default: vi.fn(),
}));
vi.mock('leaflet', () => {
  const L = {
    markerClusterGroup: vi.fn(() => mockGroup),
    marker: vi.fn(() => ({ addTo: vi.fn(), remove: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    icon: vi.fn(() => ({})),
    point: vi.fn((x, y) => ({ x, y })),
    latLngBounds: vi.fn(() => ({})),
  };
  return { default: L };
});

import PoiClusterGroup from '../PoiClusterGroup.vue';

// Provide the resolved L.Map under the 'leafletMap' key (a shallowRef wrapping
// the real map, not the Vue Leaflet wrapper). The component should NOT fall
// back to setInterval polling when the map is present.
function mountWithMap(mapInstance) {
  const Parent = defineComponent({
    setup() {
      const map = shallowRef(mapInstance);
      provide('leafletMap', map);
      return () => h(PoiClusterGroup, { pois: [] });
    },
  });
  return mount(Parent);
}

describe('PoiClusterGroup inject race (stage 0.5b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call setInterval when a real map is provided', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const fakeMap = {
      on: vi.fn(), off: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(),
      clearLayers: vi.fn(), getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
      getZoom: vi.fn(() => 10), eachLayer: vi.fn(),
    };
    mountWithMap(fakeMap);
    // With a real map provided, the polling fallback must not fire.
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});
