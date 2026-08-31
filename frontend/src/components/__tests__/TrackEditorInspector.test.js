import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspector from '../editor/TrackEditorInspector.vue';

describe('TrackEditorInspector', () => {
    it('stays context-driven and keeps poi tools reachable', async () => {
        const wrapper = mount(TrackEditorInspector, {
            props: {
                editorMode: 'fragment',
                poiMode: true,
                segmentStats: [
                    {
                        displayName: 'Day 1',
                        pointCount: 12,
                        distanceKm: 4.2,
                    },
                ],
                activeSegmentIndex: 0,
                fragmentInfo: {
                    segIndex: 0,
                    points: 3,
                    complete: true,
                },
                pois: [
                    {
                        name: 'Spring',
                        description: 'Fresh water',
                    },
                ],
            },
        });

        expect(wrapper.find('[data-testid="track-editor-inspector"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Fragment selection');
        expect(wrapper.text()).toContain('POI mode is active');
        expect(wrapper.text()).toContain('Day 1');
        expect(wrapper.find('[data-testid="poi-section"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-name-input"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="track-summary"]').exists()).toBe(false);

        await wrapper.find('[data-testid="poi-delete-btn"]').trigger('click');
        expect(wrapper.emitted('deletePoi')).toEqual([[0]]);
    });

    it('drops duplicate quick-help copy when the track is still empty', () => {
        const wrapper = mount(TrackEditorInspector, {
            props: {
                editorMode: 'edit',
                totalPoints: 0,
                segmentStats: [],
                pois: [],
            },
        });

        expect(wrapper.text()).not.toContain('Quick help');
        expect(wrapper.text()).not.toContain('Click the map to place points and use the bottom deck');
    });
});
