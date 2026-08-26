import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorMetaCard from '../editor/TrackEditorMetaCard.vue';

describe('TrackEditorMetaCard', () => {
    it('renders metadata fields and forwards updates', async () => {
        const wrapper = mount(TrackEditorMetaCard, {
            props: {
                trackName: 'Morning route',
                trackDescription: 'A scenic loop',
                trackCategories: ['hiking'],
                totalPoints: 8,
            },
        });

        expect(wrapper.find('[data-testid="track-editor-meta-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-name-input"]').element.value).toBe('Morning route');
        expect(wrapper.text()).toContain('Track metadata');

        await wrapper.find('[data-testid="track-name-input"]').setValue('Evening route');
        expect(wrapper.emitted('update:trackName')).toEqual([['Evening route']]);
    });
});
