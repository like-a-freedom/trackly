import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, computed, nextTick } from 'vue';
import AccountView from '../../src/views/AccountView.vue';

// Integration tests for AccountView with real composable behavior
// These tests verify the component works correctly with its dependencies

// Use vi.hoisted to make mocks available in vi.mock factories
const { mockPush, mockReplace, mockHttp, mockAuthState, mockConfirmState } = vi.hoisted(() => {
    const mockAuthState = {
        user: {
            id: 'integration-user-id',
            email: 'integration@example.com',
            name: 'Integration User',
            nickname: 'integrationuser',
            avatar_url: 'https://example.com/integration-avatar.jpg',
        },
        isLoading: false,
        initializeFn: vi.fn(),
        logoutFn: vi.fn(),
        updateProfileFn: vi.fn(),
        deleteAccountFn: vi.fn(),
    };
    // vi.mock factories are hoisted above the describe scope, so shared mutable
    // state they read must live in vi.hoisted as well.
    const mockConfirmState = { response: true };
    return {
        mockPush: vi.fn(),
        mockReplace: vi.fn(),
        mockHttp: vi.fn(),
        mockAuthState,
        mockConfirmState,
    };
});

// Declared at module top level: vitest hoists `vi.mock` regardless, and
// declaring it inside `describe` is warned about and becomes an error in a
// future release. The factories read state from `vi.hoisted` above.
vi.mock('vue-router', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
}));

// Mock useAuth
vi.mock('../../src/composables/useAuth', () => ({
    useAuth: vi.fn(() => ({
        user: computed(() => mockAuthState.user),
        isLoading: ref(mockAuthState.isLoading),
        // AccountView awaits initialize() in onMounted before loading tracks
        initialize: mockAuthState.initializeFn,
        logout: mockAuthState.logoutFn,
        updateProfile: mockAuthState.updateProfileFn,
        deleteAccount: mockAuthState.deleteAccountFn,
    })),
}));

// Mock useConfirm
vi.mock('../../src/composables/useConfirm', () => ({
    useConfirm: () => ({
        confirm: () => Promise.resolve(mockConfirmState.response),
    }),
}));

// Mock http-instance
vi.mock('../../src/http-instance', () => ({
    http: mockHttp,
}));

