import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CategoriesPanel from '../CategoriesPanel.vue';

vi.mock('@vueform/multiselect', () => ({
    default: {
        name: 'Multiselect',
        template: '<select><slot /></select>',
        props: ['modelValue', 'mode', 'options', 'disabled'],
        emits: ['change', 'update:modelValue'],
    },
}));

vi.mock('@vueform/multiselect/themes/default.css', () => ({}));

describe('CategoriesPanel', () => {
    let props;

    beforeEach(() => {
        props = {
            track: {
                id: 't1',
                categories: ['hiking', 'running'],
            },
            isOwner: false,
            categoriesList: [
                { value: 'hiking', label: 'Hiking' },
                { value: 'running', label: 'Running' },
            ],
        };
    });

    it('renders nothing when no categories and not owner', () => {
        const wrapper = mount(CategoriesPanel, {
            props: { ...props, track: { id: 't1', categories: [] } },
        });
        expect(wrapper.find('.stats-section').exists()).toBe(false);
    });

    it('renders categories for non-owner', () => {
        const wrapper = mount(CategoriesPanel, { props });
        expect(wrapper.find('.stats-section').exists()).toBe(true);
        expect(wrapper.text()).toContain('Hiking');
        expect(wrapper.text()).toContain('Running');
    });

    it('renders multiselect for owner', () => {
        const wrapper = mount(CategoriesPanel, {
            props: { ...props, isOwner: true },
        });
        expect(wrapper.find('.categories-inline-edit').exists()).toBe(true);
    });

    it('emits categories-updated event', async () => {
        const wrapper = mount(CategoriesPanel, {
            props: { ...props, isOwner: true },
        });
        await wrapper.vm.onCategoriesChange([{ value: 'hiking', label: 'Hiking' }]);
        expect(wrapper.emitted('categories-updated')).toBeTruthy();
        expect(wrapper.emitted('categories-updated')[0]).toEqual([['hiking']]);
    });

    it('formats category names', () => {
        const wrapper = mount(CategoriesPanel, { props });
        expect(wrapper.vm.formatCategory('hiking')).toBe('Hiking');
        expect(wrapper.vm.formatCategory('')).toBe('');
        expect(wrapper.vm.formatCategory(null)).toBe('');
    });
});
