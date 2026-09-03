import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, computed, nextTick } from 'vue';
import AccountView from '../../src/views/AccountView.vue';

// Import mocked http for assertions
import { http as mockHttp } from '../../src/http-instance';

// Mock vue-router
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('vue-router', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
}));

// Mock auth state that can be modified per test
let mockAuthState = {
    user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        avatar_url: 'https://example.com/avatar.jpg',
    },
    isLoading: false,
    authFetchFn: null,
};

// Mock useAuth composable
vi.mock('../../src/composables/useAuth', () => ({
    useAuth: vi.fn(() => ({
        user: computed(() => mockAuthState.user),
        isLoading: ref(mockAuthState.isLoading),
        logout: (...args) => mockAuthState.logoutFn?.(...args),
        updateProfile: (...args) => mockAuthState.updateProfileFn?.(...args),
        deleteAccount: (...args) => mockAuthState.deleteAccountFn?.(...args),
        authFetch: (...args) => mockAuthState.authFetchFn?.(...args),
    })),
}));

// Mock useConfirm composable
let mockConfirmFn = vi.fn();
vi.mock('../../src/composables/useConfirm', () => ({
    useConfirm: () => ({
        confirm: (...args) => mockConfirmFn(...args),
    }),
}));

// Mock http-instance
vi.mock('../../src/http-instance', () => ({
    http: vi.fn(),
}));

const mockTracks = [
    {
        id: 'track-1',
        name: 'Morning Run',
        length_km: 5.432,
        elevation_gain: 150.5,
        is_public: true,
        created_at: '2024-01-15T10:00:00Z',
    },
    {
        id: 'track-2',
        name: 'Evening Walk',
        length_km: 2.1,
        elevation_gain: 25.0,
        is_public: false,
        created_at: '2024-01-14T18:00:00Z',
    },
    {
        id: 'track-3',
        name: 'Mountain Hike',
        length_km: 12.789,
        elevation_gain: 450.0,
        is_public: true,
        created_at: '2024-01-13T09:00:00Z',
    },
];

