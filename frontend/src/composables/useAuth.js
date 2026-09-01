import { computed, readonly } from 'vue';
import { useAuthStore } from '../stores/auth.js';

/**
 * Authentication composable.
 * Thin facade over useAuthStore — preserves the original public API.
 */
export function useAuth() {
    const store = useAuthStore();

    // Dev-only E2E hook
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
        window.__tracklyAuthE2E = {
            setAuthenticated(testUser) {
                store.setE2EAuthenticated(testUser);
            },
            clearAuth() {
                store.$reset();
            }
        };
    }

    return {
        isAuthenticated: computed(() => store.isAuthenticated),
        isInitialized: computed(() => store.isInitialized),
        isLoading: computed(() => store.isLoading),
        user: computed(() => store.user),
        error: computed(() => store.error),
        accessToken: computed(() => store.accessToken),
        initialize: store.initialize.bind(store),
        login: store.login.bind(store),
        handleCallback: store.handleCallback.bind(store),
        logout: store.logout.bind(store),
        refresh: store.refresh.bind(store),
        fetchUserProfile: store.fetchUserProfile.bind(store),
        updateProfile: store.updateProfile.bind(store),
        migrateSessionTracks: store.migrateSessionTracks.bind(store),
        deleteAccount: store.deleteAccount.bind(store),
        ensureValidToken: store.ensureValidToken.bind(store),
        getAuthHeader: store.getAuthHeader.bind(store),
        authFetch: store.authFetch.bind(store),
        _resetForTesting: () => store.$reset()
    };
}
