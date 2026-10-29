// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
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
    it('keeps pending until confirmation and retains edits after a failed save', async () => {
        let rejectSave: (error: Error) => void;
        const saveCategories = vi.fn(() => new Promise<void>((_, reject) => { rejectSave = reject; }));
        const wrapper = mount(CategoriesPanel, {props: {track:{id:'t1',categories:['hiking']},isOwner:true,saveCategories}});
        await wrapper.get('button[aria-label="Edit categories"]').trigger('click');
        await wrapper.get('input[value="walking"]').setValue(true);
        await wrapper.get('button[data-testid="save-categories"]').trigger('click');
        expect(saveCategories).toHaveBeenCalledWith(['hiking','walking']);
        expect(wrapper.get('button[data-testid="save-categories"]').attributes('disabled')).toBeDefined();
        rejectSave!(new Error('Could not save categories. Retry.'));
        await flushPromises();
        expect(wrapper.get('[role="alert"]').text()).toContain('Try again');
        expect((wrapper.get('input[value="walking"]').element as HTMLInputElement).checked).toBe(true);
    });
    let props: {
        track: { id: string; categories: string[] };
        isOwner: boolean;
        categoriesList: { value: string; label: string }[];
    };

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

    it('shows compact view and explicit editing for owner', () => {
        const wrapper = mount(CategoriesPanel, {
            props: { ...props, isOwner: true },
        });
        expect(wrapper.find('input').exists()).toBe(false);
        expect(wrapper.find('button[aria-label="Edit categories"]').exists()).toBe(true);
    });

    it('emits categories-updated event', async () => {
        const wrapper = mount(CategoriesPanel, {
            props: { ...props, isOwner: true },
        });
        await wrapper.get('button[aria-label="Edit categories"]').trigger('click');
        await wrapper.get('input[value="running"]').setValue(false);
        await wrapper.get('button[data-testid="save-categories"]').trigger('click');
        await flushPromises();
        expect(wrapper.emitted('categories-updated')).toBeTruthy();
        expect(wrapper.emitted('categories-updated')[0]).toEqual([['hiking']]);
    });

    it('formats category names', () => {
        const wrapper = mount(CategoriesPanel, { props });
        expect(wrapper.text()).toContain('Hiking');
        expect(wrapper.text()).toContain('Running');
    });
});

it('discards unsaved edits on cancel', async () => {
    const save = vi.fn();
    const wrapper = mount(CategoriesPanel, {props:{track:{categories:['hiking']},isOwner:true,saveCategories:save}});
    await wrapper.get('[aria-label="Edit categories"]').trigger('click');
    await wrapper.get('input[value="walking"]').setValue(true);
    await wrapper.findAll('button').find(button => button.text() === 'Cancel')!.trigger('click');
    expect(wrapper.findAll('.track-tag').map(tag => tag.text())).toEqual(['Hiking']);
    expect(save).not.toHaveBeenCalled();
});
