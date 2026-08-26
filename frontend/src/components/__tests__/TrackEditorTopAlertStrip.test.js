import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorTopAlertStrip from '../editor/TrackEditorTopAlertStrip.vue';

describe('TrackEditorTopAlertStrip', () => {
    it('renders editor-wide alerts and emits draft actions', async () => {
        const wrapper = mount(TrackEditorTopAlertStrip, {
            props: {
                showDraftBanner: true,
                error: 'Save failed',
                totalPoints: 1,
            },
        });

        expect(wrapper.find('[data-testid="top-alert-strip"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-alert-draft"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-alert-error"]').text()).toContain('Save failed');
        expect(wrapper.find('[data-testid="top-alert-tips"]').text()).toContain('Ctrl+Z/Y');

        await wrapper.find('[data-testid="top-alert-restore-draft"]').trigger('click');
        await wrapper.find('[data-testid="top-alert-delete-draft"]').trigger('click');

        expect(wrapper.emitted('restoreDraft')).toHaveLength(1);
        expect(wrapper.emitted('deleteDraft')).toHaveLength(1);
    });
});
