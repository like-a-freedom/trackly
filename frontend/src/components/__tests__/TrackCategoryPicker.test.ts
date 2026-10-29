import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackCategoryPicker from '../TrackCategoryPicker.vue';

describe('Track categories', () => {
    it('preserves custom values while toggling supported categories', async () => {
        const wrapper = mount(TrackCategoryPicker, { props: { modelValue: ['Мой маршрут'] } });
        await wrapper.get('input[value="walking"]').setValue(true);
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['Мой маршрут', 'walking']]);
    });
    it('offers only the fixed categories without custom creation controls', () => {
        const wrapper = mount(TrackCategoryPicker, { props: { modelValue: [] } });
        expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(6);
        expect(wrapper.find('input[type="text"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="add-category"]').exists()).toBe(false);
    });
    it('allows removing the last supported category', async () => {
        const wrapper = mount(TrackCategoryPicker, { props: { modelValue: ['walking'] } });
        await wrapper.get('input[value="walking"]').setValue(false);
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]]);
    });
});
