import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorSummary from '../editor/TrackEditorInspectorSummary.vue';

describe('TrackEditorInspectorSummary', () => {
    it('renders summary values and emits loop actions', async () => {
        const wrapper = mount(TrackEditorInspectorSummary, {
            props: {
                totalDistanceKm: 12.34,
                estimatedTimeMinutes: 78,
                totalPoints: 24,
                segmentCount: 3,
                poiCount: 2,
            },
        });

        expect(wrapper.find('[data-testid="track-summary"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('12.34 km');
        expect(wrapper.text()).toContain('1 h 18 min');
        expect(wrapper.text()).toContain('24');
        expect(wrapper.text()).toContain('3');
        expect(wrapper.text()).toContain('2');

        await wrapper.find('[data-testid="loop-btn"]').trigger('click');
        await wrapper.find('[data-testid="loop-same-way-btn"]').trigger('click');
        await wrapper.find('[data-testid="loop-different-route-btn"]').trigger('click');

        expect(wrapper.emitted('closeLoop')).toHaveLength(1);
        expect(wrapper.emitted('closeLoopSameWay')).toHaveLength(1);
        expect(wrapper.emitted('closeLoopDifferentRoute')).toHaveLength(1);
    });
});
