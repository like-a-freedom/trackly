import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, computed, nextTick } from 'vue';
import AccountView from '../../src/views/AccountView.vue';

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
        logout: vi.fn(),
        updateProfile: vi.fn(),
        deleteAccount: vi.fn(),
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
            mockAuthState.authFetchFn.mockClear();
            mockAuthState.authFetchFn.mockResolvedValue({ ok: true });

            const visibilityButton = wrapper.find('.visibility-toggle');
            await visibilityButton.trigger('click');
            await flushPromises();

            expect(mockAuthState.authFetchFn).toHaveBeenCalledWith(
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
            mockAuthState.authFetchFn = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ tracks: mockTracks }),
                })
                .mockResolvedValueOnce({
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

            expect(mockAuthState.authFetchFn).toHaveBeenCalledWith(
                '/api/account/tracks/bulk/visibility',
                expect.objectContaining({
                    method: 'PATCH',
                })
            );
        });

        it('calls bulk delete API when delete button clicked after confirmation', async () => {
            mockConfirmFn.mockResolvedValue(true);
            mockAuthState.authFetchFn = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ tracks: mockTracks }),
                })
                .mockResolvedValueOnce({
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

            expect(mockAuthState.authFetchFn).toHaveBeenCalledWith(
                '/api/account/tracks/bulk',
                expect.objectContaining({
                    method: 'DELETE',
                })
            );
        });

        it('does not call delete API if confirmation is cancelled', async () => {
            mockConfirmFn.mockResolvedValue(false);

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
            expect(mockAuthState.authFetchFn).toHaveBeenCalledTimes(1);
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
});