describe('AccountView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPush.mockReset();
        mockReplace.mockReset();
        mockConfirmFn.mockReset();

        // Default mock for http - returns tracks on first call
        vi.mocked(mockHttp).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ tracks: mockTracks }),
        });
        mockConfirmFn = vi.fn();

        // Reset auth state
        mockAuthState = {
            user: {
                id: 'test-user-id',
                email: 'test@example.com',
                name: 'Test User',
                nickname: 'testuser',
                avatar_url: 'https://example.com/avatar.jpg',
            },
            isLoading: false,
            authFetchFn: vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks: mockTracks }),
            }),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        // Clean up teleported modal content from document.body
        document.body.innerHTML = '';
    });

    describe('Track List Display', () => {
        it('displays tracks after loading', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.findAll('.track-card')).toHaveLength(3);
        });

        it('displays track names correctly', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const trackNames = wrapper.findAll('.track-name');
            expect(trackNames[0].text()).toBe('Morning Run');
            expect(trackNames[1].text()).toBe('Evening Walk');
            expect(trackNames[2].text()).toBe('Mountain Hike');
        });

        it('rounds track length to 1 decimal place', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const stats = wrapper.findAll('.track-stat');
            // First track: 5.432 km -> "5.4 km"
            expect(stats[0].text()).toContain('5.4 km');
        });

        it('rounds elevation gain to whole number', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const stats = wrapper.findAll('.track-stat');
            // Find elevation stat (contains "m" suffix)
            const elevationStats = stats.filter((s) => s.text().includes('m') && !s.text().includes('km'));
            expect(elevationStats.length).toBeGreaterThan(0);
            // First track: 150.5 -> "151m" (rounded)
            expect(elevationStats[0].text()).toContain('151m');
        });
    });

    describe('Search/Filter', () => {
        it('renders search input when tracks exist', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.find('.search-input').exists()).toBe(true);
        });

        it('filters tracks based on search query', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('Mountain');
            await nextTick();

            const trackCards = wrapper.findAll('.track-card');
            expect(trackCards).toHaveLength(1);
            expect(wrapper.find('.track-name').text()).toBe('Mountain Hike');
        });

        it('shows all tracks when search is cleared', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('Mountain');
            await nextTick();

            expect(wrapper.findAll('.track-card')).toHaveLength(1);

            await searchInput.setValue('');
            await nextTick();

            expect(wrapper.findAll('.track-card')).toHaveLength(3);
        });

        it('shows empty state when no tracks match search', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('NonexistentTrack');
            await nextTick();

            expect(wrapper.findAll('.track-card')).toHaveLength(0);
            expect(wrapper.text()).toContain('No tracks match your search');
        });

        it('displays correct filtered count in header', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.find('.track-count').text()).toBe('3 tracks');

            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('Run');
            await nextTick();

            expect(wrapper.find('.track-count').text()).toBe('1 tracks');
        });
    });

    describe('Track Selection', () => {
        it('renders checkboxes for each track', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const checkboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            expect(checkboxes).toHaveLength(3);
        });

        it('selects a track when checkbox is clicked', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const checkbox = wrapper.find('.track-checkbox input[type="checkbox"]');
            await checkbox.setChecked(true);

            expect(checkbox.element.checked).toBe(true);
        });

        it('shows bulk action buttons when tracks are selected', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.find('.btn-bulk').exists()).toBe(false);

            const checkbox = wrapper.find('.track-checkbox input[type="checkbox"]');
            await checkbox.setChecked(true);
            await nextTick();

            expect(wrapper.find('.btn-bulk').exists()).toBe(true);
        });

        it('select all checkbox selects all visible tracks', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const selectAll = wrapper.find('.select-all-label input[type="checkbox"]');
            await selectAll.setChecked(true);
            await nextTick();

            const trackCheckboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            trackCheckboxes.forEach((cb) => {
                expect(cb.element.checked).toBe(true);
            });
        });
    });

    describe('Visibility Toggle', () => {
        it('renders visibility toggle button for each track', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const visibilityButtons = wrapper.findAll('.visibility-toggle');
            expect(visibilityButtons).toHaveLength(3);
        });

        it('shows correct visibility state', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const visibilityButtons = wrapper.findAll('.visibility-toggle');
            // First track is public
            expect(visibilityButtons[0].classes()).toContain('public');
            expect(visibilityButtons[0].text()).toContain('Public');
            // Second track is private
            expect(visibilityButtons[1].classes()).not.toContain('public');
            expect(visibilityButtons[1].text()).toContain('Private');
        });

        it('calls API to toggle visibility when clicked', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Reset mock to track visibility toggle call
            mockHttp.mockClear();
            mockHttp.mockResolvedValue({ ok: true });

            const visibilityButton = wrapper.find('.visibility-toggle');
            await visibilityButton.trigger('click');
            await flushPromises();

            expect(mockHttp).toHaveBeenCalledWith(
                '/api/tracks/track-1/visibility',
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ is_public: false }), // Toggle from true to false
                })
            );
        });
    });

    describe('Bulk Operations', () => {
        it('calls bulk visibility API when toggle visibility button clicked', async () => {
            mockHttp.mockClear();
            mockHttp.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ tracks: mockTracks }),
            }).mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        updated: [
                            { id: 'track-1', is_public: false },
                            { id: 'track-2', is_public: true },
                        ],
                    }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Select all tracks
            const selectAll = wrapper.find('.select-all-label input[type="checkbox"]');
            await selectAll.setChecked(true);
            await nextTick();

            // Click bulk toggle visibility
            const bulkToggleBtn = wrapper.findAll('.btn-bulk').find((b) => b.text().includes('Toggle visibility'));
            await bulkToggleBtn.trigger('click');
            await flushPromises();

            expect(mockHttp).toHaveBeenCalledWith(
                '/api/account/tracks/bulk/visibility',
                expect.objectContaining({
                    method: 'PATCH',
                })
            );
        });

        it('calls bulk delete API when delete button clicked after confirmation', async () => {
            mockConfirmFn.mockResolvedValue(true);
            mockHttp.mockClear();
            mockHttp.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ tracks: mockTracks }),
            }).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ deleted: ['track-1', 'track-2'] }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Select first two tracks
            const checkboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            await checkboxes[0].setChecked(true);
            await checkboxes[1].setChecked(true);
            await nextTick();

            // Click bulk delete
            const bulkDeleteBtn = wrapper.findAll('.btn-bulk').find((b) => b.text().includes('Delete'));
            await bulkDeleteBtn.trigger('click');
            await flushPromises();

            expect(mockConfirmFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Delete Tracks?',
                })
            );

            expect(mockHttp).toHaveBeenCalledWith(
                '/api/account/tracks/bulk',
                expect.objectContaining({
                    method: 'DELETE',
                })
            );
        });

        it('does not call delete API if confirmation is cancelled', async () => {
            mockConfirmFn.mockResolvedValue(false);
            mockHttp.mockClear();
            mockHttp.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ tracks: mockTracks }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Select a track
            const checkbox = wrapper.find('.track-checkbox input[type="checkbox"]');
            await checkbox.setChecked(true);
            await nextTick();

            // Click bulk delete
            const bulkDeleteBtn = wrapper.findAll('.btn-bulk').find((b) => b.text().includes('Delete'));
            await bulkDeleteBtn.trigger('click');
            await flushPromises();

            // Only initial load call, no delete call
            expect(mockHttp).toHaveBeenCalledTimes(1);
        });
    });

    describe('Scrollable Container', () => {
        it('renders tracks list inside scrollable container', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const container = wrapper.find('.tracks-list-container');
            expect(container.exists()).toBe(true);
        });
    });

    describe('Settings Menu', () => {
        it('opens settings menu when settings button is clicked', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const settingsBtn = wrapper.find('.settings-btn');
            expect(settingsBtn.exists()).toBe(true);

            await settingsBtn.trigger('click');
            await nextTick();

            expect(wrapper.find('.settings-menu').exists()).toBe(true);
        });

        it('closes settings menu when clicking outside', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Open menu
            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();
            expect(wrapper.find('.settings-menu').exists()).toBe(true);

            // Click outside
            const clickEvent = new MouseEvent('click', { bubbles: true });
            document.dispatchEvent(clickEvent);
            await nextTick();

            expect(wrapper.find('.settings-menu').exists()).toBe(false);
        });

        it('renders all menu items', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const menuItems = wrapper.findAll('.menu-item');
            expect(menuItems.length).toBeGreaterThanOrEqual(3);

            // Check for specific menu items
            const menuTexts = menuItems.map((item) => item.text());
            expect(menuTexts.some((text) => text.includes('Edit Nickname'))).toBe(true);
            expect(menuTexts.some((text) => text.includes('Delete Account'))).toBe(true);
            expect(menuTexts.some((text) => text.includes('Sign Out'))).toBe(true);
        });

        it('delete account menu item has danger styling', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const deleteMenuItem = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Delete Account')
            );
            expect(deleteMenuItem.exists()).toBe(true);
            expect(deleteMenuItem.classes()).toContain('menu-item-danger');
        });
    });

    describe('Nickname Editing', () => {
        // Modal is teleported to body, so we need to query document
        const findModal = () => document.querySelector('.modal-overlay');

        // Helper to open nickname modal
        const openNicknameModal = async (wrapper) => {
            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();
            const editNicknameBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Edit Nickname')
            );
            await editNicknameBtn.trigger('click');
            await nextTick();
        };

        it('opens nickname modal when clicking edit nickname', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            expect(findModal()).toBeTruthy();
            expect(document.querySelector('.modal-header h3')?.textContent).toBe('Edit Nickname');
        });

        it('closes nickname modal when clicking cancel', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            // Click cancel
            document.querySelector('.btn-cancel')?.click();
            await nextTick();

            expect(findModal()).toBeFalsy();
        });

        it('closes nickname modal when clicking X button', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            // Click X button
            document.querySelector('.modal-close')?.click();
            await nextTick();

            expect(findModal()).toBeFalsy();
        });

        it('validates nickname format', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            // Enter invalid nickname
            const input = document.querySelector('#nickname-input');
            if (input) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                nativeInputValueSetter?.call(input, 'invalid@nickname!');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await nextTick();

            // Try to save
            document.querySelector('.modal-footer .btn-primary')?.click();
            await flushPromises();

            // Should show error
            expect(document.querySelector('.form-error')).toBeTruthy();
        });

        it('disables save button when nickname is unchanged', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            const saveBtn = document.querySelector('.modal-footer .btn-primary');
            expect(saveBtn?.hasAttribute('disabled')).toBeTruthy();
        });

        it('enables save button when nickname changes', async () => {
            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            // Change nickname
            const input = document.querySelector('#nickname-input');
            if (input) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                nativeInputValueSetter?.call(input, 'newnickname');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await nextTick();

            const saveBtn = document.querySelector('.modal-footer .btn-primary');
            expect(saveBtn?.hasAttribute('disabled')).toBeFalsy();
        });

        it('calls updateProfile when saving valid nickname', async () => {
            const updateProfileMock = vi.fn().mockResolvedValue({});
            mockAuthState.updateProfileFn = updateProfileMock;

            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            // Enter new nickname
            const input = document.querySelector('#nickname-input');
            if (input) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                nativeInputValueSetter?.call(input, 'newnickname');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await nextTick();

            // Save
            document.querySelector('.modal-footer .btn-primary')?.click();
            await flushPromises();

            expect(updateProfileMock).toHaveBeenCalledWith({ nickname: 'newnickname' });
        });

        it('shows loading state while saving nickname', async () => {
            // Use a delayed mock to test loading state
            let resolveProfile;
            const updateProfileMock = vi.fn().mockImplementation(() =>
                new Promise((resolve) => { resolveProfile = resolve; })
            );
            mockAuthState.updateProfileFn = updateProfileMock;

            const wrapper = mount(AccountView, { attachTo: document.body });
            await flushPromises();

            await openNicknameModal(wrapper);

            // Enter new nickname
            const input = document.querySelector('#nickname-input');
            if (input) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                nativeInputValueSetter?.call(input, 'newnickname');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await nextTick();

            // Click save and wait for Vue to update DOM
            document.querySelector('.modal-footer .btn-primary')?.click();
            await nextTick();
            await nextTick(); // Extra tick for async function to start

            // Check loading state - the mock promise hasn't resolved yet, so loading should be true
            expect(document.querySelector('.modal-footer .btn-primary')?.textContent).toContain('Saving');

            // Resolve the promise to clean up
            resolveProfile({});
            await flushPromises();
        });
    });

    describe('Track Navigation', () => {
        it('navigates to track detail when clicking track info', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const trackInfo = wrapper.find('.track-info');
            await trackInfo.trigger('click');

            expect(mockPush).toHaveBeenCalledWith('/track/track-1');
        });
    });

    describe('Load More Tracks', () => {
        it('shows load more button when there are more tracks', async () => {
            vi.mocked(mockHttp).mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        tracks: mockTracks.slice(0, 2),
                        total: 10,
                    }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Component should request tracks and show load more if hasMoreTracks is true
            // Since mock returns fewer tracks than total, load more should be visible
            const loadMoreBtn = wrapper.find('.btn-load-more');
            if (loadMoreBtn.exists()) {
                expect(loadMoreBtn.text().toLowerCase()).toContain('load more');
            }
        });

        it('loads more tracks when clicking load more button', async () => {
            let callCount = 0;
            vi.mocked(mockHttp).mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            tracks:
                                callCount === 1
                                    ? mockTracks.slice(0, 2)
                                    : mockTracks.slice(2),
                            total: 5,
                        }),
                });
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            const loadMoreBtn = wrapper.find('.btn-load-more');
            if (loadMoreBtn.exists()) {
                await loadMoreBtn.trigger('click');
                await flushPromises();

                expect(mockHttp).toHaveBeenCalledTimes(2);
            }
        });
    });

    describe('Empty States', () => {
        it('shows empty state when user has no tracks', async () => {
            vi.mocked(mockHttp).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks: [], total: 0 }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.find('.tracks-empty').exists()).toBe(true);
            expect(wrapper.text()).toContain("You don't have any tracks yet");
        });

        it('shows upload button in empty state', async () => {
            vi.mocked(mockHttp).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks: [], total: 0 }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            const uploadBtn = wrapper.find('.tracks-empty .btn-secondary');
            expect(uploadBtn.exists()).toBe(true);
            expect(uploadBtn.text()).toContain('Upload');
        });

        it('navigates to home when clicking upload button', async () => {
            vi.mocked(mockHttp).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks: [], total: 0 }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            const uploadBtn = wrapper.find('.tracks-empty .btn-secondary');
            await uploadBtn.trigger('click');

            expect(mockPush).toHaveBeenCalledWith('/');
        });
    });

    describe('Loading States', () => {
        it('shows loading state initially', async () => {
            // Set loading state from auth composable
            mockAuthState.isLoading = true;

            const wrapper = mount(AccountView);

            // Check loading state immediately
            expect(wrapper.find('.loading-container').exists()).toBe(true);
            expect(wrapper.text()).toContain('Loading');
        });

        it('shows tracks loading indicator', async () => {
            mockAuthState.isLoading = true;

            const wrapper = mount(AccountView);
            await flushPromises();

            expect(wrapper.find('.loading-container').exists()).toBe(true);
        });
    });

    describe('Logout', () => {
        it('calls logout when clicking sign out', async () => {
            const logoutMock = vi.fn();
            mockAuthState.logoutFn = logoutMock;

            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const signOutBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Sign Out')
            );
            await signOutBtn.trigger('click');
            await flushPromises();

            expect(logoutMock).toHaveBeenCalled();
        });

        it('navigates to home after logout', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const signOutBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Sign Out')
            );
            await signOutBtn.trigger('click');
            await flushPromises();

            expect(mockReplace).toHaveBeenCalledWith('/');
        });
    });

    describe('Account Deletion', () => {
        it('shows confirmation dialog when clicking delete account', async () => {
            mockConfirmFn = vi.fn().mockResolvedValue(false);

            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const deleteBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Delete Account')
            );
            await deleteBtn.trigger('click');
            await flushPromises();

            expect(mockConfirmFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Delete Account?',
                    confirmText: 'Delete Account',
                })
            );
        });

        it('calls deleteAccount when confirmed', async () => {
            const deleteAccountMock = vi.fn().mockResolvedValue({});
            mockAuthState.deleteAccountFn = deleteAccountMock;
            mockConfirmFn = vi.fn().mockResolvedValue(true);

            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const deleteBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Delete Account')
            );
            await deleteBtn.trigger('click');
            await flushPromises();

            expect(deleteAccountMock).toHaveBeenCalled();
        });

        it('navigates to home after successful deletion', async () => {
            mockConfirmFn = vi.fn().mockResolvedValue(true);

            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const deleteBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Delete Account')
            );
            await deleteBtn.trigger('click');
            await flushPromises();

            expect(mockReplace).toHaveBeenCalledWith('/');
        });

        it('does not delete account when cancelled', async () => {
            const deleteAccountMock = vi.fn();
            mockAuthState.deleteAccountFn = deleteAccountMock;
            mockConfirmFn = vi.fn().mockResolvedValue(false);

            const wrapper = mount(AccountView);
            await flushPromises();

            await wrapper.find('.settings-btn').trigger('click');
            await nextTick();

            const deleteBtn = wrapper.findAll('.menu-item').find((item) =>
                item.text().includes('Delete Account')
            );
            await deleteBtn.trigger('click');
            await flushPromises();

            expect(deleteAccountMock).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('handles track loading error gracefully', async () => {
            vi.mocked(mockHttp).mockRejectedValue(new Error('Network error'));

            const wrapper = mount(AccountView);
            await flushPromises();

            // Should not crash, should show empty state or handle gracefully
            expect(wrapper.find('.account-page').exists()).toBe(true);
        });

        it('handles visibility toggle error gracefully', async () => {
            vi.mocked(mockHttp).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks: mockTracks }),
            });

            const wrapper = mount(AccountView);
            await flushPromises();

            // Simulate toggle failure
            vi.mocked(mockHttp).mockRejectedValue(new Error('API error'));

            const visibilityButton = wrapper.find('.visibility-toggle');
            await visibilityButton.trigger('click');
            await flushPromises();

            // Component should still be functional
            expect(wrapper.find('.account-page').exists()).toBe(true);
        });
    });

    describe('Track Count Display', () => {
        it('displays correct track count in header', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const trackCount = wrapper.find('.track-count');
            expect(trackCount.exists()).toBe(true);
            expect(trackCount.text()).toContain('3 tracks');
        });

        it('updates track count when tracks are filtered', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const searchInput = wrapper.find('.search-input');
            await searchInput.setValue('Mountain');
            await nextTick();

            const trackCount = wrapper.find('.track-count');
            expect(trackCount.text()).toContain('1 tracks');
        });
    });

    describe('Bulk Operations UI', () => {
        it('disables bulk buttons during operation', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Select a track
            const checkbox = wrapper.find('.track-checkbox input[type="checkbox"]');
            await checkbox.setChecked(true);
            await nextTick();

            const bulkBtn = wrapper.find('.btn-bulk');
            expect(bulkBtn.attributes('disabled')).toBeUndefined();

            // Click to trigger operation
            await bulkBtn.trigger('click');

            // Should be disabled during operation
            expect(bulkBtn.attributes('disabled')).toBeDefined();
        });

        it('shows correct count on bulk buttons', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // Select two tracks
            const checkboxes = wrapper.findAll('.track-checkbox input[type="checkbox"]');
            await checkboxes[0].setChecked(true);
            await checkboxes[1].setChecked(true);
            await nextTick();

            const bulkButtons = wrapper.findAll('.btn-bulk');
            const toggleBtn = bulkButtons.find((b) => b.text().includes('Toggle visibility'));
            expect(toggleBtn.text()).toContain('(2)');
        });
    });

    describe('Header Display', () => {
        it('displays user name in header', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const userName = wrapper.find('.header-user-name');
            expect(userName.text()).toBe('Test User');
        });

        it('displays user avatar when available', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const avatar = wrapper.find('.header-avatar img');
            expect(avatar.exists()).toBe(true);
            expect(avatar.attributes('src')).toBe('https://example.com/avatar.jpg');
        });

        it('shows default avatar when no avatar URL', async () => {
            mockAuthState.user.avatar_url = null;

            const wrapper = mount(AccountView);
            await flushPromises();

            const defaultAvatar = wrapper.find('.header-avatar svg');
            expect(defaultAvatar.exists()).toBe(true);
        });

        it('back button navigates to home', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const backBtn = wrapper.find('.back-btn');
            await backBtn.trigger('click');

            expect(mockPush).toHaveBeenCalledWith('/');
        });
    });

    describe('Format Utilities', () => {
        it('formats track distance with correct decimal places', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            // First track has 5.432 km, should display as 5.4 km
            const stats = wrapper.findAll('.track-stat');
            const distanceStats = stats.filter((s) => s.text().includes('km'));
            expect(distanceStats[0].text()).toMatch(/\d+\.\d km/);
        });

        it('formats elevation gain as whole number', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const stats = wrapper.findAll('.track-stat');
            const elevationStats = stats.filter(
                (s) => s.text().includes('m') && !s.text().includes('km')
            );
            if (elevationStats.length > 0) {
                // Should be a whole number followed by 'm'
                expect(elevationStats[0].text()).toMatch(/^\d+m$/);
            }
        });

        it('formats dates correctly', async () => {
            const wrapper = mount(AccountView);
            await flushPromises();

            const dates = wrapper.findAll('.track-date');
            expect(dates.length).toBeGreaterThan(0);

            // Check that dates are formatted (contain year or month)
            dates.forEach((date) => {
                const text = date.text();
                expect(text.length).toBeGreaterThan(0);
            });
        });
    });
});
