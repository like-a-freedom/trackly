import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEndpoints from '../TrackEndpoints.vue';

// Mock vue-leaflet components to render slots
vi.mock('@vue-leaflet/vue-leaflet', () => ({
    LMarker: { name: 'LMarker', template: '<div class="mock-marker"><slot /></div>', emits: ['click'] },
    LIcon: { name: 'LIcon', template: '<div class="mock-icon"></div>' },
    LTooltip: { name: 'LTooltip', template: '<div class="mock-tooltip"><slot /></div>' }
}));

describe('TrackEndpoints', () => {
    let wrapper;

    beforeEach(() => {
        wrapper = null;
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
        vi.clearAllMocks();
    });

    it('renders start tooltip with formatted time when startTime is provided', () => {
        const props = {
            startPosition: [55.0, 37.0],
            endPosition: [55.1, 37.1],
            startTime: '2024-01-01T09:00:00Z',
            isLoop: false
        };
        wrapper = mount(TrackEndpoints, { props });

        expect(wrapper.find('.track-marker-tooltip__title').text()).toBe('Start');
        expect(wrapper.find('.track-marker-tooltip__subtitle').text()).toBeTruthy();
        expect(wrapper.text()).toContain('2024');
    });

    it('renders finish tooltip with formatted time when endTime is provided', () => {
        const props = {
            startPosition: [55.0, 37.0],
            endPosition: [55.1, 37.1],
            endTime: '2024-01-01T10:30:00Z',
            isLoop: false
        };
        wrapper = mount(TrackEndpoints, { props });

        // Find the Finish tooltip title and subtitle
        const titles = wrapper.findAll('.track-marker-tooltip__title');
        const subtitles = wrapper.findAll('.track-marker-tooltip__subtitle');
        // There should be a Finish marker in the DOM
        expect(titles.some(t => t.text() === 'Finish')).toBe(true);
        // Subtitle should be present and contain the year
        expect(subtitles.some(s => s.text().includes('2024'))).toBe(true);
    });

    it('renders both start and finish times when both props are provided', () => {
        const props = {
            startPosition: [55.0, 37.0],
            endPosition: [55.1, 37.1],
            startTime: '2024-01-01T09:00:00Z',
            endTime: '2024-01-01T10:30:00Z',
            isLoop: false
        };
        wrapper = mount(TrackEndpoints, { props });

        expect(wrapper.text()).toContain('Start');
        expect(wrapper.text()).toContain('Finish');
        expect(wrapper.text()).toContain('2024');
    });
});