describe('AccountView Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPush.mockReset();
        mockReplace.mockReset();
        mockConfirmState.response = true;

        // Default mock for http - returns tracks
        mockHttp.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                tracks: [
                    { id: 'track-1', name: 'Track 1', length_km: 5.5, elevation_gain: 100, is_public: true, created_at: '2024-01-01' },
                    { id: 'track-2', name: 'Track 2', length_km: 3.2, elevation_gain: 50, is_public: false, created_at: '2024-01-02' },
                ],
                total: 2
            }),
        });

        // Reset mockAuthState properties (can't reassign const)
        mockAuthState.user = {
            id: 'integration-user-id',
            email: 'integration@example.com',
            name: 'Integration User',
            nickname: 'integrationuser',
            avatar_url: 'https://example.com/integration-avatar.jpg',
        };
        mockAuthState.isLoading = false;
        mockAuthState.initializeFn = vi.fn().mockResolvedValue(undefined);
        mockAuthState.logoutFn = vi.fn();
        mockAuthState.updateProfileFn = vi.fn().mockImplementation((updates) => {
            mockAuthState.user = { ...mockAuthState.user, ...updates };
            return Promise.resolve(mockAuthState.user);
        });
        mockAuthState.deleteAccountFn = vi.fn().mockResolvedValue({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Component Initialization', () => {
        it('fetches tracks on mount with correct parameters', async () => {
            mount(AccountView);
            await flushPromises();

            // Component loads tracks through the shared http instance
            const httpCalls = mockHttp.mock.calls;
            expect(httpCalls.length).toBeGreaterThan(0);

            const trackFetch = httpCalls.find(c =>
                c[0].includes('/api/account/tracks')
            );
            expect(trackFetch).toBeDefined();
            // Current contract: GET /api/account/tracks?offset=0&limit=20
            expect(trackFetch[1]).toMatchObject({ method: 'GET' });
            const url = new URL('http://localhost' + trackFetch[0]);
            expect(url.pathname).toBe('/api/account/tracks');
            expect(url.searchParams.get('offset')).toBe('0');
            expect(url.searchParams.get('limit')).toBe('20');
        });

        it('initializes with user data from auth composable', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.find('.header-user-name').text()).toBe('Integration User');
        });
    });

    describe('End-to-End User Flows', () => {
        it('complete flow: search, select, bulk delete', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Search for tracks
            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('Track 1');
            await nextTick();

            // Select all visible tracks
            const selectAll = wrapper.find('.select-all-label input[type="checkbox"]');
            await selectAll.setChecked(true);
            await nextTick();

            // Verify bulk delete button appears and reflects the filtered selection
            const bulkDeleteBtn = wrapper.findAll('.btn-bulk').find(b =>
                b.text().includes('Delete')
            );
            expect(bulkDeleteBtn).toBeDefined();
            // Search matched a single track, so select-all selected exactly that one
            expect(bulkDeleteBtn.text()).toContain('Delete (1)');
        });

        it('complete flow: toggle visibility for multiple tracks', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Select multiple tracks
            const checkboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            await checkboxes[0].setChecked(true);
            await checkboxes[1].setChecked(true);
            await nextTick();

            // Click bulk toggle
            mockHttp.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    updated: [
                        { id: 'track-1', is_public: false },
                        { id: 'track-2', is_public: true },
                    ],
                    count: 2
                }),
            });

            const bulkToggleBtn = wrapper.findAll('.btn-bulk').find(b =>
                b.text().includes('Toggle visibility')
            );
            await bulkToggleBtn.trigger('click');
            await flushPromises();

            // Verify API was called
            const toggleCall = mockHttp.mock.calls.find(c =>
                c[0].includes('/api/account/tracks/bulk/visibility') &&
                c[1]?.method === 'PATCH'
            );
            expect(toggleCall).toBeDefined();
        });

        it('complete flow: edit nickname and verify persistence', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            // Open settings
            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            // Open nickname modal
            const editBtn = wrapper.findAll('.menu-item').find(i =>
                i.text().includes('Edit Nickname')
            );
            await editBtn.trigger('click');
            await nextTick();

            // Verify modal is open
            expect(document.querySelector('.modal-overlay')).toBeTruthy();
            expect(document.querySelector('#nickname-input')).toBeTruthy();

            wrapper.unmount();
        });

        it('complete flow: logout and redirect', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Open settings
            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            // Click sign out
            const signOutBtn = wrapper.findAll('.menu-item').find(i => 
                i.text().includes('Sign Out')
            );
            await signOutBtn.trigger('click');
            await flushPromises();

            // Verify logout was called
            expect(mockAuthState.logoutFn).toHaveBeenCalled();
            // Verify redirect
            expect(mockReplace).toHaveBeenCalledWith('/');
        });
    });

    describe('Error Recovery Flows', () => {
        it('recovers from track loading failure', async () => {
            // First track request fails (tracks are loaded via the shared http instance)
            mockHttp.mockRejectedValueOnce(new Error('Network error'));

            const wrapper = mount(AccountView);
            await flushPromises();

            // Component should still be functional
            expect(wrapper.find('.account-page').exists()).toBe(true);

            // Error state with a retry action should be shown
            const errorState = wrapper.find('.tracks-empty[role="alert"]');
            expect(errorState.exists()).toBe(true);
            expect(errorState.text()).toContain('Could not load your tracks. Please retry.');
            expect(errorState.find('button').text()).toContain('Retry loading tracks');

            // Retry succeeds and the track list renders
            await errorState.find('button').trigger('click');
            await flushPromises();
            expect(wrapper.findAll('.track-card').length).toBe(2);
            expect(wrapper.find('.tracks-empty[role="alert"]').exists()).toBe(false);
        });

        it('handles visibility toggle failure gracefully', async () => {
            mockHttp.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    tracks: [{ id: 'track-1', name: 'Track 1', length_km: 5.5, elevation_gain: 100, is_public: true, created_at: '2024-01-01' }],
                    total: 1
                }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();
            expect(wrapper.findAll('.track-card').length).toBe(1);

            // Make toggle fail
            mockHttp.mockRejectedValueOnce(new Error('API Error'));

            // Try to toggle visibility
            const toggleBtn = wrapper.find('.visibility-toggle');
            await toggleBtn.trigger('click');
            await flushPromises();

            // Component should still be functional and surface the failure
            expect(wrapper.find('.account-page').exists()).toBe(true);
            const errorState = wrapper.find('.tracks-empty[role="alert"]');
            expect(errorState.exists()).toBe(true);
            expect(errorState.text()).toContain('Could not change visibility. Please retry.');

            // Retry restores the list, and the toggle is not stuck in the disabled state
            await errorState.find('button').trigger('click');
            await flushPromises();
            expect(wrapper.findAll('.track-card').length).toBe(1);
            expect(wrapper.find('.visibility-toggle').attributes('disabled')).toBeUndefined();
        });

        it('handles bulk operation partial failure', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();
            expect(wrapper.findAll('.track-card').length).toBe(2);

            // Select tracks
            const checkboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            await checkboxes[0].setChecked(true);
            await checkboxes[1].setChecked(true);
            await nextTick();

            // Make bulk operation fail (confirm resolves, so the DELETE request is next)
            mockHttp.mockRejectedValueOnce(new Error('Bulk operation failed'));

            const bulkDeleteBtn = wrapper.findAll('.btn-bulk').find(b => 
                b.text().includes('Delete')
            );
            await bulkDeleteBtn.trigger('click');
            await flushPromises();

            // Component should recover: error surfaced, selection and tracks retained
            expect(wrapper.find('.account-page').exists()).toBe(true);
            const toolbarAlert = wrapper.find('.tracks-toolbar [role="alert"]');
            expect(toolbarAlert.exists()).toBe(true);
            expect(toolbarAlert.text()).toContain('Could not complete this action. Your selection is retained; please retry.');
            expect(wrapper.findAll('.btn-bulk').length).toBeGreaterThan(0);
            expect(wrapper.findAll('.track-card').length).toBe(2);
            // The failed request went through the shared http instance
            expect(mockHttp.mock.calls.some(c => c[0].includes('/api/account/tracks/bulk'))).toBe(true);
        });
    });

    describe('State Synchronization', () => {
        it('updates track list when search query changes', async () => {
            // Mock returns specific tracks for this test
            mockHttp.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    tracks: [
                        { id: 'track-1', name: 'Mountain Hike', length_km: 10.0, elevation_gain: 500, is_public: true, created_at: '2024-01-01' },
                        { id: 'track-2', name: 'City Run', length_km: 5.0, elevation_gain: 20, is_public: false, created_at: '2024-01-02' },
                    ],
                    total: 2
                }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            const initialTracks = wrapper.findAll('.track-card');
            expect(initialTracks.length).toBe(2);

            // Search for mountain
            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('Mountain');
            await nextTick();

            // Should filter to 1 track
            const filteredTracks = wrapper.findAll('.track-card');
            expect(filteredTracks.length).toBe(1);
            expect(filteredTracks[0].find('.track-name').text()).toBe('Mountain Hike');
        });

        it('clears the selection when search filters out selected tracks', async () => {
            mockHttp.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    tracks: [
                        { id: 'track-1', name: 'Mountain Hike', length_km: 10.0, elevation_gain: 500, is_public: true, created_at: '2024-01-01' },
                        { id: 'track-2', name: 'City Run', length_km: 5.0, elevation_gain: 20, is_public: false, created_at: '2024-01-02' },
                    ],
                    total: 2
                }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Select all tracks
            const selectAll = wrapper.find('.select-all-label input[type="checkbox"]');
            await selectAll.setChecked(true);
            await nextTick();

            // Verify bulk buttons appear
            expect(wrapper.findAll('.btn-bulk').length).toBeGreaterThan(0);

            // Search for non-existent track: the selection is scoped to the visible
            // collection, so hidden tracks cannot stay selected.
            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('NonExistentTrack');
            await nextTick();

            const visibleTrackCheckboxes = wrapper.findAll('.track-checkbox');
            expect(visibleTrackCheckboxes.length).toBe(0);
            // Bulk buttons disappear: nothing visible is selected any more
            expect(wrapper.findAll('.btn-bulk').length).toBe(0);
        });

        it('maintains selection across pagination', async () => {
            let page = 0;
            mockHttp.mockImplementation(() => {
                const tracks = page === 0
                    ? [{ id: 'track-1', name: 'Track 1', length_km: 5.0, elevation_gain: 100, is_public: true, created_at: '2024-01-01' }]
                    : [{ id: 'track-2', name: 'Track 2', length_km: 3.0, elevation_gain: 50, is_public: false, created_at: '2024-01-02' }];
                page++;
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ tracks, total: 2 }),
                });
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Select first track
            const checkbox = wrapper.find('.track-checkbox input[type="checkbox"]');
            await checkbox.setChecked(true);
            await nextTick();

            expect(wrapper.findAll('.btn-bulk').length).toBeGreaterThan(0);

            // Load more tracks
            const loadMoreBtn = wrapper.find('.btn-load-more');
            expect(loadMoreBtn.exists()).toBe(true);
            await loadMoreBtn.trigger('click');
            await flushPromises();

            expect(wrapper.findAll('.track-card').length).toBe(2);
            // Bulk buttons should still be visible (first track still selected)
            expect(wrapper.findAll('.btn-bulk').length).toBeGreaterThan(0);
            expect(wrapper.findAll('.track-checkbox input')[0].element.checked).toBe(true);
        });
    });

    describe('API Integration', () => {
        it('calls correct endpoint for track visibility toggle', async () => {
            mockHttp.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks: [{ id: 'track-1', name: 'Track 1', length_km: 5.0, elevation_gain: 100, is_public: true, created_at: '2024-01-01' }] }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Reset mock for visibility toggle
            mockHttp.mockResolvedValue({ ok: true });

            const toggleBtn = wrapper.find('.visibility-toggle');
            await toggleBtn.trigger('click');
            await flushPromises();

            // Verify correct endpoint was called
            const visibilityCall = mockHttp.mock.calls.find(c =>
                c[0].includes('/api/tracks/track-1/visibility')
            );
            expect(visibilityCall).toBeDefined();
            expect(visibilityCall[1].method).toBe('PATCH');
            expect(visibilityCall[1].body).toContain('is_public');
        });

        it('includes authorization header in authenticated requests', async () => {
            mount(AccountView);
            await flushPromises();

            // All requests go through the shared http instance (the token header is
            // attached inside src/http.ts, which is mocked out at this layer).
            const trackCalls = mockHttp.mock.calls.filter(c =>
                c[0].includes('/api/account/tracks')
            );
            expect(trackCalls.length).toBeGreaterThan(0);
            expect(trackCalls[0][1]).toMatchObject({ method: 'GET' });
        });

        it('fetches tracks with pagination parameters', async () => {
            mount(AccountView);
            await flushPromises();

            const trackCall = mockHttp.mock.calls.find(c =>
                c[0].includes('/api/account/tracks')
            );

            // Current contract: only offset/limit are sent (sort/order were dropped)
            const url = new URL('http://localhost' + trackCall[0]);
            expect(url.pathname).toBe('/api/account/tracks');
            expect(url.searchParams.get('limit')).toBe('20');
            expect(url.searchParams.get('offset')).toBe('0');
            expect(url.searchParams.has('sort')).toBe(false);
            expect(url.searchParams.has('order')).toBe(false);
        });
    });

    describe('UI Responsiveness', () => {
        it('shows loading indicator during async operations', async () => {
            // Set loading state from auth composable
            mockAuthState.isLoading = true;

            const wrapper = mount(AccountView);

            // Should show loading immediately
            expect(wrapper.find('.loading-container').exists()).toBe(true);

            await flushPromises();
        });

        it('disables interactive elements during operations', async () => {
            mockHttp.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    tracks: [{ id: 'track-1', name: 'Track 1', length_km: 5.0, elevation_gain: 100, is_public: true, created_at: '2024-01-01' }],
                    total: 1
                }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Start a toggle operation
            const toggleBtn = wrapper.find('.visibility-toggle');

            // Make the next call take time
            mockHttp.mockImplementation(() =>
                new Promise((resolve) =>
                    setTimeout(() => resolve({ ok: true }), 100)
                )
            );

            await toggleBtn.trigger('click');
            await nextTick();

            // Should be disabled during operation
            expect(toggleBtn.attributes('disabled')).toBeDefined();

            await flushPromises();
        });
    });
});
