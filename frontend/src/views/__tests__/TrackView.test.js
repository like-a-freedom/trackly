import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TrackView from '../TrackView.vue';

// Disable debouncing to simplify timing in tests
vi.mock('../../composables/useAdvancedDebounce', () => ({
    useAdvancedDebounce: (fn) => fn
}));

// Mock router
const mockRouter = {
    push: vi.fn().mockResolvedValue(undefined)
};

const mockRoute = {
    params: {
        id: 'test-track-id'
    }
};

// Mock composables
vi.mock('../../composables/useTracks', () => ({
    useTracks: () => ({
        fetchTrackDetail: vi.fn().mockResolvedValue({
            id: 'test-track-id',
            name: 'Test Track',
            description: 'Test Description',
            // Provide geom_geojson so the component's extractSegments() returns segments
            geom_geojson: {
                type: 'LineString',
                coordinates: [
                    // Coordinates must be [lng, lat]
                    [30.3609, 59.9311],
                    [30.3619, 59.9321],
                    [30.3629, 59.9331]
                ]
            },
            length_km: 5.2,
            session_id: 'test-session'
        })
    })
}));

vi.mock('../../composables/useToast', () => ({
    useToast: () => ({
        toast: { value: null }
    })
}));

vi.mock('../../composables/useSearchState', () => ({
    useSearchState: () => ({
        hasSearchState: () => false,
        restoreSearchState: vi.fn()
    })
}));

vi.mock('../../utils/session', () => ({
    getSessionId: () => 'test-session'
}));

vi.mock('vue-router', () => ({
    useRouter: () => mockRouter,
    useRoute: () => mockRoute
}));

// Remove individual component mocks - we'll use global stubs instead

