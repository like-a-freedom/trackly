import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorFragmentTools from '../editor/TrackEditorInspectorFragmentTools.vue';

describe('TrackEditorInspectorFragmentTools', () => {
    it('renders fragment actions for a completed selection and emits commands', async () => {
        const wrapper = mount(TrackEditorInspectorFragmentTools, {
            props: {
                fragmentInfo: {
                    segIndex: 1,
                    points: 5,
                    complete: true,
                },
            },
        });

        expect(wrapper.find('[data-testid="fragment-section"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Segment 2');
        expect(wrapper.text()).toContain('Points: 5');

        await wrapper.find('[data-testid="fragment-clear-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-reroute-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-delete-connect-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-delete-split-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-reverse-btn"]').trigger('click');
        await wrapper.find('[data-testid="fragment-export-btn"]').trigger('click');

        expect(wrapper.emitted('clearFragment')).toHaveLength(1);
        expect(wrapper.emitted('rerouteFragment')).toHaveLength(1);
        expect(wrapper.emitted('deleteFragmentConnect')).toHaveLength(1);
        expect(wrapper.emitted('deleteFragmentSplit')).toHaveLength(1);
        expect(wrapper.emitted('reverseFragment')).toHaveLength(1);
        expect(wrapper.emitted('exportFragment')).toHaveLength(1);
    });
});
