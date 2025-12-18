/**
 * Integration tests for HomeView with URL state management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

// Mock dependencies
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {},
    path: '/'
  }),
  useRouter: () => ({
    replace: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    currentRoute: {
      value: { path: '/', query: {} }
    }
  })
}));

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

vi.mock('../../utils/session', () => ({
  getSessionId: () => 'test-session-id'
}));

vi.mock('../../composables/useAdvancedDebounce', () => ({
  useAdvancedDebounce: (fn) => {
    const debouncedFn = vi.fn(fn);
    debouncedFn.cancel = vi.fn();
    debouncedFn.pending = () => false;
    debouncedFn.flush = vi.fn();
    return debouncedFn;
  },
  useThrottle: (fn) => vi.fn(fn)
}));

// Mock useMapUrlState
vi.mock('../../composables/useMapUrlState', () => ({
  useMapUrlState: ({ initialZoom, initialCenter }) => ({
    hasUrlParams: { value: false },
    isUpdatingFromUrl: { value: false },
    updateMapState: vi.fn(),
    updateFromUrl: vi.fn(),
    initializeFromUrl: vi.fn(() => ({ zoom: initialZoom, center: initialCenter })),
    clearUrlParams: vi.fn(),
    getCurrentMapUrl: vi.fn(() => 'http://localhost/?zoom=11&lat=56.04028&lng=37.83185'),
    parseUrlParams: vi.fn(() => ({ zoom: null, center: null })),
    isValidZoom: vi.fn((z) => z >= 0 && z <= 18),
    isValidLatLng: vi.fn((coords) => Array.isArray(coords) && coords.length === 2),
    _debouncedUpdateUrl: { cancel: vi.fn() }
  })
}));

// Mock TrackMap component
vi.mock('../../components/TrackMap.vue', () => ({
  default: {
    name: 'TrackMap',
    template: '<div data-testid="track-map"></div>',
    props: ['zoom', 'center', 'polylines', 'activeTrackId'],
    emits: ['update:zoom', 'update:center', 'update:bounds', 'mapReady']
  }
}));

// Mock other components
vi.mock('../../components/TrackTooltip.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../components/UploadForm.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../components/Toast.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../components/TrackSearch.vue', () => ({ default: { template: '<div></div>' } }));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

// Import HomeView after mocks so mocks are applied before module load
import HomeView from '../../views/HomeView.vue';

describe.skip('HomeView Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('URL State Integration', () => {
    it('should initialize with default values when no saved state or URL params', async () => {
      try {
        const wrapper = mount(HomeView);
        await nextTick();

        const trackMap = wrapper.findComponent({ name: 'TrackMap' });
        expect(trackMap.props('zoom')).toBe(11);
        expect(trackMap.props('center')).toEqual([56.04028, 37.83185]);
      } catch (error) {
        console.error('Mount error:', error);
        throw error;
      }
    });

    it('should initialize from localStorage when available', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        const storage = {
          trackly_map_position: JSON.stringify({
            center: [55.7558, 37.6176],
            zoom: 14.5,
            timestamp: Date.now()
          })
        };
        return storage[key] || null;
      });

      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      expect(trackMap.props('zoom')).toBe(14.5);
      expect(trackMap.props('center')).toEqual([55.7558, 37.6176]);
    });

    it('should handle zoom updates and sync with URL', async () => {
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });

      // Simulate zoom change from map
      await trackMap.vm.$emit('update:zoom', 15);
      await nextTick();

      expect(trackMap.props('zoom')).toBe(15);
    });

    it('should handle center updates and sync with URL', async () => {
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      const newCenter = [55.7558, 37.6176];

      // Simulate center change from map
      await trackMap.vm.$emit('update:center', newCenter);
      await nextTick();

      expect(trackMap.props('center')).toEqual(newCenter);
    });

    it('should handle invalid zoom values gracefully', async () => {
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      const originalZoom = trackMap.props('zoom');

      // Simulate invalid zoom change
      await trackMap.vm.$emit('update:zoom', NaN);
      await nextTick();

      // Should maintain original zoom
      expect(trackMap.props('zoom')).toBe(originalZoom);
    });

    it('should handle invalid center values gracefully', async () => {
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      const originalCenter = trackMap.props('center');

      // Simulate invalid center change
      await trackMap.vm.$emit('update:center', [NaN, 37.6176]);
      await nextTick();

      // Should maintain original center
      expect(trackMap.props('center')).toEqual(originalCenter);
    });
  });

  describe('localStorage Integration', () => {
    it('should save map position to localStorage on changes', async () => {
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });

      // Simulate zoom change
      await trackMap.vm.$emit('update:zoom', 16);
      await nextTick();

      // Wait for debounced save (may need to flush timers in real test)
      await waitFor(() => localStorageMock.setItem.mock.calls.length > 0);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'trackly_map_position',
        expect.stringContaining('"zoom":16')
      );
    });

    it('should handle localStorage errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('localStorage full');
      });

      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });

      // This should not throw
      await trackMap.vm.$emit('update:zoom', 16);
      await nextTick();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save map position'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Component Lifecycle', () => {
    it('should clean up event listeners on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const wrapper = mount(HomeView);
      await nextTick();

      wrapper.unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('track-deleted', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mapUrlStateChanged', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('should save final position before unmount', async () => {
      const wrapper = mount(HomeView);
      await nextTick();

      // Change map state
      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      await trackMap.vm.$emit('update:zoom', 17);
      await trackMap.vm.$emit('update:center', [55.1234, 37.5678]);
      await nextTick();

      wrapper.unmount();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'trackly_map_position',
        expect.stringContaining('"zoom":17')
      );
    });
  });

  describe('Error Recovery', () => {
    it('should recover from corrupted localStorage data', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'trackly_map_position') {
          return 'invalid-json{';
        }
        return null;
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // Should not throw and should use defaults
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      expect(trackMap.props('zoom')).toBe(11); // Default
      expect(trackMap.props('center')).toEqual([56.04028, 37.83185]); // Default

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load map position'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle malformed saved position data', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'trackly_map_position') {
          return JSON.stringify({
            center: [null, undefined], // Invalid
            zoom: 'invalid', // Invalid
            timestamp: Date.now()
          });
        }
        return null;
      });

      // Should use defaults for invalid data
      const wrapper = mount(HomeView);
      await nextTick();

      const trackMap = wrapper.findComponent({ name: 'TrackMap' });
      expect(trackMap.props('zoom')).toBe(11); // Default
      expect(trackMap.props('center')).toEqual([56.04028, 37.83185]); // Default
    });
  });
});