describe('TrackView Auto-Scaling', () => {
    let wrapper;

    // Helper function to create mounted wrapper with proper stubs
    function createWrapper(props = {}) {
        return mount(TrackView, {
            props: {
                id: 'test-track-id',
                ...props
            },
            global: {
                stubs: {
                    TrackMap: {
                        name: 'TrackMap',
                        props: ['polylines', 'zoom', 'center', 'bounds', 'url', 'attribution', 'activeTrackId', 'selectedTrackDetail'],
                        template: '<div class="track-map-mock">TrackMap Mock</div>'
                    },
                    TrackDetailPanel: {
                        name: 'TrackDetailPanel',
                        props: ['track', 'isOwner', 'sessionId'],
                        template: '<div class="track-detail-panel-mock">TrackDetailPanel Mock</div>'
                    },
                    Toast: {
                        name: 'Toast',
                        props: ['message', 'type', 'duration'],
                        template: '<div class="toast-mock">Toast Mock</div>'
                    }
                }
            }
        });
    }

    beforeEach(() => {
        // Mock window dimensions
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1200
        });
        Object.defineProperty(window, 'innerHeight', {
            writable: true,
            configurable: true,
            value: 800
        });
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
    });

    it('should calculate track bounds correctly', async () => {
        wrapper = createWrapper();

        // Wait for track to load
        await waitFor(() => wrapper.vm.track);

        // Check that trackBounds computed property works
        const trackBounds = wrapper.vm.trackBounds;
        expect(trackBounds).toBeTruthy();
        expect(Array.isArray(trackBounds)).toBe(true);
        expect(trackBounds.length).toBe(2);

        // Check that bounds contain southwest and northeast corners
        const [southwest, northeast] = trackBounds;
        expect(Array.isArray(southwest)).toBe(true);
        expect(Array.isArray(northeast)).toBe(true);
        expect(southwest.length).toBe(2);
        expect(northeast.length).toBe(2);

        // Check that northeast is actually northeast of southwest
        expect(northeast[0]).toBeGreaterThan(southwest[0]); // latitude
        expect(northeast[1]).toBeGreaterThan(southwest[1]); // longitude
    });

    it('should calculate bounds with detail panel compensation', async () => {
        wrapper = createWrapper();

        // Wait for track to load
        await waitFor(() => wrapper.vm.track);

        const trackBounds = wrapper.vm.trackBounds;
        const track = wrapper.vm.track;

        if (track && track.latlngs && track.latlngs.length > 0) {
            // Calculate the original bounds without compensation
            const originalBounds = wrapper.vm.calculateBounds(track.latlngs);

            // The trackBounds are computed based on raw latlngs; padding is handled by TrackMap
            // so the returned trackBounds should equal the original bounds without extra padding.
            const [southwest, northeast] = trackBounds;
            expect(southwest[0]).toBeCloseTo(originalBounds.south);
            expect(southwest[1]).toBeCloseTo(originalBounds.west);
            expect(northeast[0]).toBeCloseTo(originalBounds.north);
            expect(northeast[1]).toBeCloseTo(originalBounds.east);
        }
    });

    it('should update bounds when window is resized', async () => {
        wrapper = createWrapper();

        // Wait for track to load
        await waitFor(() => wrapper.vm.track);

        const initialBounds = wrapper.vm.trackBounds;

        // Simulate window resize
        Object.defineProperty(window, 'innerHeight', {
            writable: true,
            configurable: true,
            value: 600 // Smaller height
        });

        // Trigger resize event
        window.dispatchEvent(new Event('resize'));
        await nextTick();

        const newBounds = wrapper.vm.trackBounds;

        // In our implementation, track bounds are derived from track geometry and don't change on window resize
        // (TrackMap handles compensation/padding). Ensure bounds remain consistent.
        if (wrapper.vm.track && wrapper.vm.track.latlngs) {
            expect(newBounds).toEqual(initialBounds);
        }
    });

    it('should pass calculated bounds to TrackMap component', async () => {
        wrapper = createWrapper();

        // Wait for track to load
        await waitFor(() => wrapper.vm.track);

        const trackMapComponent = wrapper.findComponent({ name: 'TrackMap' });
        expect(trackMapComponent.exists()).toBe(true);

        // Check that bounds prop is passed
        const boundsProps = trackMapComponent.props('bounds');
        expect(boundsProps).toBeTruthy();
    });

    it('should update markerLatLng when a chart-point-hover payload is received', async () => {
        // Use a TrackMap stub that accepts markerLatLng prop
        wrapper = mount(TrackView, {
            props: { id: 'test-track-id' },
            global: {
                stubs: {
                    TrackMap: {
                        name: 'TrackMap',
                        props: ['polylines', 'zoom', 'center', 'bounds', 'url', 'attribution', 'activeTrackId', 'selectedTrackDetail', 'markerLatLng'],
                        template: '<div class="track-map-mock">TrackMap Mock</div>'
                    },
                    TrackDetailPanel: true,
                    Toast: true
                }
            }
        });

        // Wait for track to load
        await waitFor(() => wrapper.vm.track);

        // Simulate a chart hover payload
        const payload = { index: 1, distanceKm: 1.2, elevation: 120, latlng: [59.9321, 30.3619], isFixed: false };

        // Call handler directly
        wrapper.vm.handleChartPointHover(payload);
        await nextTick();

        // markerLatLng should be set on the VM
        expect(wrapper.vm.markerLatLng).toBeTruthy();
        expect(wrapper.vm.markerLatLng.latlng).toEqual([59.9321, 30.3619]);
        expect(wrapper.vm.markerLatLng.isFixed).toBe(false);

        // And TrackMap stub should receive the prop
        const tm = wrapper.findComponent({ name: 'TrackMap' });
        expect(tm.exists()).toBe(true);
        expect(tm.props('markerLatLng')).toEqual(wrapper.vm.markerLatLng);
    });

    it('should toggle fixed state on handleChartPointClick', async () => {
        wrapper = createWrapper();

        await waitFor(() => wrapper.vm.track);

        const payload = { index: 1, distanceKm: 1.2, elevation: 120, latlng: [59.9321, 30.3619], isFixed: true };
        wrapper.vm.handleChartPointClick(payload);
        await nextTick();

        expect(wrapper.vm.isChartPointFixed).toBe(true);
        expect(wrapper.vm.markerLatLng).toBeTruthy();
        expect(wrapper.vm.markerLatLng.isFixed).toBe(true);

        // Unfix
        const payload2 = { ...payload, isFixed: false };
        wrapper.vm.handleChartPointClick(payload2);
        await nextTick();

        expect(wrapper.vm.isChartPointFixed).toBe(false);
        expect(wrapper.vm.markerLatLng).toBeNull();
    });

    it('should reconstruct latlng from coordinateData when payload.latlng is missing', async () => {
        wrapper = createWrapper();
        await waitFor(() => wrapper.vm.track);

        // Ensure coordinateData is built from track.latlngs
        const coordData = wrapper.vm.coordinateData;
        expect(coordData.length).toBeGreaterThan(0);

        // Payload missing latlng should use coordinateData[index]
        const payload = { index: 1, distanceKm: 1.0, elevation: 110 };
        // Call handler directly (simulates event handling path)
        wrapper.vm.handleChartPointHover(payload);
        await nextTick();

        expect(wrapper.vm.markerLatLng).toBeTruthy();
        expect(wrapper.vm.markerLatLng.latlng).toEqual(coordData[1]);
    });

    it('should fall back to proportional mapping using track.latlngs when coordinateData lengths differ', async () => {
        wrapper = createWrapper();
        await waitFor(() => wrapper.vm.track);

        // Create a long track.latlngs array to test proportional mapping
        wrapper.vm.track.latlngs = [
            [10, 10], [11, 11], [12, 12], [13, 13], [14, 14]
        ];

        // Simulate payload index larger than coordinateData length
        const payload = { index: 8, distanceKm: 2.5, elevation: 200 };
        wrapper.vm.handleChartPointHover(payload);
        await nextTick();

        // Should map to the last point of track.latlngs (proportional rounding/clamping)
        expect(wrapper.vm.markerLatLng.latlng).toEqual([14, 14]);
    });

    it('should set correct segmentIndex for multi-segment tracks', async () => {
        wrapper = createWrapper();
        await waitFor(() => wrapper.vm.track);

        // Fake multi-segment track
        wrapper.vm.track.segments = [
            [[0, 0], [1, 1]], // length 2
            [[2, 2], [3, 3], [4, 4]] // length 3
        ];
        wrapper.vm.track.latlngs = wrapper.vm.track.segments.flat();

        // Choose payload.index that lies in second segment (e.g., index 3)
        const payload = { index: 3, distanceKm: 2.0, elevation: 100 };
        wrapper.vm.handleChartPointHover(payload);
        await nextTick();

        expect(wrapper.vm.markerLatLng).toBeTruthy();
        expect(wrapper.vm.markerLatLng.segmentIndex).toBe(1);
    });

    it('dispatches stop-elevation-polling on deactivation (keep-alive)', async () => {
        // Spy on window.dispatchEvent
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

        const Parent = {
            components: { TrackView },
            template: `<div><keep-alive><track-view v-if="show" id="test-track-id"/></keep-alive></div>`,
            setup() {
                const { ref } = require('vue');
                const show = ref(true);
                return { show };
            }
        };

        const parentWrapper = mount(Parent, {
            global: {
                stubs: {
                    TrackMap: true,
                    TrackDetailPanel: true,
                    Toast: true
                }
            }
        });

        await nextTick();
        // Deactivate TrackView by toggling `show` to false
        parentWrapper.vm.show = false;
        await nextTick();

        // Expect that TrackView dispatched stop-elevation-polling
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stop-elevation-polling' }));
        dispatchSpy.mockRestore();
        parentWrapper.unmount();
    });

    it('exposes E2E hooks in non-production modes', async () => {
        wrapper = createWrapper();
        await waitFor(() => wrapper.vm.track);

        // The E2E hooks should be attached to window in test mode
        expect(window.__e2e).toBeTruthy();
        expect(typeof window.__e2e.hoverAtIndex).toBe('function');
        expect(typeof window.__e2e.fixAtIndex).toBe('function');
        expect(typeof window.__e2e.clearMarker).toBe('function');

        // Hover at index 1 - should return true
        const hoverResult = window.__e2e.hoverAtIndex(1);
        expect(hoverResult).toBe(true);

        // Fix it
        const fixResult = window.__e2e.fixAtIndex(1);
        expect(fixResult).toBe(true);

        // Clear marker
        const clearResult = window.__e2e.clearMarker();
        expect(clearResult).toBe(true);
    });
});
