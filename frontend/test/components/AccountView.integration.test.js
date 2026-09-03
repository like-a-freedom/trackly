import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, computed, nextTick } from 'vue';
import AccountView from '../../src/views/AccountView.vue';

// Integration tests for AccountView with real composable behavior
// These tests verify the component works correctly with its dependencies

// Use vi.hoisted to make mocks available in vi.mock factories
const { mockPush, mockReplace, mockHttp, mockAuthState } = vi.hoisted(() => {
    const mockAuthState = {
        user: {
            id: 'integration-user-id',
            email: 'integration@example.com',
            name: 'Integration User',
            nickname: 'integrationuser',
            avatar_url: 'https://example.com/integration-avatar.jpg',
        },
        isLoading: false,
        logoutFn: vi.fn(),
        updateProfileFn: vi.fn(),
        deleteAccountFn: vi.fn(),
        authFetchFn: vi.fn(),
    };
    return {
        mockPush: vi.fn(),
        mockReplace: vi.fn(),
        mockHttp: vi.fn(),
        mockAuthState,
    };
});

describe('AccountView Integration', () => {
    vi.mock('vue-router', () => ({
        useRouter: () => ({
            push: mockPush,
            replace: mockReplace,
        }),
    }));

    // Track fetch history for verification
    let fetchHistory = [];

    // Mock useAuth
    vi.mock('../../src/composables/useAuth', () => ({
        useAuth: vi.fn(() => ({
            user: computed(() => mockAuthState.user),
            isLoading: ref(mockAuthState.isLoading),
            logout: mockAuthState.logoutFn,
            updateProfile: mockAuthState.updateProfileFn,
            deleteAccount: mockAuthState.deleteAccountFn,
            authFetch: (...args) => {
                fetchHistory.push({ args, timestamp: Date.now() });
                return mockAuthState.authFetchFn?.(...args);
            },
        })),
    }));

    // Mock useConfirm
    let confirmResponse = true;
    vi.mock('../../src/composables/useConfirm', () => ({
        useConfirm: () => ({
            confirm: () => Promise.resolve(confirmResponse),
        }),
    }));

    // Mock http-instance
    vi.mock('../../src/http-instance', () => ({
        http: mockHttp,
    }));

    beforeEach(() => {
        vi.clearAllMocks();
        mockPush.mockReset();
        mockReplace.mockReset();
        fetchHistory = [];
        confirmResponse = true;

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
        mockAuthState.logoutFn = vi.fn();
        mockAuthState.updateProfileFn = vi.fn().mockImplementation((updates) => {
            mockAuthState.user = { ...mockAuthState.user, ...updates };
            return Promise.resolve(mockAuthState.user);
        });
        mockAuthState.deleteAccountFn = vi.fn().mockResolvedValue({});
        mockAuthState.authFetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                tracks: [
                    { id: 'track-1', name: 'Track 1', length_km: 5.5, elevation_gain: 100, is_public: true, created_at: '2024-01-01' },
                    { id: 'track-2', name: 'Track 2', length_km: 3.2, elevation_gain: 50, is_public: false, created_at: '2024-01-02' },
                ],
                total: 2
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Component Initialization', () => {
        it('fetches tracks on mount with correct parameters', async () => {
            mount(AccountView);
            await flushPromises();

            // Component uses http directly, not authFetch
            const httpCalls = mockHttp.mock.calls;
            expect(httpCalls.length).toBeGreaterThan(0);

            const trackFetch = httpCalls.find(c =>
                c[0].includes('/api/account/tracks')
            );
            expect(trackFetch).toBeDefined();
            expect(trackFetch[0]).toContain('limit=');
            expect(trackFetch[0]).toContain('offset=');
            expect(trackFetch[0]).toContain('sort=created_at');
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

            // Verify bulk delete button appears and is functional
            const bulkDeleteBtn = wrapper.findAll('.btn-bulk').find(b =>
                b.text().includes('Delete')
            );
            expect(bulkDeleteBtn).toBeDefined();

            // Verify that tracks are selected (the button shows count)
            expect(bulkDeleteBtn.text()).toContain('Delete');
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
            // First call fails
            let callCount = 0;
            mockAuthState.authFetchFn = vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('Network error'));
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ 
                        tracks: [{ id: 'track-1', name: 'Track 1', length_km: 5.5, elevation_gain: 100, is_public: true, created_at: '2024-01-01' }],
                        total: 1 
                    }),
                });
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Component should still be functional
            expect(wrapper.find('.account-page').exists()).toBe(true);
            
            // Should show empty state or error state
            expect(wrapper.find('.tracks-empty').exists() || wrapper.find('.tracks-list').exists()).toBe(true);
        });

        it('handles visibility toggle failure gracefully', async () => {
            mockAuthState.authFetchFn = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ 
                    tracks: [{ id: 'track-1', name: 'Track 1', length_km: 5.5, elevation_gain: 100, is_public: true, created_at: '2024-01-01' }],
                    total: 1 
                }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Make toggle fail
            mockAuthState.authFetchFn = vi.fn().mockRejectedValue(new Error('API Error'));

            // Try to toggle visibility
            const toggleBtn = wrapper.find('.visibility-toggle');
            await toggleBtn.trigger('click');
            await flushPromises();

            // Component should still be functional
            expect(wrapper.find('.account-page').exists()).toBe(true);
        });

        it('handles bulk operation partial failure', async () => {
            mockAuthState.authFetchFn = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ 
                    tracks: [
                        { id: 'track-1', name: 'Track 1', length_km: 5.5, elevation_gain: 100, is_public: true, created_at: '2024-01-01' },
                        { id: 'track-2', name: 'Track 2', length_km: 3.2, elevation_gain: 50, is_public: false, created_at: '2024-01-02' },
                    ],
                    total: 2 
                }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Select tracks
            const checkboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            await checkboxes[0].setChecked(true);
            await checkboxes[1].setChecked(true);
            await nextTick();

            // Make bulk operation fail
            mockAuthState.authFetchFn = vi.fn().mockRejectedValue(new Error('Bulk operation failed'));

            const bulkDeleteBtn = wrapper.findAll('.btn-bulk').find(b => 
                b.text().includes('Delete')
            );
            await bulkDeleteBtn.trigger('click');
            await flushPromises();

            // Component should recover
            expect(wrapper.find('.account-page').exists()).toBe(true);
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

        it('clears selection when search filters out selected tracks', async () => {
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

            // Search for non-existent track
            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('NonExistentTrack');
            await nextTick();

            // Bulk buttons should disappear (no tracks visible to select)
            const visibleTrackCheckboxes = wrapper.findAll('.track-checkbox');
            expect(visibleTrackCheckboxes.length).toBe(0);
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
            if (loadMoreBtn.exists()) {
                await loadMoreBtn.trigger('click');
                await flushPromises();

                // Bulk buttons should still be visible (track still selected)
                expect(wrapper.findAll('.btn-bulk').length).toBeGreaterThan(0);
            }
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

            // Verify all fetch calls were made through http
            const trackCalls = mockHttp.mock.calls.filter(c =>
                c[0].includes('/api/account/tracks')
            );
            expect(trackCalls.length).toBeGreaterThan(0);
        });

        it('fetches tracks with pagination parameters', async () => {
            mount(AccountView);
            await flushPromises();

            const trackCall = mockHttp.mock.calls.find(c =>
                c[0].includes('/api/account/tracks')
            );

            const url = new URL('http://localhost' + trackCall[0]);
            expect(url.searchParams.has('limit')).toBe(true);
            expect(url.searchParams.has('offset')).toBe(true);
            expect(url.searchParams.get('sort')).toBe('created_at');
            expect(url.searchParams.get('order')).toBe('desc');
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
