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

// Mock useMemoizedComputed
vi.mock('../../composables/useMemoization', () => ({
    useMemoizedComputed: (fn, deps, options) => {
        return {
            get value() {
                const depValues = deps.map(dep => dep());
                return fn(...depValues);
            }
        };
    },
    clearCacheByPattern: vi.fn()
}));

// Constant for panel close animation timeout
const PANEL_CLOSE_TIMEOUT = 350; // Slightly more than the 300ms CSS transition

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

describe('TrackDetailPanel uncommitted changes warning', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn();
        mockShowConfirm.mockClear();
        mockShowToast.mockClear();
    });

    it('should show warning when closing with uncommitted name changes', async () => {
        const track = makeTrack({ name: 'Original Name' });
        mockShowConfirm.mockResolvedValue(false); // user cancels

        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        // Start editing name
        wrapper.vm.isEditingName = true;
        wrapper.vm.editedName = 'Modified Name';
        await wrapper.vm.$nextTick();

        // Try to close the panel
        await wrapper.vm.handleClose();
        await wrapper.vm.$nextTick();

        // Verify confirmation dialog was shown
        expect(mockShowConfirm).toHaveBeenCalledWith({
            title: 'Uncommitted changes detected',
            message: 'You have unsaved changes. Closing the panel will discard these changes. Do you want to proceed?',
            confirmText: 'Proceed',
            cancelText: 'Cancel'
        });

        // Verify panel was NOT closed (user cancelled)
        expect(wrapper.emitted('close')).toBeFalsy();
    });

    it('should show warning when closing with uncommitted description changes', async () => {
        const track = makeTrack({ description: 'Original Description' });
        mockShowConfirm.mockResolvedValue(false); // user cancels

        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        // Start editing description
        wrapper.vm.isEditingDescription = true;
        wrapper.vm.editedDescription = 'Modified Description';
        await wrapper.vm.$nextTick();

        // Try to close the panel
        await wrapper.vm.handleClose();
        await wrapper.vm.$nextTick();

        // Verify confirmation dialog was shown
        expect(mockShowConfirm).toHaveBeenCalledWith({
            title: 'Uncommitted changes detected',
            message: 'You have unsaved changes. Closing the panel will discard these changes. Do you want to proceed?',
            confirmText: 'Proceed',
            cancelText: 'Cancel'
        });

        // Verify panel was NOT closed (user cancelled)
        expect(wrapper.emitted('close')).toBeFalsy();
    });

    it('should close panel when user confirms discarding uncommitted changes', async () => {
        const track = makeTrack({ name: 'Original Name' });
        mockShowConfirm.mockResolvedValue(true); // user confirms

        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        // Start editing name
        wrapper.vm.isEditingName = true;
        wrapper.vm.editedName = 'Modified Name';
        await wrapper.vm.$nextTick();

        // Try to close the panel
        await wrapper.vm.handleClose();
        await wrapper.vm.$nextTick();

        // Verify confirmation dialog was shown
        expect(mockShowConfirm).toHaveBeenCalledWith({
            title: 'Uncommitted changes detected',
            message: 'You have unsaved changes. Closing the panel will discard these changes. Do you want to proceed?',
            confirmText: 'Proceed',
            cancelText: 'Cancel'
        });

        // Wait for the closing animation timeout
        await new Promise(resolve => setTimeout(resolve, PANEL_CLOSE_TIMEOUT));

        // Verify panel was closed (user confirmed)
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('should not show warning when closing without any edits', async () => {
        const track = makeTrack();
        
        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        // Close the panel without editing anything
        await wrapper.vm.handleClose();
        await wrapper.vm.$nextTick();

        // Verify confirmation dialog was NOT shown
        expect(mockShowConfirm).not.toHaveBeenCalled();

        // Wait for the closing animation timeout
        await new Promise(resolve => setTimeout(resolve, PANEL_CLOSE_TIMEOUT));

        // Verify panel was closed
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('should not show warning when name is edited but unchanged', async () => {
        const track = makeTrack({ name: 'Original Name' });
        
        const wrapper = mount(TrackDetailPanel, {
            props: { track, isOwner: true, sessionId: '00000000-0000-0000-0000-000000000000' }
        });

        // Start editing name
        wrapper.vm.isEditingName = true;
        // Set the same name (no actual change)
        wrapper.vm.editedName = 'Original Name';
        await wrapper.vm.$nextTick();

        // Try to close the panel
        await wrapper.vm.handleClose();
        await wrapper.vm.$nextTick();

        // Verify confirmation dialog was NOT shown (no real changes)
        expect(mockShowConfirm).not.toHaveBeenCalled();

        // Wait for the closing animation timeout
        await new Promise(resolve => setTimeout(resolve, PANEL_CLOSE_TIMEOUT));

        // Verify panel was closed
        expect(wrapper.emitted('close')).toBeTruthy();
    });
});
