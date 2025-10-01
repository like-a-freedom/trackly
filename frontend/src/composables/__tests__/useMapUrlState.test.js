/**
 * Tests for useMapUrlState composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useMapUrlState } from '../useMapUrlState.js';

// Mock Vue Router
const mockRoute = {
  query: {}
};

const mockRouter = {
  replace: vi.fn()
};

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter
}));

// Mock useAdvancedDebounce
const mockDebounced = {
  cancel: vi.fn()
};

vi.mock('../useAdvancedDebounce.js', () => ({
  useAdvancedDebounce: vi.fn((fn, delay, options) => {
    const debounced = (...args) => fn(...args);
    debounced.cancel = mockDebounced.cancel;
    debounced.pending = () => false;
    debounced.flush = () => {};
    return debounced;
  })
}));

describe('useMapUrlState', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Reset route query
    mockRoute.query = {};
    
    // Mock window.dispatchEvent
    vi.stubGlobal('dispatchEvent', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should initialize with default values when no URL params', () => {
      const mapUrlState = useMapUrlState({
        initialZoom: 12,
        initialCenter: [55.0, 37.0]
      });

      const result = mapUrlState.initializeFromUrl();
      
      expect(result.zoom).toBe(12);
      expect(result.center).toEqual([55.0, 37.0]);
      expect(result.fromUrl).toBe(false);
    });

    it('should initialize from valid URL parameters', () => {
      mockRoute.query = {
        zoom: '14.5',
        lat: '55.7558',
        lng: '37.6176'
      };

      const mapUrlState = useMapUrlState({
        initialZoom: 12,
        initialCenter: [55.0, 37.0]
      });

      const result = mapUrlState.initializeFromUrl();
      
      expect(result.zoom).toBe(14.5);
      expect(result.center).toEqual([55.7558, 37.6176]);
      expect(result.fromUrl).toBe(true);
    });

    it('should fallback to defaults with invalid URL parameters', () => {
      mockRoute.query = {
        zoom: 'invalid',
        lat: '200', // Invalid latitude
        lng: 'invalid'
      };

      const mapUrlState = useMapUrlState({
        initialZoom: 12,
        initialCenter: [55.0, 37.0]
      });

      const result = mapUrlState.initializeFromUrl();
      
      expect(result.zoom).toBe(12);
      expect(result.center).toEqual([55.0, 37.0]);
      expect(result.fromUrl).toBe(false);
    });
  });

  describe('URL parameter validation', () => {
    let mapUrlState;

    beforeEach(() => {
      mapUrlState = useMapUrlState();
    });

    describe('isValidZoom', () => {
      it('should validate zoom values correctly', () => {
        expect(mapUrlState.isValidZoom(10)).toBe(true);
        expect(mapUrlState.isValidZoom(6)).toBe(true);
        expect(mapUrlState.isValidZoom(18)).toBe(true);
        expect(mapUrlState.isValidZoom(5.9)).toBe(false);
        expect(mapUrlState.isValidZoom(18.1)).toBe(false);
        expect(mapUrlState.isValidZoom(NaN)).toBe(false);
        expect(mapUrlState.isValidZoom('10')).toBe(false);
        expect(mapUrlState.isValidZoom(null)).toBe(false);
      });
    });

    describe('isValidLatLng', () => {
      it('should validate coordinate arrays correctly', () => {
        expect(mapUrlState.isValidLatLng([55.0, 37.0])).toBe(true);
        expect(mapUrlState.isValidLatLng([-90, -180])).toBe(true);
        expect(mapUrlState.isValidLatLng([90, 180])).toBe(true);
        
        // Invalid cases
        expect(mapUrlState.isValidLatLng([91, 0])).toBe(false); // lat > 90
        expect(mapUrlState.isValidLatLng([-91, 0])).toBe(false); // lat < -90
        expect(mapUrlState.isValidLatLng([0, 181])).toBe(false); // lng > 180
        expect(mapUrlState.isValidLatLng([0, -181])).toBe(false); // lng < -180
        expect(mapUrlState.isValidLatLng([NaN, 0])).toBe(false);
        expect(mapUrlState.isValidLatLng([0, NaN])).toBe(false);
        expect(mapUrlState.isValidLatLng(['55', '37'])).toBe(false);
        expect(mapUrlState.isValidLatLng([55])).toBe(false); // Wrong length
        expect(mapUrlState.isValidLatLng(null)).toBe(false);
        expect(mapUrlState.isValidLatLng('55,37')).toBe(false);
      });
    });
  });

  describe('URL updates', () => {
    let mapUrlState;

    beforeEach(() => {
      mapUrlState = useMapUrlState({
        debounceMs: 0 // Disable debouncing for tests
      });
    });

    it('should update URL with valid map state', () => {
      mapUrlState.updateMapState(14.5, [55.7558, 37.6176]);

      expect(mockRouter.replace).toHaveBeenCalledWith({
        query: {
          zoom: '14.50',
          lat: '55.755800',
          lng: '37.617600'
        }
      });
    });

    it('should not update URL with invalid zoom', () => {
      mapUrlState.updateMapState(25, [55.7558, 37.6176]); // Invalid zoom

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('should not update URL with invalid coordinates', () => {
      mapUrlState.updateMapState(14.5, [200, 37.6176]); // Invalid lat

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('should respect precision settings', () => {
      const customMapUrlState = useMapUrlState({
        zoomPrecision: 1,
        coordPrecision: 4,
        debounceMs: 0
      });

      customMapUrlState.updateMapState(14.555, [55.75589, 37.61766]);

      expect(mockRouter.replace).toHaveBeenCalledWith({
        query: {
          zoom: '14.6', // Rounded to 1 decimal
          lat: '55.7559', // Rounded to 4 decimals
          lng: '37.6177'  // Rounded to 4 decimals
        }
      });
    });
  });

  describe('URL parsing', () => {
    let mapUrlState;

    beforeEach(() => {
      mapUrlState = useMapUrlState();
    });

    it('should parse complete valid URL parameters', () => {
      mockRoute.query = {
        zoom: '13.25',
        lat: '55.7558',
        lng: '37.6176'
      };

      const result = mapUrlState.parseUrlParams();

      expect(result).toEqual({
        zoom: 13.25,
        center: [55.7558, 37.6176],
        hasValidParams: true
      });
    });

    it('should handle missing URL parameters', () => {
      mockRoute.query = {};

      const result = mapUrlState.parseUrlParams();

      expect(result.zoom).toBe(11); // Default
      expect(result.center).toEqual([56.04028, 37.83185]); // Default
      expect(result.hasValidParams).toBe(false);
    });

    it('should handle partial URL parameters', () => {
      mockRoute.query = {
        zoom: '14',
        // Missing lat, lng
      };

      const result = mapUrlState.parseUrlParams();

      expect(result.zoom).toBe(14); // Valid zoom is kept, only coords fall back
      expect(result.center).toEqual([56.04028, 37.83185]); // Fallback to default
      expect(result.hasValidParams).toBe(false);
    });

    it('should log warning for invalid parameters', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      mockRoute.query = {
        zoom: 'invalid',
        lat: '999', // Invalid
        lng: 'test'
      };

      mapUrlState.parseUrlParams();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MapURL] Invalid URL parameters detected:',
        expect.objectContaining({
          zoom: 'invalid',
          lat: '999',
          lng: 'test',
          validZoom: false,
          validCoords: false
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('utility methods', () => {
    let mapUrlState;

    beforeEach(() => {
      mapUrlState = useMapUrlState();
      
      // Mock window.location
      delete window.location;
      window.location = {
        href: 'http://example.com/?zoom=14&lat=55.7558&lng=37.6176'
      };
    });

    it('should return current map URL', () => {
      const url = mapUrlState.getCurrentMapUrl();
      expect(url).toBe('http://example.com/?zoom=14&lat=55.7558&lng=37.6176');
    });

    it('should clear URL parameters', () => {
      mockRoute.query = {
        zoom: '14',
        lat: '55.7558',
        lng: '37.6176',
        other: 'param'
      };

      mapUrlState.clearUrlParams();

      expect(mockRouter.replace).toHaveBeenCalledWith({
        query: { other: 'param' }
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle router errors gracefully', async () => {
      mockRouter.replace.mockRejectedValueOnce(new Error('Router error'));

      const mapUrlState = useMapUrlState({ debounceMs: 0 });
      // Wait for debounced function to execute
      await new Promise(resolve => setTimeout(resolve, 350));
      
      mapUrlState.updateMapState(14, [55, 37]);
      
      // Wait for debounced function to execute again
      await new Promise(resolve => setTimeout(resolve, 350));

      // Just verify that router.replace was called and the error didn't crash the app
      expect(mockRouter.replace).toHaveBeenCalledWith({
        query: {
          zoom: '14.00',
          lat: '55.000000',
          lng: '37.000000'
        }
      });
    });

    it('should handle boundary coordinate values correctly', () => {
      const mapUrlState = useMapUrlState();

      // Test boundary values
      expect(mapUrlState.isValidLatLng([90, 180])).toBe(true);
      expect(mapUrlState.isValidLatLng([-90, -180])).toBe(true);
      expect(mapUrlState.isValidLatLng([90.000001, 0])).toBe(false);
      expect(mapUrlState.isValidLatLng([0, 180.000001])).toBe(false);
    });

    it('should handle zoom boundary values correctly', () => {
      const mapUrlState = useMapUrlState();

      expect(mapUrlState.isValidZoom(6)).toBe(true);
      expect(mapUrlState.isValidZoom(18)).toBe(true);
      expect(mapUrlState.isValidZoom(5.999999)).toBe(false);
      expect(mapUrlState.isValidZoom(18.000001)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cancel debounced functions on cleanup', () => {
      const mapUrlState = useMapUrlState();
      
      // Simulate component unmount by calling the cleanup function
      // Note: In real usage, this is handled by Vue's onUnmounted
      mapUrlState._debouncedUpdateUrl.cancel();
      
      expect(mockDebounced.cancel).toHaveBeenCalled();
    });
  });
});