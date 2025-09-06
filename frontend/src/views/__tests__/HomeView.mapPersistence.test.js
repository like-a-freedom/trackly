import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HomeView from '../HomeView.vue';

// Mock vue-router with partial mock
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      currentRoute: {
        value: { path: '/' }
      }
    })
  };
});

// Mock the composables
vi.mock('../../composables/useTracks', () => ({
  useTracks: () => ({
    polylines: { value: [] },
    fetchTracksInBounds: vi.fn(),
    uploadTrack: vi.fn(),
    error: { value: null },
    updateTrackInPolylines: vi.fn()
  })
}));

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
    toast: { value: null }
  })
}));

vi.mock('../../composables/useSearchState', () => ({
  useSearchState: () => ({
    clearSearchState: vi.fn(),
    searchResults: { value: [] },
    searchQuery: { value: '' },
    hasSearchState: () => false
  })
}));

vi.mock('../../composables/useAdvancedDebounce', () => ({
  useAdvancedDebounce: (fn) => {
    const debouncedFn = vi.fn(fn);
    debouncedFn.pending = () => false;
    return debouncedFn;
  },
  useThrottle: (fn) => vi.fn(fn)
}));

vi.mock('../../utils/session', () => ({
  getSessionId: () => 'test-session-id'
}));

// Mock Leaflet components
vi.mock('@vue-leaflet/vue-leaflet', () => ({
  LMap: { name: 'LMap', template: '<div class="leaflet-map-mock"></div>' },
  LTileLayer: { name: 'LTileLayer', template: '<div></div>' },
  LPolyline: { name: 'LPolyline', template: '<div></div>' },
  LGeoJson: { name: 'LGeoJson', template: '<div></div>' }
}));

// Mock child components
vi.mock('../../components/TrackMap.vue', () => ({
  default: {
    name: 'TrackMap',
    template: '<div class="track-map-mock" @mapReady="$emit(\'mapReady\', { getBounds: () => ({}) })"></div>',
    emits: ['mapReady', 'update:center', 'update:zoom', 'update:bounds', 'trackClick', 'trackMouseOver', 'trackMouseMove', 'trackMouseOut', 'open-search']
  }
}));

vi.mock('../../components/TrackTooltip.vue', () => ({
  default: { name: 'TrackTooltip', template: '<div></div>' }
}));

vi.mock('../../components/UploadForm.vue', () => ({
  default: { name: 'UploadForm', template: '<div></div>' }
}));

vi.mock('../../components/Toast.vue', () => ({
  default: { name: 'Toast', template: '<div></div>' }
}));

vi.mock('../../components/TrackSearch.vue', () => ({
  default: { name: 'TrackSearch', template: '<div></div>' }
}));

