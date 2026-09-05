// @ts-nocheck - Complex types
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorOverview from '../editor/TrackEditorInspectorOverview.vue';

describe('TrackEditorInspectorOverview', () => {
    it('renders context banners and metadata controls and emits updates', async () => {
        const wrapper = mount(TrackEditorInspectorOverview, {
            props: {
                showDraftBanner: true,
                error: 'Something went wrong',
                totalPoints: 1,
                trackName: 'Morning walk',
                trackDescription: 'Easy route',
                trackCategories: ['hiking'],
            },
        });

        expect(wrapper.find('[data-testid="draft-banner"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="error-banner"]').text()).toContain('Something went wrong');
        expect(wrapper.find('[data-testid="editor-tips"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-name-input"]').element.value).toBe('Morning walk');
        expect(wrapper.find('[data-testid="track-desc-input"]').element.value).toBe('Easy route');
        expect(wrapper.find('[data-testid="category-chip-hiking"]').classes()).toContain('selected');

        await wrapper.find('[data-testid="track-name-input"]').setValue('Updated track');
        await wrapper.find('[data-testid="track-desc-input"]').setValue('Updated description');
        await wrapper.find('[data-testid="category-input-cycling"]').setValue(true);
        await wrapper.find('[data-testid="overview-restore-draft"]').trigger('click');
        await wrapper.find('[data-testid="overview-delete-draft"]').trigger('click');

        expect(wrapper.emitted('update:trackName')).toEqual([['Updated track']]);
        expect(wrapper.emitted('update:trackDescription')).toEqual([['Updated description']]);
        expect(wrapper.emitted('update:trackCategories')).toEqual([[['hiking', 'cycling']]]);
        expect(wrapper.emitted('restoreDraft')).toHaveLength(1);
        expect(wrapper.emitted('deleteDraft')).toHaveLength(1);
    });
});
