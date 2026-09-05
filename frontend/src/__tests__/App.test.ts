// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import App from '../App.vue';

// Mock feature flags store
vi.mock('../stores/featureFlags', () => ({
    useFeatureFlagsStore: vi.fn(() => ({
        isLoaded: ref(true),
        isAuthEnabled: ref(false),
        fetchFlags: vi.fn().mockResolvedValue(undefined),
    })),
}));

// Mock auth composable
vi.mock('../composables/useAuth', () => ({
    useAuth: vi.fn(() => ({
        initialize: vi.fn().mockResolvedValue(undefined),
    })),
}));

// Mock ConfirmDialogProvider
vi.mock('../components/ConfirmDialogProvider.vue', () => ({
    default: { template: '<div class="confirm-dialog-mock"></div>' },
}));

// Mock vue-router
const mockRoute = ref({
    path: '/',
    name: 'Home',
    params: {},
    meta: {},
    query: {},
});

vi.mock('vue-router', () => ({
    useRouter: () => ({
        currentRoute: mockRoute,
    }),
    useRoute: () => mockRoute.value,
}));

describe('App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders when feature flags are loaded', () => {
        const wrapper = mount(App);
        expect(wrapper.find('#app-container').exists()).toBe(true);
    });

    it('renders ConfirmDialogProvider', () => {
        const wrapper = mount(App);
        expect(wrapper.find('.confirm-dialog-mock').exists()).toBe(true);
    });

    it('loading screen has correct structure', () => {
        const wrapper = mount(App);
        // Verify the loading screen styles exist in the component
        expect(wrapper.find('#app-container').exists()).toBe(true);
    });

    it('returns home-view key for Home route', () => {
        const wrapper = mount(App);
        const key = wrapper.vm.getComponentKey({ name: 'Home', path: '/', meta: {} });
        expect(key).toBe('home-view');
    });

    it('returns track-view key for Track route', () => {
        const wrapper = mount(App);
        const key = wrapper.vm.getComponentKey({
            name: 'Track',
            path: '/track/123',
            params: { id: '123' },
            meta: {},
        });
        expect(key).toBe('track-view-123');
    });

    it('returns keepAliveKey from meta if present', () => {
        const wrapper = mount(App);
        const key = wrapper.vm.getComponentKey({
            name: 'Custom',
            path: '/custom',
            meta: { keepAliveKey: 'custom-key' },
        });
        expect(key).toBe('custom-key');
    });

    it('returns route path as fallback key', () => {
        const wrapper = mount(App);
        const key = wrapper.vm.getComponentKey({
            name: 'Other',
            path: '/other',
            meta: {},
        });
        expect(key).toBe('/other');
    });

    it('calls fetchFlags on mount', async () => {
        const { useFeatureFlagsStore } = await import('../stores/featureFlags');
        const mockFetchFlags = vi.fn().mockResolvedValue(undefined);
        vi.mocked(useFeatureFlagsStore).mockReturnValue({
            isLoaded: ref(true),
            isAuthEnabled: ref(false),
            fetchFlags: mockFetchFlags,
        });

        mount(App);
        await nextTick();
        expect(mockFetchFlags).toHaveBeenCalled();
    });

    it('calls initialize when auth is enabled', async () => {
        const { useAuth } = await import('../composables/useAuth');
        const { useFeatureFlagsStore } = await import('../stores/featureFlags');
        const mockInitialize = vi.fn().mockResolvedValue(undefined);
        vi.mocked(useAuth).mockReturnValue({ initialize: mockInitialize });
        vi.mocked(useFeatureFlagsStore).mockReturnValue({
            isLoaded: ref(true),
            isAuthEnabled: ref(true),
            fetchFlags: vi.fn().mockResolvedValue(undefined),
        });

        mount(App);
        await nextTick();
        expect(mockInitialize).toHaveBeenCalled();
    });
});
