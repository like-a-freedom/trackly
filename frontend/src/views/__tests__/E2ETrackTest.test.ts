// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// Mock TrackMap component before importing the view
vi.mock('../../components/TrackMap.vue', () => ({
    default: {
        name: 'TrackMap',
        template: '<div class="track-map-stub"></div>',
        props: ['polylines', 'bounds', 'zoom', 'center', 'markerLatLng', 'autoPanOnChartHover'],
    },
}));

import E2ETrackTest from '../E2ETrackTest.vue';

describe('E2ETrackTest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clean up window.__e2e
        if (window.__e2e) {
            delete window.__e2e;
        }
    });

    it('renders the test view', () => {
        const wrapper = mount(E2ETrackTest);
        expect(wrapper.find('h2').text()).toBe('Track E2E Test Route');
    });

    it('renders without errors', () => {
        const wrapper = mount(E2ETrackTest);
        expect(wrapper.exists()).toBe(true);
    });

    it('exposes E2E hooks in non-production mode', () => {
        mount(E2ETrackTest);

        // In test mode (not production), hooks should be exposed
        if (import.meta.env.MODE !== 'production') {
            expect(window.__e2e).toBeDefined();
            expect(typeof window.__e2e.hoverAtIndex).toBe('function');
            expect(typeof window.__e2e.setMarker).toBe('function');
            expect(typeof window.__e2e.clearMarker).toBe('function');
        }
    });
});
