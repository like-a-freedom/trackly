import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorActionsCard from '../editor/TrackEditorActionsCard.vue';

describe('TrackEditorActionsCard', () => {
    it('groups track, loop, optimizer, and fragment actions', async () => {
        const wrapper = mount(TrackEditorActionsCard, {
            props: {
                totalDistanceKm: 3.4,
                estimatedTimeMinutes: 45,
                totalPoints: 8,
                segmentCount: 2,
                poiCount: 1,
                fragmentInfo: {
                    segIndex: 0,
                    points: 4,
                    complete: true,
                },
                optimizerPreview: {
                    segments: [[[50.45, 30.52], [50.46, 30.53]]],
                },
            },
        });

        expect(wrapper.find('[data-testid="track-editor-actions-card"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Track actions');
        expect(wrapper.text()).toContain('Fragment tools');
        expect(wrapper.text()).toContain('Track optimizer');
        expect(wrapper.text()).toContain('3.40 km');

        await wrapper.find('[data-testid="loop-same-way-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-export-btn"]').trigger('click');
        await wrapper.find('[data-testid="optimizer-apply-btn"]').trigger('click');

        expect(wrapper.emitted('closeLoopSameWay')).toHaveLength(1);
        expect(wrapper.emitted('exportFragment')).toHaveLength(1);
        expect(wrapper.emitted('applyOptimization')).toHaveLength(1);
    });
});
