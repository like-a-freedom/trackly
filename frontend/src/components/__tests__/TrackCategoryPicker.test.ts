import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackCategoryPicker from '../TrackCategoryPicker.vue';

describe('Track categories', () => {
    it('preserves custom values while toggling supported categories', async () => {
        const wrapper = mount(TrackCategoryPicker, { props: { modelValue: ['Мой маршрут'] } });
        await wrapper.get('input[value="walking"]').setValue(true);
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['Мой маршрут', 'walking']]);
    });
    it('explains byte limits before sending a custom category', async () => {
        const wrapper = mount(TrackCategoryPicker, { props: { modelValue: [] } });
        await wrapper.get('input[type="text"]').setValue('я'.repeat(51));
        await wrapper.get('[data-testid="add-category"]').trigger('click');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.get('[role="alert"]').text()).toContain('100 UTF-8 bytes');
    });
    it('allows removing the last category and retains custom spelling', async () => {
        const wrapper = mount(TrackCategoryPicker, { props: { modelValue: ['Trail Run'] } });
        await wrapper.get('button[aria-label="Remove category Trail Run"]').trigger('click');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]]);
    });
});
