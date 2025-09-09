import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackDetailPanel from '../TrackDetailPanel.vue';

// Mock the useToast composable
const mockShowToast = vi.fn();
vi.mock('../../composables/useToast', () => ({
    useToast: () => ({
        showToast: mockShowToast
    })
}));

// Mock the useConfirm composable
const mockShowConfirm = vi.fn();
vi.mock('../../composables/useConfirm', () => ({
    useConfirm: () => ({
        showConfirm: mockShowConfirm
    })
}));

// Helper to build a minimal track object
function makeTrack(overrides = {}) {
    return Object.assign({
        id: 'track-1',
        name: 'Sample Track',
        description: 'Desc',
        categories: [],
        auto_classifications: [],
        elevation_profile: null,
        hr_data: null,
        temp_data: null,
        time_data: null,
        length_km: 1.23,
        elevation_up: null,
        elevation_down: null,
        avg_speed: null,
        avg_hr: null,
        hr_min: null,
        hr_max: null,
        moving_time: null,
        pause_time: null,
        moving_avg_speed: null,
        moving_avg_pace: null,
        duration_seconds: null,
        recorded_at: null,
        created_at: null,
        updated_at: null,
        session_id: null,
    }, overrides);
}

describe('TrackDetailPanel delete behaviour', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn();
        mockShowConfirm.mockResolvedValue(true); // default confirm OK
        mockShowToast.mockClear();
    });

    it('emits deleted + close and dispatches global event on successful delete', async () => {
        const track = makeTrack();
        // Mock fetch DELETE success
        fetch.mockResolvedValueOnce({ status: 204, ok: true });

        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        // Spy on global event dispatch
        const eventSpy = vi.fn();
        window.addEventListener('track-deleted', eventSpy);

        const btn = wrapper.find('.delete-track-btn');
        expect(btn.exists()).toBe(true);
        await btn.trigger('click');

        // Wait microtask for async delete
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        // Component emits
        expect(wrapper.emitted('deleted')).toBeTruthy();
        expect(wrapper.emitted('close')).toBeTruthy();

        // Global event dispatched
        expect(eventSpy).toHaveBeenCalledTimes(1);
        const evt = eventSpy.mock.calls[0][0];
        expect(evt).toBeInstanceOf(CustomEvent);
        expect(evt.detail.id).toBe(track.id);
    });

    it('does not emit deleted if user cancels confirmation', async () => {
        const track = makeTrack();
        mockShowConfirm.mockResolvedValue(false); // user cancels

        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        const btn = wrapper.find('.delete-track-btn');
        await btn.trigger('click');
        await Promise.resolve();

        expect(fetch).not.toHaveBeenCalled();
        expect(wrapper.emitted('deleted')).toBeFalsy();
        expect(wrapper.emitted('close')).toBeFalsy();
    });

    it('shows toast on non-204 failure and does not emit deleted', async () => {
        const track = makeTrack();
        fetch.mockResolvedValueOnce({ status: 500, ok: false });

        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        const btn = wrapper.find('.delete-track-btn');
        await btn.trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(mockShowToast).toHaveBeenCalledWith(
            'Failed to delete track.',
            'error'
        );
        expect(wrapper.emitted('deleted')).toBeFalsy();
    });
});
