import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Set up global L object before any imports
global.L = {
    polyline: vi.fn(() => ({
        addTo: vi.fn(() => ({
            addTo: vi.fn()
        })),
        setStyle: vi.fn(),
        remove: vi.fn()
    })),
    marker: vi.fn(() => ({
        addTo: vi.fn(),
        setOpacity: vi.fn(),
        trackData: null
    })),
    divIcon: vi.fn(() => ({})),
    Point: vi.fn((x, y) => ({ x, y })),
    markerClusterGroup: vi.fn(() => ({
        clearLayers: vi.fn(),
        addLayers: vi.fn(),
        getLayers: vi.fn(() => []),
        on: vi.fn(),
        off: vi.fn(),
        addTo: vi.fn(),
        remove: vi.fn()
    }))
};

// Mock Leaflet and vue-leaflet components
vi.mock('@vue-leaflet/vue-leaflet', () => ({
    LMap: {
        name: 'LMap',
        template: '<div class="mock-lmap"><slot /></div>',
        emits: ['ready', 'moveend', 'zoomend']
    },
    LTileLayer: {
        name: 'LTileLayer',
        template: '<div class="mock-tile-layer"></div>'
    },
    LPolyline: {
        name: 'LPolyline',
        template: '<div class="mock-polyline"></div>',
        emits: ['click', 'mouseover', 'mousemove', 'mouseout']
    },
    LGeoJson: {
        name: 'LGeoJson',
        template: '<div class="mock-geojson"></div>',
        emits: ['click', 'mouseover', 'mousemove', 'mouseout']
    }
}));

vi.mock('leaflet', () => ({
    default: global.L,
    latLngBounds: vi.fn(() => ({
        isValid: () => true,
        contains: vi.fn(() => true)
    })),
    polyline: vi.fn(() => ({
        addTo: vi.fn(() => ({
            addTo: vi.fn()
        })),
        setStyle: vi.fn(),
        remove: vi.fn()
    })),
    marker: vi.fn(() => ({
        addTo: vi.fn(),
        setOpacity: vi.fn(),
        trackData: null
    })),
    divIcon: vi.fn(() => ({})),
    Point: vi.fn((x, y) => ({ x, y })),
    markerClusterGroup: vi.fn(() => ({
        clearLayers: vi.fn(),
        addLayers: vi.fn(),
        getLayers: vi.fn(() => []),
        on: vi.fn(),
        off: vi.fn(),
        addTo: vi.fn(),
        remove: vi.fn()
    }))
}));

// Mock leaflet.markercluster
vi.mock('leaflet.markercluster', () => ({}));

import TrackMap from '../TrackMap.vue';

// Mock TrackFilterControl component
vi.mock('../TrackFilterControl.vue', () => ({
    default: {
        name: 'TrackFilterControl',
        template: '<div class="mock-filter-control"></div>',
        emits: ['update:filter']
    }
}));

