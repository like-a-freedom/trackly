import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorTrackActions from '../editor/TrackEditorInspectorTrackActions.vue';

describe('TrackEditorInspectorTrackActions', () => {
    it('renders track actions and emits duplicate/reverse commands', async () => {
        const wrapper = mount(TrackEditorInspectorTrackActions);

        expect(wrapper.find('[data-testid="track-actions"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="duplicate-track-btn"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="reverse-track-btn"]').exists()).toBe(true);

        await wrapper.find('[data-testid="duplicate-track-btn"]').trigger('click');
        await wrapper.find('[data-testid="reverse-track-btn"]').trigger('click');

        expect(wrapper.emitted('duplicateTrack')).toHaveLength(1);
        expect(wrapper.emitted('reverseTrack')).toHaveLength(1);
    });
});
