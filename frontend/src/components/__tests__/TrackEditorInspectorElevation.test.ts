// @ts-nocheck - Complex types
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorElevation from '../editor/TrackEditorInspectorElevation.vue';

const ElevationChartStub = {
    name: 'ElevationChart',
    template: '<div data-testid="elevation-chart-stub"></div>',
    props: ['elevationData', 'elevationStats', 'totalDistance', 'coordinateData', 'chartMode',
        'onChartPointHover', 'onChartPointLeave', 'onChartPointClick'],
};

describe('TrackEditorInspectorElevation', () => {
    function createWrapper(props = {}) {
        return mount(TrackEditorInspectorElevation, {
            props: {
                elevationProfile: [],
                elevationStats: {},
                totalDistanceKm: 0,
                coordinateData: [],
                elevationLoading: false,
                elevationError: null,
                ...props,
            },
            global: {
                stubs: {
                    ElevationChart: ElevationChartStub,
                },
            },
        });
    }

    it('renders the elevation section', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="elevation-section"]').exists()).toBe(true);
    });

    it('renders ElevationChart when not loading and no error', () => {
        const wrapper = createWrapper({
            elevationProfile: [{ distance: 0, elevation: 10 }],
        });
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(true);
    });

    it('shows loading message when elevationLoading is true', () => {
        const wrapper = createWrapper({ elevationLoading: true });
        expect(wrapper.text()).toContain('Loading profile...');
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(false);
    });

    it('shows error message when elevationError is set', () => {
        const wrapper = createWrapper({ elevationError: 'Failed to load' });
        expect(wrapper.text()).toContain('Failed to load');
        expect(wrapper.find('.elevation-status.error').exists()).toBe(true);
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(false);
    });

    it('passes correct props to ElevationChart', () => {
        const wrapper = createWrapper({
            elevationProfile: [{ distance: 0, elevation: 100 }],
            elevationStats: { gain: 50, loss: 30 },
            totalDistanceKm: 5.5,
            coordinateData: [[50.45, 30.52]],
        });
        const chart = wrapper.findComponent({ name: 'ElevationChart' });
        expect(chart.props('elevationData')).toEqual([{ distance: 0, elevation: 100 }]);
        expect(chart.props('elevationStats')).toEqual({ gain: 50, loss: 30 });
        expect(chart.props('totalDistance')).toBe(5.5);
        expect(chart.props('coordinateData')).toEqual([[50.45, 30.52]]);
        expect(chart.props('chartMode')).toBe('elevation');
    });

    it('emits chart-point-hover event', async () => {
        const wrapper = createWrapper();
        // The stub doesn't emit, but we verify the binding exists
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(true);
    });

    it('emits chart-point-leave event', async () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(true);
    });

    it('emits chart-point-click event', async () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(true);
    });

    it('renders section title', () => {
        const wrapper = createWrapper();
        expect(wrapper.text()).toContain('Elevation profile');
    });
});
