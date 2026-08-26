import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorSegmentsCard from '../editor/TrackEditorSegmentsCard.vue';

describe('TrackEditorSegmentsCard', () => {
    it('renders segments section and forwards actions', async () => {
        const wrapper = mount(TrackEditorSegmentsCard, {
            props: {
                segmentStats: [
                    {
                        name: '',
                        displayName: 'Day 1',
                        pointCount: 8,
                        distanceKm: 3.4,
                        color: '#1976d2',
                    },
                ],
                activeSegmentIndex: 0,
            },
        });

        expect(wrapper.find('[data-testid="track-editor-segments-card"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Segments');

        await wrapper.find('[data-testid="add-segment-btn"]').trigger('click');
        expect(wrapper.emitted('addSegment')).toHaveLength(1);
    });
});
