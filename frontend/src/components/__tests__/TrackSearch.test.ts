import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import TrackSearch from '../TrackSearch.vue';

describe('TrackSearch modal isolation', () => {
    it('makes background inert only while open and restores it on unmount', async () => {
        const background = document.createElement('button');
        const container = document.createElement('div');
        document.body.append(background, container);
        const wrapper = mount(TrackSearch, { attachTo: container, global: { plugins: [createPinia()] } });
        try {
            await wrapper.setProps({ isVisible: true });
            await nextTick();
            expect(background.hasAttribute('inert')).toBe(true);
            expect(wrapper.get('[role="dialog"]').element.closest('[inert]')).toBeNull();
            await wrapper.setProps({ isVisible: false });
            expect(background.hasAttribute('inert')).toBe(false);
            await wrapper.setProps({ isVisible: true });
            await nextTick();
            wrapper.unmount();
            expect(background.hasAttribute('inert')).toBe(false);
        } finally {
            wrapper.unmount();
            background.remove();
            container.remove();
        }
    });
});
