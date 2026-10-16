// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

import { http } from '../../http-instance';

vi.mock('../../http-instance', () => ({ http: vi.fn() }));

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

vi.mock('../../composables/useAuth', () => ({
    useAuth: () => ({
        user: ref({ id: 'u1', name: 'User', email: 'user@example.com', nickname: null }),
        isLoading: ref(false),
        logout: vi.fn(),
        deleteAccount: vi.fn(),
        initialize: vi.fn().mockResolvedValue(undefined)
    })
}));

vi.mock('../../stores/auth', () => ({
    useAuthStore: () => ({ user: { id: 'u1', name: 'User', email: 'user@example.com', nickname: null } })
}));

const tracks = ref([]);
const loadTracks = vi.fn().mockResolvedValue(undefined);

vi.mock('../../composables/useTrackList', () => ({
    useTrackList: () => ({
        tracks,
        loading: ref(false),
        error: ref(null),
        hasMore: ref(false),
        offset: ref(0),
        loadTracks,
        loadMore: vi.fn(),
        removeTracks: vi.fn(),
        toggleVisibility: vi.fn()
    })
}));

import AccountView from '../AccountView.vue';

const track = (id, name) => ({ id, name, is_public: false, length_km: 1, elevation_gain: 10, created_at: '2026-01-01T00:00:00Z' });

const mountView = () => mount(AccountView, { global: { stubs: { LoginButton: true } } });

const bulkButtons = (wrapper) => wrapper.findAll('.btn-bulk');
const selectAll = (wrapper) => wrapper.find('.select-all-label input');
const searchInput = (wrapper) => wrapper.find('.search-input');

describe('AccountView bulk selection scope', () => {
    beforeEach(() => {
        vi.mocked(http).mockReset();
        vi.mocked(http).mockResolvedValue(new Response(JSON.stringify({ updated: [], deleted: [] }), { status: 200 }));
        tracks.value = [track('a', 'Alpha'), track('b', 'Bravo'), track('c', 'Charlie')];
    });

    it('hides the bulk actions when the search filters out every selected track', async () => {
        const wrapper = mountView();
        await nextTick();

        await selectAll(wrapper).setValue(true);
        await nextTick();
        expect(bulkButtons(wrapper)).toHaveLength(2);

        await searchInput(wrapper).setValue('Alpha');
        await nextTick();
        expect(bulkButtons(wrapper)[0].text()).toContain('Toggle visibility (1)');

        await searchInput(wrapper).setValue('NoSuchTrack');
        await nextTick();
        expect(bulkButtons(wrapper)).toHaveLength(0);
    });

    it('sends exactly the shown ids of the filtered collection', async () => {
        const wrapper = mountView();
        await nextTick();

        await searchInput(wrapper).setValue('Bravo');
        await nextTick();
        await selectAll(wrapper).setValue(true);
        await nextTick();

        vi.mocked(http).mockResolvedValue(new Response(JSON.stringify({ updated: [{ id: 'b', is_public: true }], count: 1 }), { status: 200 }));
        await bulkButtons(wrapper)[0].trigger('click');
        await nextTick();

        expect(http).toHaveBeenCalledWith('/api/account/tracks/bulk/visibility', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ track_ids: ['b'] })
        }));
    });

    it('restores the full selection scope when the search is cleared', async () => {
        const wrapper = mountView();
        await nextTick();

        await selectAll(wrapper).setValue(true);
        await searchInput(wrapper).setValue('Bravo');
        await nextTick();
        expect(bulkButtons(wrapper)[0].text()).toContain('(1)');

        await searchInput(wrapper).setValue('');
        await nextTick();
        expect(bulkButtons(wrapper)[0].text()).toContain('(1)');
        expect(wrapper.findAll('.track-card')).toHaveLength(3);
    });
});
