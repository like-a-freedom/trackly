import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorChartCard from '../editor/TrackEditorChartCard.vue';

const ElevationChartStub = {
    name: 'ElevationChart',
    props: ['elevationData', 'elevationStats', 'totalDistance', 'coordinateData', 'chartMode'],
    emits: ['chart-point-hover', 'chart-point-leave', 'chart-point-click'],
    template: '<div data-testid="elevation-chart-stub" @click="$emit(\'chart-point-click\', { index: 1 })" />',
};

describe('TrackEditorChartCard', () => {
    it('renders the elevation card and forwards chart interactions', async () => {
        const wrapper = mount(TrackEditorChartCard, {
            props: {
                elevationProfile: [{ distance: 0, elevation: 120 }],
                elevationStats: { minElevation: 120, maxElevation: 120 },
                totalDistanceKm: 3.4,
                coordinateData: [[50.45, 30.52]],
            },
            global: {
                stubs: {
                    ElevationChart: ElevationChartStub,
                },
            },
        });

        expect(wrapper.find('[data-testid="track-editor-chart-card"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Elevation profile');

        await wrapper.find('[data-testid="elevation-chart-stub"]').trigger('click');
        expect(wrapper.emitted('chart-point-click')).toEqual([[{ index: 1 }]]);
    });
});
