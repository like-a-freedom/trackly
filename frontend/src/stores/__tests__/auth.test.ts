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
        store.user = { id: 'u1', name: 'Test', email: 'test@example.com' };
        expect(store.isAuthenticated).toBe(true);
    });

    it('logout clears state', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.user = { id: 'u1', name: 'Test', email: 'test@example.com' };
        store.tokenExpiresAt = Date.now() + 60000;

        await store.logout();
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.tokenExpiresAt).toBeNull();
    });

    it('isTokenExpiringSoon is true when no expiry', () => {
        const store = useAuthStore();
        store.tokenExpiresAt = null;
        expect(store.isTokenExpiringSoon).toBe(true);
    });

    it('isTokenExpiringSoon is true when expiring soon', () => {
        const store = useAuthStore();
        store.tokenExpiresAt = Date.now() + 1000; // 1 second from now
        expect(store.isTokenExpiringSoon).toBe(true);
    });

    it('isTokenExpiringSoon is false when not expiring soon', () => {
        const store = useAuthStore();
        store.tokenExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now
        expect(store.isTokenExpiringSoon).toBe(false);
    });

    it('setE2EAuthenticated sets state', () => {
        const store = useAuthStore();
        store.setE2EAuthenticated();
        expect(store.accessToken).toBe('e2e-access-token');
        expect(store.isAuthenticated).toBe(true);
    });

    it('setE2EAuthenticated with custom user', () => {
        const store = useAuthStore();
        const customUser = { id: 'custom', name: 'Custom', email: 'custom@test.com' };
        store.setE2EAuthenticated(customUser);
        expect(store.user).toEqual(customUser);
    });

    it('getAuthHeader returns empty when no token', async () => {
        const store = useAuthStore();
        const header = await store.getAuthHeader();
        expect(header).toEqual({});
    });

    it('getAuthHeader returns Bearer token', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.tokenExpiresAt = Date.now() + 10 * 60 * 1000;
        const header = await store.getAuthHeader();
        expect(header).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('updateProfile updates user', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.tokenExpiresAt = Date.now() + 10 * 60 * 1000;
        const updatedUser = { id: 'u1', name: 'Updated', email: 'updated@test.com' };

        const { updateProfile } = await import('../../auth/profile.js');
        (updateProfile as any).mockResolvedValue(updatedUser);

        const result = await store.updateProfile({ name: 'Updated' });
        expect(result).toEqual(updatedUser);
        expect(store.user).toEqual(updatedUser);
    });

    it('deleteAccount clears state', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.user = { id: 'u1', name: 'Test', email: 'test@example.com' };
        store.tokenExpiresAt = Date.now() + 10 * 60 * 1000;

        await store.deleteAccount();
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
    });

    it('migrateSessionTracks calls migration', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';

        const { migrateSessionTracks } = await import('../../auth/migration.js');
        (migrateSessionTracks as any).mockResolvedValue({ tracks_migrated: 5, pois_migrated: 3 });

        const result = await store.migrateSessionTracks('session-123');
        expect(result).toEqual({ tracks_migrated: 5, pois_migrated: 3 });
    });

    it('initialize sets initialized state', async () => {
        const store = useAuthStore();
        await store.initialize();
        expect(store.isInitialized).toBe(true);
    });

    it('authFetch adds auth header', async () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.tokenExpiresAt = Date.now() + 10 * 60 * 1000;

        const mockResponse = new Response('{}', { status: 200 });
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

        await store.authFetch('/api/test');
        expect(global.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer test-token' })
        }));
    });

    it('reset clears all state', () => {
        const store = useAuthStore();
        store.accessToken = 'test-token';
        store.user = { id: 'u1', name: 'Test', email: 'test@example.com' };
        store.tokenExpiresAt = Date.now() + 60000;
        store.isInitialized = true;
        store.isLoading = true;
        store.error = 'Some error';

        store.$reset();

        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.tokenExpiresAt).toBeNull();
        expect(store.isInitialized).toBe(false);
        expect(store.isLoading).toBe(false);
        expect(store.error).toBeNull();
    });
});
