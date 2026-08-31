import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorElevation from '../editor/TrackEditorInspectorElevation.vue';

describe('TrackEditorInspectorElevation', () => {
    it('renders ElevationChart when ready and emits chart interactions', async () => {
        const wrapper = mount(TrackEditorInspectorElevation, {
            props: {
                elevationProfile: [{ distance: 0, elevation: 10 }],
                elevationStats: { gain: 120 },
                totalDistanceKm: 4.2,
                coordinateData: [[10, 20]],
                elevationLoading: false,
                elevationError: null,
            },
            global: {
                stubs: {
                    ElevationChart: {
                        template: '<button data-testid="elevation-chart-stub" @click="$emit(\'chart-point-click\', { index: 0 })" />',
                    },
                },
            },
        });

        expect(wrapper.find('[data-testid="elevation-section"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="elevation-chart-stub"]').exists()).toBe(true);

        await wrapper.find('[data-testid="elevation-chart-stub"]').trigger('click');

        expect(wrapper.emitted('chart-point-click')).toEqual([[{ index: 0 }]]);
    });
});
