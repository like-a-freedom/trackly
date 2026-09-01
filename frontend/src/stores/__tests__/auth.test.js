import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../auth/refresh.js', () => ({
    logout: vi.fn().mockResolvedValue(undefined),
    refreshToken: vi.fn()
}));

vi.mock('../../auth/oauth-client.js', () => ({
    startLogin: vi.fn(),
    handleCallback: vi.fn(),
    clearOAuthState: vi.fn()
}));

vi.mock('../../auth/profile.js', () => ({
    fetchProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteAccount: vi.fn()
}));

vi.mock('../../auth/migration.js', () => ({
    migrateSessionTracks: vi.fn()
}));

import { useAuthStore } from '../auth';

describe('useAuthStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        sessionStorage.clear();
    });

    it('has correct initial state', () => {
        const store = useAuthStore();
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.isInitialized).toBe(false);
        expect(store.isLoading).toBe(false);
    });

    it('isAuthenticated is false when no user', () => {
        const store = useAuthStore();
        expect(store.isAuthenticated).toBe(false);
    });

    it('isAuthenticated is true when user and token present', () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.user = { id: 'u1', name: 'Test' };
        expect(store.isAuthenticated).toBe(true);
    });

    it('logout clears state', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.user = { id: 'u1' };
        store.tokenExpiresAt = Date.now() + 60000;

        await store.logout();
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.tokenExpiresAt).toBeNull();
    });
});
