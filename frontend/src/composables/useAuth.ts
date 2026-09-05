import { computed, type ComputedRef } from 'vue';
import { useAuthStore } from '../stores/auth';
import type { User } from '@/types';

/**
 * Authentication composable.
 * Thin facade over useAuthStore — preserves the original public API.
 */
export function useAuth() {
    const store = useAuthStore();

    // Dev-only E2E hook
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
        (window as unknown as { __tracklyAuthE2E?: unknown }).__tracklyAuthE2E = {
            setAuthenticated(testUser: User) {
                store.setE2EAuthenticated(testUser);
            },
            clearAuth() {
                store.$reset();
            }
        };
    }

    return {
        isAuthenticated: computed(() => store.isAuthenticated) as ComputedRef<boolean>,
        isInitialized: computed(() => store.isInitialized) as ComputedRef<boolean>,
        isLoading: computed(() => store.isLoading) as ComputedRef<boolean>,
        user: computed(() => store.user) as ComputedRef<User | null>,
        error: computed(() => store.error) as ComputedRef<string | null>,
        accessToken: computed(() => store.accessToken) as ComputedRef<string | null>,
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