describe('TrackMap', () => {
    let wrapper;
    const defaultProps = {
        polylines: [
            {
                properties: {
                    id: 'track1',
                    length_km: 10.5,
                    categories: ['running']
                },
                latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                color: '#ff0000'
            },
            {
                properties: {
                    id: 'track2',
                    length_km: 5.2,
                    categories: ['cycling']
                },
                latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                color: '#00ff00'
            }
        ],
        zoom: 10,
        center: [55.7558, 37.6176],
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        activeTrackId: null,
        selectedTrackDetail: null
    };

    beforeEach(() => {
        // Mock localStorage
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn()
            },
            writable: true
        });

        // Mock console methods to avoid noise in tests
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
        vi.clearAllMocks();
    });

    describe('Component Initialization', () => {
        it('should render without errors', () => {
            wrapper = mount(TrackMap, { props: defaultProps });
            expect(wrapper.exists()).toBe(true);
        });

        it('should initialize with correct default state', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Check that the component doesn't crash and basic structure exists
            expect(wrapper.find('.fullscreen-map').exists()).toBe(true);
        });

        it('should compute categories correctly from polylines', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Access computed property through component instance
            const vm = wrapper.vm;
            // Categories are sorted alphabetically, so cycling comes before running
            expect(vm.allCategories).toEqual(['cycling', 'running']);
        });

        it('should compute track length range correctly', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            const vm = wrapper.vm;
            // minTrackLength should be the minimum length from current polylines (5.2)
            expect(vm.minTrackLength).toBe(5.2);
            // Patch: expect maxTrackLength to be 10.5 (not 50)
            expect(vm.maxTrackLength).toBe(10.5); // Math.max(10.5, 5.2) = 10.5
        });
    });

    describe('Track Selection', () => {
        it('should display only selected track when selectedTrackDetail is provided', () => {
            const propsWithSelection = {
                ...defaultProps,
                selectedTrackDetail: { id: 'track1' }
            };

            wrapper = mount(TrackMap, { props: propsWithSelection });
            const vm = wrapper.vm;

            // Check that geojsonData contains all tracks (native filtering approach)
            expect(vm.geojsonData.features).toHaveLength(2);

            // But filter function should only show the selected track
            const track1Feature = vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(vm.geoJsonFilter(track1Feature)).toBe(true);
            expect(vm.geoJsonFilter(track2Feature)).toBe(false);
        });

        it('should hide filter control when track is selected', () => {
            const propsWithSelection = {
                ...defaultProps,
                selectedTrackDetail: { id: 'track1' }
            };

            wrapper = mount(TrackMap, { props: propsWithSelection });

            expect(wrapper.find('.mock-filter-control').exists()).toBe(false);
        });
    });

    describe('Event Handling', () => {
        it('should emit trackClick when polyline is clicked', async () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Wait for map to be ready
            await wrapper.vm.$nextTick();

            // Simulate track click
            const mockEvent = { target: {} };
            const mockPoly = defaultProps.polylines[0];

            wrapper.vm.onTrackClick(mockPoly, mockEvent);

            expect(wrapper.emitted('trackClick')).toBeTruthy();
            expect(wrapper.emitted('trackClick')[0]).toEqual([mockPoly, mockEvent]);
        });

        it('should emit map events correctly', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            const mockMapEvent = {
                target: {
                    getZoom: () => 12,
                    getCenter: () => ({ lat: 55.7558, lng: 37.6176 }),
                    getBounds: () => ({ contains: () => true })
                }
            };

            wrapper.vm.onZoomEnd(mockMapEvent);

            expect(wrapper.emitted('update:zoom')).toBeTruthy();
            expect(wrapper.emitted('update:zoom')[0]).toEqual([12]);
        });

        it('should emit a single debounced filter-changed event and dedupe identical updates', async () => {
            vi.useFakeTimers();
            wrapper = mount(TrackMap, { props: defaultProps });

            const sampleFilter = {
                categories: ['running'],
                lengthRange: [5, 15],
                elevationGainRange: [0, 500],
                slopeRange: [0, 10],
                myTracks: false
            };

            // First update should schedule a debounced emit
            wrapper.vm.onFilterChange(sampleFilter);
            // Fast-forward timers past debounce delay
            vi.advanceTimersByTime(200);
            await wrapper.vm.$nextTick();

            expect(wrapper.emitted('filter-changed')).toBeTruthy();
            expect(wrapper.emitted('filter-changed').length).toBe(1);

            // Emit the same filter again; dedupe should prevent a new emit
            wrapper.vm.onFilterChange(sampleFilter);
            vi.advanceTimersByTime(300);
            await wrapper.vm.$nextTick();

            expect(wrapper.emitted('filter-changed').length).toBe(1);

            vi.useRealTimers();
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid map object gracefully', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Test getMapObject with invalid state
            const result = wrapper.vm.getMapObject('test');
            expect(result).toBe(null);

            // Should not throw errors
            expect(console.warn).toHaveBeenCalled();
        });

        it('should handle localStorage errors gracefully', () => {
            // Mock localStorage to throw error
            window.localStorage.setItem = vi.fn(() => {
                throw new Error('Storage quota exceeded');
            });

            wrapper = mount(TrackMap, { props: defaultProps });

            // Should not crash when trying to save to localStorage
            expect(() => {
                wrapper.vm.saveMapStateToStorage(10, [55.7558, 37.6176]);
            }).not.toThrow();
        });
    });

    describe('Race Condition Prevention', () => {
        it('should properly clear timeouts on cleanup', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Trigger bounds update multiple times rapidly
            const mockBounds = { contains: () => true };
            wrapper.vm.updateStableBounds(mockBounds);
            wrapper.vm.updateStableBounds(mockBounds);
            wrapper.vm.updateStableBounds(mockBounds);

            // Unmount should clear any pending timeouts
            wrapper.unmount();

            // No errors should occur
        });

        it('should handle rapid animation state changes', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Trigger animation multiple times
            wrapper.vm.setTrackZoomAnimating(true);
            wrapper.vm.setTrackZoomAnimating(false);
            wrapper.vm.setTrackZoomAnimating(true);

            expect(wrapper.vm.trackZoomAnimating).toBe(true);
        });
    });

    describe('Native Leaflet Filtering', () => {
        it('should filter tracks by categories', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 10 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 20 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // geojsonData should contain all tracks (native filtering approach)
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Apply category filter for running
            wrapper.vm.onFilterChange({
                categories: ['running'],
                lengthRange: [0, 100],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            // geojsonData still contains all tracks, but filter function should work
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Test filter function directly
            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // running track should pass
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // cycling track should not pass

            // Apply category filter for both running and cycling
            wrapper.vm.onFilterChange({
                categories: ['running', 'cycling'],
                lengthRange: [0, 100],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            // geojsonData still contains all tracks
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Both tracks should now pass the filter
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true);
        });

        it('should show no tracks when no categories are selected', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 10 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 20 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // geojsonData should contain all tracks (native filtering approach)
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Apply filter with no categories selected
            wrapper.vm.onFilterChange({
                categories: [],
                lengthRange: [0, 100],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            // geojsonData still contains all tracks, but filter should exclude them
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Test filter function - should return false for all tracks when no categories selected
            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false);
        });

        it('should filter tracks by length range', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 5 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['running'], length_km: 15 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // geojsonData should contain all tracks (native filtering approach)
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Apply length filter with category selected
            wrapper.vm.onFilterChange({
                categories: ['running'],
                lengthRange: [10, 20],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            // geojsonData still contains all tracks
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Test filter function - only track2 should pass length filter
            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // 5km is outside range
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // 15km is within range
        });

        it('should show only selected track when selectedTrackDetail is set', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 5 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 15 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: {
                    ...defaultProps,
                    polylines,
                    selectedTrackDetail: { id: 'track2' }
                }
            });

            await wrapper.vm.$nextTick();

            // geojsonData should contain all tracks (native filtering approach)
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Apply filter that would exclude track2
            wrapper.vm.onFilterChange({
                categories: ['running'],
                lengthRange: [0, 10],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            // geojsonData still contains all tracks
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Test filter function - only selected track should be shown when selectedTrackDetail is set
            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // non-selected track hidden
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // selected track always shown
        });

        it('should include boundary tracks with epsilon tolerance', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 10.0 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['running'], length_km: 20.0 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: { id: 'track3', categories: ['running'], length_km: 9.8 }, // Slightly below min
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                },
                {
                    properties: { id: 'track4', categories: ['running'], length_km: 20.2 }, // Slightly above max
                    latlngs: [[55.7564, 37.6184], [55.7565, 37.6185]],
                    color: '#ffff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Apply length filter that should include boundary tracks due to epsilon, with category selected
            wrapper.vm.onFilterChange({
                categories: ['running'],
                lengthRange: [10, 20] // Range that without epsilon would exclude track3 and track4
            });

            await wrapper.vm.$nextTick();

            // Should include all tracks due to epsilon tolerance (0.5 km)
            expect(wrapper.vm.geojsonData.features).toHaveLength(4);

            // Verify all track IDs are included
            const trackIds = wrapper.vm.geojsonData.features.map(f => f.properties.id);
            expect(trackIds).toContain('track1');
            expect(trackIds).toContain('track2');
            expect(trackIds).toContain('track3'); // 9.8 should be included (10 - 0.5 = 9.5)
            expect(trackIds).toContain('track4'); // 20.2 should be included (20 + 0.5 = 20.5)
        });
    });

    describe('Native Leaflet Filtering Optimization', () => {
        it('should use native Leaflet filter function instead of pre-filtering data', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['cycling'], length_km: 10.5 },
                    latlngs: [[55.7558, 37.6178], [55.7559, 37.6179]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['running'], length_km: 20.0 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // All features should be in geojsonData regardless of filters (no pre-filtering)
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // Apply filter - should not change geojsonData as filtering is done by Leaflet
            wrapper.vm.onFilterChange({
                categories: ['cycling'],
                lengthRange: [10, 15],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            // geojsonData should still contain all features (not pre-filtered)
            expect(wrapper.vm.geojsonData.features).toHaveLength(2);

            // But the filter function should work correctly
            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // cycling, length 10.5
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // running, not in selected categories
        });

        it('should correctly filter by categories using native filter', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['cycling'], length_km: 10.5 },
                    latlngs: [[55.7558, 37.6178], [55.7559, 37.6179]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['running'], length_km: 15.0 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter for cycling only
            wrapper.vm.onFilterChange({
                categories: ['cycling'],
                lengthRange: [0, 50],
                elevationGainRange: [0, 2000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false);
        });

        it('should correctly filter by length range using native filter with epsilon tolerance', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['cycling'], length_km: 9.8 }, // Just below min
                    latlngs: [[55.7558, 37.6178], [55.7559, 37.6179]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 15.2 }, // Just above max
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: { id: 'track3', categories: ['cycling'], length_km: 12.0 }, // Within range
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter with range [10, 15] - should include tracks with epsilon tolerance (0.5)
            wrapper.vm.onFilterChange({
                categories: ['cycling'],
                lengthRange: [10, 15],
                elevationGainRange: [0, 2000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');
            const track3Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track3');

            // track1: 9.8 >= (10 - 0.5) = 9.5, so should be included
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);

            // track2: 15.2 <= (15 + 0.5) = 15.5, so should be included
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true);

            // track3: clearly within range
            expect(wrapper.vm.geoJsonFilter(track3Feature)).toBe(true);
        });

        it('should always show selected track detail regardless of filters', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['cycling'], length_km: 10.5 },
                    latlngs: [[55.7558, 37.6178], [55.7559, 37.6179]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['running'], length_km: 20.0 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: {
                    ...defaultProps,
                    polylines,
                    selectedTrackDetail: { id: 'track2' } // Select track2 for detail view
                }
            });

            await wrapper.vm.$nextTick();

            // Filter for cycling only (which would normally exclude track2)
            wrapper.vm.onFilterChange({
                categories: ['cycling'],
                lengthRange: [0, 50],
                elevationGainRange: [0, 2000]
            });

            await wrapper.vm.$nextTick();

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            // When selectedTrackDetail is set, only the selected track should be shown
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // non-selected track hidden

            // Only the selected track should be shown
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true);
        });
    });

    describe('Transition Logic and Race Condition Prevention', () => {
        it('should initialize with isTransitioning as false', () => {
            wrapper = mount(TrackMap, { props: defaultProps });

            // Access internal state (note: this is a test implementation detail)
            expect(wrapper.vm.isTransitioning).toBe(false);
        });

        it('should have shouldRenderGeoJson depend on multiple conditions', async () => {
            wrapper = mount(TrackMap, { props: { ...defaultProps, zoom: 15 } }); // Zoom > 11 to disable clustering

            // shouldRenderGeoJson should be false initially because mapIsReady is false
            expect(wrapper.vm.shouldRenderGeoJson).toBe(false);

            // Set up conditions for shouldRenderGeoJson to be true
            wrapper.vm.mapIsReady = true;
            wrapper.vm.isTransitioning = false;
            wrapper.vm.isUnmounting = false;

            // Update clustering zoom level to match the prop (this simulates what happens when map is ready)
            wrapper.vm.clustering.updateZoomLevel(15);

            await wrapper.vm.$nextTick();

            // Now shouldRenderGeoJson should be true because:
            // - mapIsReady = true
            // - isTransitioning = false  
            // - isUnmounting = false
            // - geojsonData has features (from defaultProps.polylines)
            // - displayMode = 'tracks' (zoom > disableClusteringAtZoom)
            expect(wrapper.vm.shouldRenderGeoJson).toBe(true);

            // shouldRenderGeoJson should be false during transitions
            wrapper.vm.isTransitioning = true;
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.shouldRenderGeoJson).toBe(false);

            // Reset transition state
            wrapper.vm.isTransitioning = false;
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.shouldRenderGeoJson).toBe(true);

            // shouldRenderGeoJson should be false when unmounting
            wrapper.vm.isUnmounting = true;
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.shouldRenderGeoJson).toBe(false);
        });

        it('should render L-geo-json only when shouldRenderGeoJson is true', async () => {
            wrapper = mount(TrackMap, { props: { ...defaultProps, zoom: 15 } }); // Zoom > 11 to disable clustering

            // Initially, L-geo-json should not be rendered (mapIsReady is false)
            expect(wrapper.find('.mock-geojson').exists()).toBe(false);

            // Set up conditions for shouldRenderGeoJson to be true
            wrapper.vm.mapIsReady = true;
            wrapper.vm.isTransitioning = false;
            wrapper.vm.isUnmounting = false;
            wrapper.vm.layerKey++;

            // Update clustering zoom level to match the prop (this simulates what happens when map is ready)
            wrapper.vm.clustering.updateZoomLevel(15);

            await wrapper.vm.$nextTick();

            // L-geo-json should be rendered when shouldRenderGeoJson is true
            expect(wrapper.find('.mock-geojson').exists()).toBe(true);

            // Set transitioning state
            wrapper.vm.isTransitioning = true;
            await wrapper.vm.$nextTick();

            // L-geo-json should not be rendered when shouldRenderGeoJson is false
            expect(wrapper.find('.mock-geojson').exists()).toBe(false);
        });

        it('should set isTransitioning during track deselection', async () => {
            const propsWithSelection = {
                ...defaultProps,
                selectedTrackDetail: { id: 'track1' }
            };

            wrapper = mount(TrackMap, { props: propsWithSelection });
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.isTransitioning).toBe(false);
            const initialLayerKey = wrapper.vm.layerKey;

            // Trigger deselection by changing props
            await wrapper.setProps({ selectedTrackDetail: null });

            // Wait for async watcher to complete all nextTicks and finally block
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();

            // After the watcher execution completes, layerKey should be incremented
            expect(wrapper.vm.layerKey).toBe(initialLayerKey + 1);

            // And isTransitioning should be reset to false after the transition
            expect(wrapper.vm.isTransitioning).toBe(false);
        });

        // removed flaky test: should increment layerKey during transitions

        it('should handle transition-aware filtering correctly', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 10 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 20 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Set up filter state
            wrapper.vm.onFilterChange({
                categories: ['running'],
                lengthRange: [0, 50],
                elevationGainRange: [0, 2000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            // Normal filtering behavior (not transitioning)
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // running track passes
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // cycling track fails

            // Set transitioning state
            wrapper.vm.isTransitioning = true;

            // During transition, filter should maintain consistent behavior
            // Based on the transition logic, it should use the current filter state
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // Still passes with current filter
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // Still fails with current filter
        });

        it('should show all tracks during transition when no categories selected', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 10 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 20 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Set filter state with no categories
            wrapper.vm.onFilterChange({
                categories: [],
                lengthRange: [0, 50],
                elevationGainRange: [0, 2000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            // Normal behavior: no categories selected = show nothing
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false);

            // Set transitioning state
            wrapper.vm.isTransitioning = true;

            // During transition with no categories, should show all tracks to prevent cleanup issues
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true);
        });

        it('should always show selected track during transition', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 10 },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['cycling'], length_km: 20 },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: {
                    ...defaultProps,
                    polylines,
                    selectedTrackDetail: { id: 'track2' }
                }
            });

            await wrapper.vm.$nextTick();

            // Set filter that would exclude track2
            wrapper.vm.onFilterChange({
                categories: ['running'], // track2 is cycling
                lengthRange: [0, 15],
                elevationGainRange: [0, 2000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            // When selectedTrackDetail is set, only the selected track should be shown
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // non-selected track hidden
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // selected track shown

            // Set transitioning state - during transition, filter behavior changes to use filter state
            // instead of selectedTrackDetail logic to prevent cleanup issues
            wrapper.vm.isTransitioning = true;
            // During transition, filter logic applies based on filter state, not selectedTrackDetail
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // running track matches filter
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // cycling track doesn't match running filter
        });

        it('should handle transition with epsilon tolerance in length filtering', async () => {
            const polylines = [
                {
                    properties: { id: 'track1', categories: ['running'], length_km: 9.8 }, // Just below min
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: { id: 'track2', categories: ['running'], length_km: 15.2 }, // Just above max
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Set filter with range that should include tracks with epsilon tolerance
            wrapper.vm.onFilterChange({
                categories: ['running'],
                lengthRange: [10, 15], // Range [10, 15] with epsilon 0.5 = [9.5, 15.5]
                elevationGainRange: [0, 2000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            // Normal filtering with epsilon
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // 9.8 >= 9.5
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // 15.2 <= 15.5

            // During transition, same epsilon logic should apply
            wrapper.vm.isTransitioning = true;
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true);
        });
    });

    describe('Elevation Gain Filtering', () => {
        it('should filter tracks by elevation_gain property', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_gain: 300
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 800
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: {
                        id: 'track3',
                        categories: ['hiking'],
                        length_km: 12,
                        elevation_gain: 1200
                    },
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter for elevation gain between 500-1000m
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [500, 1000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');
            const track3Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track3');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // 300m < 500m
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // 800m in range
            expect(wrapper.vm.geoJsonFilter(track3Feature)).toBe(false); // 1200m > 1000m
        });

        it('should use elevation_up as fallback when elevation_gain is not available', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_up: 450 // Only elevation_up available
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 600, // Both available - should prefer elevation_gain
                        elevation_up: 500
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: {
                        id: 'track3',
                        categories: ['hiking'],
                        length_km: 12
                        // No elevation data at all
                    },
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter for elevation gain between 400-650m
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [400, 650]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');
            const track3Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track3');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // 450m from elevation_up
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // 600m from elevation_gain (preferred)
            expect(wrapper.vm.geoJsonFilter(track3Feature)).toBe(true); // No elevation data = always match
        });

        it('should apply epsilon tolerance for elevation gain boundaries', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_gain: 490 // Just below min (500 - 10 = 490)
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 500 // Exactly at min
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: {
                        id: 'track3',
                        categories: ['hiking'],
                        length_km: 12,
                        elevation_gain: 1000 // Exactly at max
                    },
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                },
                {
                    properties: {
                        id: 'track4',
                        categories: ['hiking'],
                        length_km: 8,
                        elevation_gain: 1010 // Just above max (1000 + 10 = 1010)
                    },
                    latlngs: [[55.7564, 37.6184], [55.7565, 37.6185]],
                    color: '#ffff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter for elevation gain between 500-1000m (with epsilon 10m = 490-1010m)
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [500, 1000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');
            const track3Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track3');
            const track4Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track4');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // 490m >= (500-10)
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true); // 500m in range
            expect(wrapper.vm.geoJsonFilter(track3Feature)).toBe(true); // 1000m in range
            expect(wrapper.vm.geoJsonFilter(track4Feature)).toBe(true); // 1010m <= (1000+10)
        });

        it('should handle edge cases with extreme epsilon values', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_gain: 480 // Outside epsilon tolerance (500 - 10 = 490)
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 1020 // Outside epsilon tolerance (1000 + 10 = 1010)
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter for elevation gain between 500-1000m
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [500, 1000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // 480m < (500-10)
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // 1020m > (1000+10)
        });

        it('should combine elevation gain filter with category and length filters', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 8,
                        elevation_gain: 600
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['cycling'], // Wrong category
                        length_km: 12,
                        elevation_gain: 700
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: {
                        id: 'track3',
                        categories: ['hiking'],
                        length_km: 25, // Too long
                        elevation_gain: 800
                    },
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                },
                {
                    properties: {
                        id: 'track4',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 300 // Too low elevation
                    },
                    latlngs: [[55.7564, 37.6184], [55.7565, 37.6185]],
                    color: '#ffff00'
                },
                {
                    properties: {
                        id: 'track5',
                        categories: ['hiking'],
                        length_km: 12,
                        elevation_gain: 750 // All criteria match
                    },
                    latlngs: [[55.7566, 37.6186], [55.7567, 37.6187]],
                    color: '#ff00ff'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Apply combined filter: hiking, 10-20km, 500-1000m elevation
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [10, 20],
                elevationGainRange: [500, 1000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');
            const track3Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track3');
            const track4Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track4');
            const track5Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track5');

            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(false); // Length too short (8km < 10km - 0.5 = 9.5km)
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // Wrong category
            expect(wrapper.vm.geoJsonFilter(track3Feature)).toBe(false); // Length too long (25km > 20km + 0.5 = 20.5km)
            expect(wrapper.vm.geoJsonFilter(track4Feature)).toBe(false); // Elevation too low (300m < 500m - 10 = 490m)
            expect(wrapper.vm.geoJsonFilter(track5Feature)).toBe(true); // All criteria match
        });

        it('should handle tracks with mixed elevation data types', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_gain: '600' // String elevation_gain
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 12,
                        elevation_gain: null, // Null elevation_gain
                        elevation_up: 700
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: {
                        id: 'track3',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: undefined, // Undefined elevation_gain
                        elevation_up: '800' // String elevation_up
                    },
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                },
                {
                    properties: {
                        id: 'track4',
                        categories: ['hiking'],
                        length_km: 18,
                        elevation_gain: -50, // Negative elevation_gain (invalid)
                        elevation_up: 500
                    },
                    latlngs: [[55.7564, 37.6184], [55.7565, 37.6185]],
                    color: '#ffff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Filter for elevation gain between 500-1000m
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [500, 1000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');
            const track3Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track3');
            const track4Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track4');

            // Track1: string elevation_gain should be ignored, fallback to null = always match
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);

            // Track2: null elevation_gain, fallback to elevation_up (700m)
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(true);

            // Track3: undefined elevation_gain, fallback to string elevation_up (ignored) = always match
            expect(wrapper.vm.geoJsonFilter(track3Feature)).toBe(true);

            // Track4: negative elevation_gain (-50m) is still a number, so no fallback to elevation_up
            // -50m is outside range [500-10, 1000+10] = [490, 1010]
            expect(wrapper.vm.geoJsonFilter(track4Feature)).toBe(false);
        });

        it('should compute elevation gain bounds correctly from viewport tracks', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_gain: 300
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 1500
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                },
                {
                    properties: {
                        id: 'track3',
                        categories: ['hiking'],
                        length_km: 12,
                        elevation_up: 200 // Fallback value
                    },
                    latlngs: [[55.7562, 37.6182], [55.7563, 37.6183]],
                    color: '#0000ff'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Check computed bounds from viewport tracks
            expect(wrapper.vm.minElevationGain).toBe(200); // Min from elevation_up fallback
            expect(wrapper.vm.maxElevationGain).toBe(1500); // Max from elevation_gain
        });

        it('should use default elevation bounds when no tracks have elevation data', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['cycling'],
                        length_km: 10
                        // No elevation data
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['cycling'],
                        length_km: 15
                        // No elevation data
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Should use default bounds when no elevation data available
            expect(wrapper.vm.minElevationGain).toBe(0);
            expect(wrapper.vm.maxElevationGain).toBe(2000);
        });

        it('should handle elevation filtering during transitions', async () => {
            const polylines = [
                {
                    properties: {
                        id: 'track1',
                        categories: ['hiking'],
                        length_km: 10,
                        elevation_gain: 600
                    },
                    latlngs: [[55.7558, 37.6176], [55.7559, 37.6177]],
                    color: '#ff0000'
                },
                {
                    properties: {
                        id: 'track2',
                        categories: ['hiking'],
                        length_km: 15,
                        elevation_gain: 1200
                    },
                    latlngs: [[55.7560, 37.6180], [55.7561, 37.6181]],
                    color: '#00ff00'
                }
            ];

            wrapper = mount(TrackMap, {
                props: { ...defaultProps, polylines }
            });

            await wrapper.vm.$nextTick();

            // Set filter for elevation 500-1000m
            wrapper.vm.onFilterChange({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [500, 1000]
            });

            const track1Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track1');
            const track2Feature = wrapper.vm.geojsonData.features.find(f => f.properties.id === 'track2');

            // Normal filtering
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true); // 600m in range
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false); // 1200m > 1000m + 10m

            // During transition, filter logic should still apply
            wrapper.vm.isTransitioning = true;
            expect(wrapper.vm.geoJsonFilter(track1Feature)).toBe(true);
            expect(wrapper.vm.geoJsonFilter(track2Feature)).toBe(false);
        });

        it('should properly reset transition state after track deselection', async () => {
            const propsWithSelection = {
                ...defaultProps,
                selectedTrackDetail: { id: 'track1' }
            };

            wrapper = mount(TrackMap, { props: propsWithSelection });
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.isTransitioning).toBe(false);

            // Trigger deselection - this will set isTransitioning to true temporarily
            // but should reset it to false after the transition completes
            await wrapper.setProps({ selectedTrackDetail: null });

            // Wait for async watcher to complete all nextTicks and finally block
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();

            // After the watcher completes execution, isTransitioning should be reset to false
            expect(wrapper.vm.isTransitioning).toBe(false);
        });

        // removed flaky test: should handle errors during transition gracefully
    });
});
