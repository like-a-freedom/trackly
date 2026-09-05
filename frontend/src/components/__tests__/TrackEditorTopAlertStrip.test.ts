import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorTopAlertStrip from '../editor/TrackEditorTopAlertStrip.vue';

describe('TrackEditorTopAlertStrip', () => {
    function createWrapper(props = {}) {
        return mount(TrackEditorTopAlertStrip, {
            props: {
                showDraftBanner: false,
                error: undefined,
                totalPoints: 0,
                ...props,
            },
        });
    }

    it('should render when totalPoints < 2', () => {
        const wrapper = createWrapper({ totalPoints: 0 });
        expect(wrapper.find('[data-testid="top-alert-strip"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-alert-tips"]').exists()).toBe(true);
    });

    it('should not render when totalPoints >= 2 and no error or draft', () => {
        const wrapper = createWrapper({ totalPoints: 2 });
        expect(wrapper.find('[data-testid="top-alert-strip"]').exists()).toBe(false);
    });

    it('should show draft banner when showDraftBanner is true', () => {
        const wrapper = createWrapper({ showDraftBanner: true, totalPoints: 5 });
        expect(wrapper.find('[data-testid="top-alert-draft"]').exists()).toBe(true);
    });

    it('should emit restoreDraft when restore button clicked', async () => {
        const wrapper = createWrapper({ showDraftBanner: true });
        await wrapper.find('[data-testid="top-alert-restore-draft"]').trigger('click');
        expect(wrapper.emitted('restoreDraft')).toBeTruthy();
    });

    it('should emit deleteDraft when delete button clicked', async () => {
        const wrapper = createWrapper({ showDraftBanner: true });
        await wrapper.find('[data-testid="top-alert-delete-draft"]').trigger('click');
        expect(wrapper.emitted('deleteDraft')).toBeTruthy();
    });

    it('should show error when error prop is set', () => {
        const wrapper = createWrapper({ error: 'Test error message', totalPoints: 5 });
        expect(wrapper.find('[data-testid="top-alert-error"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Test error message');
    });

    it('should show tips when totalPoints is 1', () => {
        const wrapper = createWrapper({ totalPoints: 1 });
        expect(wrapper.find('[data-testid="top-alert-tips"]').exists()).toBe(true);
    });

    it('should show draft banner when showDraftBanner is true even with tips', () => {
        const wrapper = createWrapper({ showDraftBanner: true, totalPoints: 0 });
        expect(wrapper.find('[data-testid="top-alert-draft"]').exists()).toBe(true);
        // Tips also show because totalPoints < 2
        expect(wrapper.find('[data-testid="top-alert-tips"]').exists()).toBe(true);
    });

    it('should show both error and tips when both conditions met', () => {
        const wrapper = createWrapper({ error: 'Error', totalPoints: 0 });
        expect(wrapper.find('[data-testid="top-alert-error"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-alert-tips"]').exists()).toBe(true);
    });
});