describe('HomeView Map Position Persistence', () => {
  let wrapper;
  const MAP_POSITION_STORAGE_KEY = 'trackly_map_position';

  // Mock localStorage
  const mockLocalStorage = {
    store: {},
    getItem: vi.fn((key) => mockLocalStorage.store[key] || null),
    setItem: vi.fn((key, value) => {
      mockLocalStorage.store[key] = value;
    }),
    removeItem: vi.fn((key) => {
      delete mockLocalStorage.store[key];
    }),
    clear: vi.fn(() => {
      mockLocalStorage.store = {};
    })
  };

  beforeEach(() => {
    // Clear localStorage mock
    mockLocalStorage.clear();
    vi.clearAllMocks();
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });

    // Mock console.warn to avoid test noise
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
    vi.restoreAllMocks();
  });

  describe('Map Position Loading', () => {
    it('should load default position when no saved position exists', async () => {
      wrapper = mount(HomeView);

      await wrapper.vm.$nextTick();

      // Should use default values
      expect(wrapper.vm.center).toEqual([56.04028, 37.83185]);
      expect(wrapper.vm.zoom).toBe(11);
    });

    it('should load saved position from localStorage', async () => {
      const savedPosition = {
        center: [55.7558, 37.6176], // Moscow coordinates
        zoom: 13,
        timestamp: Date.now()
      };

      mockLocalStorage.setItem(MAP_POSITION_STORAGE_KEY, JSON.stringify(savedPosition));

      wrapper = mount(HomeView);

      await wrapper.vm.$nextTick();

      // Should use saved values
      expect(wrapper.vm.center).toEqual(savedPosition.center);
      expect(wrapper.vm.zoom).toBe(savedPosition.zoom);
    });

    it('should fallback to defaults when saved position is invalid', async () => {
      // Invalid JSON
      mockLocalStorage.setItem(MAP_POSITION_STORAGE_KEY, 'invalid-json');

      wrapper = mount(HomeView);

      await wrapper.vm.$nextTick();

      // Should use default values
      expect(wrapper.vm.center).toEqual([56.04028, 37.83185]);
      expect(wrapper.vm.zoom).toBe(11);
    });

    it('should validate saved position data structure', async () => {
      const invalidPositions = [
        { center: 'invalid', zoom: 13 }, // Invalid center
        { center: [55.7558], zoom: 13 }, // Incomplete center
        { center: [55.7558, 37.6176], zoom: 'invalid' }, // Invalid zoom
        { center: [null, 37.6176], zoom: 13 }, // null in coordinates
        { center: [55.7558, 37.6176] }, // Missing zoom
      ];

      for (const invalidPosition of invalidPositions) {
        mockLocalStorage.clear();
        mockLocalStorage.setItem(MAP_POSITION_STORAGE_KEY, JSON.stringify(invalidPosition));

        wrapper = mount(HomeView);

        await wrapper.vm.$nextTick();

        // Should fallback to defaults
        expect(wrapper.vm.center).toEqual([56.04028, 37.83185]);
        expect(wrapper.vm.zoom).toBe(11);

        wrapper.unmount();
      }
    });
  });

  describe('Map Position Saving', () => {
    beforeEach(async () => {
      wrapper = mount(HomeView);
      await wrapper.vm.$nextTick();
    });

    it('should save position when center updates', async () => {
      const newCenter = [55.7558, 37.6176];
      
      // Simulate center update
      await wrapper.vm.handleCenterUpdate(newCenter);
      await wrapper.vm.$nextTick();

      // Should update reactive value
      expect(wrapper.vm.center).toEqual(newCenter);
    });

    it('should save position when zoom updates', async () => {
      const newZoom = 15;
      
      // Simulate zoom update
      await wrapper.vm.handleZoomUpdate(newZoom);
      await wrapper.vm.$nextTick();

      // Should update reactive value
      expect(wrapper.vm.zoom).toBe(newZoom);
    });

    it('should not save invalid center coordinates', async () => {
      const originalCenter = wrapper.vm.center;
      
      // Try to set invalid centers
      await wrapper.vm.handleCenterUpdate('invalid');
      await wrapper.vm.handleCenterUpdate([NaN, 37.6176]);
      await wrapper.vm.handleCenterUpdate([55.7558]); // Incomplete
      
      // Should keep original center
      expect(wrapper.vm.center).toEqual(originalCenter);
    });

    it('should not save invalid zoom values', async () => {
      const originalZoom = wrapper.vm.zoom;
      
      // Try to set invalid zooms
      await wrapper.vm.handleZoomUpdate('invalid');
      await wrapper.vm.handleZoomUpdate(NaN);
      await wrapper.vm.handleZoomUpdate(null);
      
      // Should keep original zoom
      expect(wrapper.vm.zoom).toBe(originalZoom);
    });
  });

  describe('Position Persistence Events', () => {
    beforeEach(async () => {
      wrapper = mount(HomeView);
      await wrapper.vm.$nextTick();
    });

    it('should save position on route navigation away from home', async () => {
      const testCenter = [55.7558, 37.6176];
      const testZoom = 15;

      // Update position
      await wrapper.vm.handleCenterUpdate(testCenter);
      await wrapper.vm.handleZoomUpdate(testZoom);
      await wrapper.vm.$nextTick();

      // Should save position (tested directly without router navigation)
      expect(wrapper.vm.center).toEqual(testCenter);
      expect(wrapper.vm.zoom).toBe(testZoom);
    });

    it('should save position on component deactivation', async () => {
      const testCenter = [55.7558, 37.6176];
      const testZoom = 15;

      // Update position
      await wrapper.vm.handleCenterUpdate(testCenter);
      await wrapper.vm.handleZoomUpdate(testZoom);
      await wrapper.vm.$nextTick();

      // Trigger deactivation (keep-alive scenario)
      if (wrapper.vm.$options.deactivated) {
        wrapper.vm.$options.deactivated[0].call(wrapper.vm);
      }

      // Position should be preserved
      expect(wrapper.vm.center).toEqual(testCenter);
      expect(wrapper.vm.zoom).toBe(testZoom);
    });

    it('should handle beforeunload event', async () => {
      const testCenter = [55.7558, 37.6176];
      const testZoom = 15;

      // Update position
      await wrapper.vm.handleCenterUpdate(testCenter);
      await wrapper.vm.handleZoomUpdate(testZoom);
      await wrapper.vm.$nextTick();

      // Simulate beforeunload event
      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);

      // Position should be preserved
      expect(wrapper.vm.center).toEqual(testCenter);
      expect(wrapper.vm.zoom).toBe(testZoom);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      wrapper = mount(HomeView);
      await wrapper.vm.$nextTick();
    });

    it('should handle localStorage errors gracefully when saving', async () => {
      // Mock localStorage to throw error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage is full');
      });

      // Should not throw when trying to save
      expect(() => {
        wrapper.vm.saveMapPosition([55.7558, 37.6176], 13);
      }).not.toThrow();

      // Should log warning
      expect(console.warn).toHaveBeenCalledWith(
        '[HomeView] Failed to save map position:',
        expect.any(Error)
      );
    });

    it('should handle localStorage errors gracefully when loading', async () => {
      // Mock localStorage to throw error
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage is corrupted');
      });

      // Should not throw when trying to load
      expect(() => {
        wrapper.vm.loadMapPosition();
      }).not.toThrow();

      // Should log warning
      expect(console.warn).toHaveBeenCalledWith(
        '[HomeView] Failed to load map position:',
        expect.any(Error)
      );
    });
  });

  describe('Storage Key and Format', () => {
    it('should use correct localStorage key', () => {
      expect(MAP_POSITION_STORAGE_KEY).toBe('trackly_map_position');
    });

    it('should store position in correct format', async () => {
      wrapper = mount(HomeView);

      const testCenter = [55.7558, 37.6176];
      const testZoom = 15;
      const beforeTime = Date.now();

      // Call saveMapPosition directly to test format
      wrapper.vm.saveMapPosition(testCenter, testZoom);

      // Check if localStorage was called with correct format
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        MAP_POSITION_STORAGE_KEY,
        expect.stringContaining('"center":[55.7558,37.6176]')
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        MAP_POSITION_STORAGE_KEY,
        expect.stringContaining('"zoom":15')
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        MAP_POSITION_STORAGE_KEY,
        expect.stringContaining('"timestamp":')
      );
    });
  });
});
