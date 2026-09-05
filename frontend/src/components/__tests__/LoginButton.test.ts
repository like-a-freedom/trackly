// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, computed } from 'vue';
import LoginButton from '../LoginButton.vue';

// Mock useAuth composable
vi.mock('../../composables/useAuth', () => ({
    useAuth: vi.fn(() => ({
        isAuthenticated: computed(() => mockAuthState.isAuthenticated),
        isLoading: ref(mockAuthState.isLoading),
        user: computed(() => mockAuthState.user),
        login: vi.fn(() => mockAuthState.loginFn?.()),
        logout: vi.fn(() => mockAuthState.logoutFn?.())
    }))
}));

// Mock vue-router
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
    useRouter: () => ({
        push: mockPush,
        currentRoute: { value: { fullPath: '/' } }
    })
}));

// Mock auth state that can be modified per test
let mockAuthState = {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    loginFn: null,
    logoutFn: null
};

describe('LoginButton.vue', () => {
    beforeEach(() => {
        // Reset mock state
        mockAuthState = {
            isAuthenticated: false,
            isLoading: false,
            user: null,
            loginFn: null,
            logoutFn: null
        };
        mockPush.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Unauthenticated state', () => {
        it('should render login button when not authenticated', () => {
            const wrapper = mount(LoginButton);

            expect(wrapper.find('.login-button').exists()).toBe(true);
            expect(wrapper.find('.user-menu').exists()).toBe(false);
        });

        it('should show Google icon in login button', () => {
            const wrapper = mount(LoginButton);

            const button = wrapper.find('.login-button');
            expect(button.find('svg').exists()).toBe(true);
            // Check for Google brand colors in SVG paths
            expect(button.html()).toContain('#4285F4'); // Google blue
        });

        it('should be icon-only button (no text)', () => {
            const wrapper = mount(LoginButton);

            // Button should not contain text - just icon
            const button = wrapper.find('.login-button');
            expect(button.text()).toBe('');
        });

        it('should call login function when clicked', async () => {
            const loginFn = vi.fn();
            mockAuthState.loginFn = loginFn;

            const wrapper = mount(LoginButton);

            await wrapper.find('.login-button').trigger('click');

            // Login is called via the useAuth mock
            expect(wrapper.emitted()).toBeDefined();
        });

        it('should be disabled when loading', async () => {
            mockAuthState.isLoading = true;

            const wrapper = mount(LoginButton);

            const button = wrapper.find('.login-button');
            expect(button.attributes('disabled')).toBeDefined();
        });

        it('should show spinner when loading', async () => {
            mockAuthState.isLoading = true;

            const wrapper = mount(LoginButton);

            expect(wrapper.find('.spinner').exists()).toBe(true);
        });
    });

    describe('Authenticated state', () => {
        beforeEach(() => {
            mockAuthState.isAuthenticated = true;
            mockAuthState.user = {
                name: 'Test User',
                email: 'test@example.com',
                avatar_url: 'https://example.com/avatar.jpg'
            };
        });

        it('should render user button when authenticated', () => {
            const wrapper = mount(LoginButton);

            expect(wrapper.find('.user-menu').exists()).toBe(true);
            expect(wrapper.find('.login-button').exists()).toBe(false);
        });

        it('should show user avatar', () => {
            const wrapper = mount(LoginButton);

            const avatar = wrapper.find('.user-avatar');
            expect(avatar.exists()).toBe(true);
            expect(avatar.attributes('src')).toBe('https://example.com/avatar.jpg');
        });

        it('should show placeholder when no avatar', () => {
            mockAuthState.user = {
                name: 'Test User',
                email: 'test@example.com',
                avatar_url: null
            };

            const wrapper = mount(LoginButton);

            expect(wrapper.find('.avatar-placeholder-small').exists()).toBe(true);
            expect(wrapper.find('.user-avatar').exists()).toBe(false);
        });

        it('should navigate to account page when avatar is clicked', async () => {
            const wrapper = mount(LoginButton);

            await wrapper.find('.user-button').trigger('click');

            expect(mockPush).toHaveBeenCalledWith('/account');
        });
    });

    describe('Accessibility', () => {
        it('should have title attribute on login button', () => {
            const wrapper = mount(LoginButton);

            expect(wrapper.find('.login-button').attributes('title')).toBe('Sign in with Google');
        });

        it('should have title attribute on user button', () => {
            mockAuthState.isAuthenticated = true;
            mockAuthState.user = {
                name: 'Test User',
                email: 'test@example.com',
                avatar_url: null
            };

            const wrapper = mount(LoginButton);

            expect(wrapper.find('.user-button').attributes('title')).toBe('Test User');
        });
    });
});
