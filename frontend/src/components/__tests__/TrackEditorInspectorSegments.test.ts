import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorSegments from '../editor/TrackEditorInspectorSegments.vue';

describe('TrackEditorInspectorSegments', () => {
    it('renders segment list and emits primary segment actions', async () => {
        const wrapper = mount(TrackEditorInspectorSegments, {
            props: {
                segmentStats: [
                    {
                        index: 0,
                        name: 'Day 1',
                        displayName: 'Day 1',
                        pointCount: 12,
                        distanceKm: 3.5,
                        color: '#1976D2',
                    },
                    {
                        index: 1,
                        name: 'Day 2',
                        displayName: 'Day 2',
                        pointCount: 9,
                        distanceKm: 2.25,
                        color: '#D32F2F',
                    },
                ],
                activeSegmentIndex: 1,
                highlightedSegmentIndex: 0,
            },
        });

        expect(wrapper.findAll('[data-testid="segment-item"]')).toHaveLength(2);
        expect(wrapper.findAll('[data-testid="segment-item"]')[0].classes()).toContain('highlighted');
        expect(wrapper.findAll('[data-testid="segment-item"]')[1].classes()).toContain('active');

        await wrapper.find('[data-testid="add-segment-btn"]').trigger('click');
        await wrapper.findAll('[data-testid="segment-item"]')[0].trigger('click');
        await wrapper.findAll('.segment-name-input')[0].setValue('Updated day');
        await wrapper.findAll('.segment-color-input')[0].setValue('#ffffff');
        await wrapper.find('[data-testid="join-segment-btn"]').trigger('click');
        await wrapper.findAll('[data-testid="new-track-from-segment-btn"]')[0].trigger('click');

        expect(wrapper.emitted('addSegment')).toHaveLength(1);
        expect(wrapper.emitted('setActiveSegment')).toEqual([[0]]);
        expect(wrapper.emitted('updateSegmentName')).toEqual([[0, 'Updated day']]);
        expect(wrapper.emitted('updateSegmentColor')).toEqual([[0, '#ffffff']]);
        expect(wrapper.emitted('joinSegments')).toEqual([[0, 1]]);
        expect(wrapper.emitted('newTrackFromSegment')).toEqual([[0]]);
    });
});
