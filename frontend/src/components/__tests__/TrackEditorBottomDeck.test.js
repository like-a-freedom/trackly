import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorBottomDeck from '../editor/TrackEditorBottomDeck.vue';

describe('TrackEditorBottomDeck', () => {
    it('renders heavy editing cards and forwards editing actions', async () => {
        const wrapper = mount(TrackEditorBottomDeck, {
            props: {
                trackName: 'Morning route',
                trackDescription: 'A scenic loop',
                trackCategories: ['hiking'],
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
                totalDistanceKm: 3.4,
                totalPoints: 8,
                estimatedTimeMinutes: 45,
                pois: [{ name: 'Shelter' }],
                fragmentInfo: {
                    segIndex: 0,
                    points: 4,
                    complete: true,
                },
            },
        });

        expect(wrapper.find('[data-testid="track-editor-bottom-deck"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-meta-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-segments-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-actions-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-chart-card"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('3.40 km');

        await wrapper.find('[data-testid="loop-same-way-btn"]').trigger('click');
        await wrapper.find('[data-testid="loop-different-route-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-export-btn"]').trigger('click');

        expect(wrapper.emitted('closeLoopSameWay')).toHaveLength(1);
        expect(wrapper.emitted('closeLoopDifferentRoute')).toHaveLength(1);
        expect(wrapper.emitted('exportFragment')).toHaveLength(1);
    });
});
