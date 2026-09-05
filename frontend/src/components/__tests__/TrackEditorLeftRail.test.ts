// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorLeftRail from '../editor/TrackEditorLeftRail.vue';

describe('TrackEditorLeftRail', () => {
    it('renders primary mode controls plus undo redo and poi toggle', async () => {
        const wrapper = mount(TrackEditorLeftRail, {
            props: {
                mode: 'edit',
                canUndo: true,
                canRedo: false,
                poiMode: false,
            },
        });

        expect(wrapper.find('[data-testid="left-rail-mode-view"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-mode-edit"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-mode-fragment"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-mode-routing"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-mode-trace"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-mode-edit"]').attributes('aria-pressed')).toBe('true');
        expect(wrapper.find('[data-testid="left-rail-undo"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-redo"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-poi-toggle"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="left-rail-redo"]').attributes('disabled')).toBeDefined();
        expect(wrapper.find('[data-testid="left-rail-poi-toggle"]').attributes('aria-pressed')).toBe('false');

        await wrapper.find('[data-testid="left-rail-mode-routing"]').trigger('click');
        await wrapper.find('[data-testid="left-rail-undo"]').trigger('click');
        await wrapper.find('[data-testid="left-rail-poi-toggle"]').trigger('click');

        expect(wrapper.emitted('setMode')).toEqual([['routing']]);
        expect(wrapper.emitted('undo')).toHaveLength(1);
        expect(wrapper.emitted('togglePoiMode')).toHaveLength(1);
    });
});
