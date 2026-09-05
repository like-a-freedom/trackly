import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuth } from '../useAuth';
import { useAuthStore } from '../../stores/auth';
import type { User } from '@/types';

describe('useAuth', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('returns computed values from store', () => {
        const auth = useAuth();
        expect(auth.isAuthenticated.value).toBeDefined();
        expect(auth.isInitialized.value).toBeDefined();
        expect(auth.isLoading.value).toBeDefined();
        expect(auth.user.value).toBeDefined();
        expect(auth.error.value).toBeDefined();
        expect(auth.accessToken.value).toBeDefined();
    });

    it('exposes store methods', () => {
        const auth = useAuth();
        expect(typeof auth.initialize).toBe('function');
        expect(typeof auth.login).toBe('function');
        expect(typeof auth.handleCallback).toBe('function');
        expect(typeof auth.logout).toBe('function');
        expect(typeof auth.refresh).toBe('function');
        expect(typeof auth.fetchUserProfile).toBe('function');
        expect(typeof auth.updateProfile).toBe('function');
        expect(typeof auth.migrateSessionTracks).toBe('function');
        expect(typeof auth.deleteAccount).toBe('function');
        expect(typeof auth.ensureValidToken).toBe('function');
        expect(typeof auth.getAuthHeader).toBe('function');
        expect(typeof auth.authFetch).toBe('function');
    });

    it('exposes E2E hooks in non-production mode', () => {
        // In test mode (non-production), E2E hooks should be available
        const auth = useAuth();
        const e2eHooks = (window as any).__tracklyAuthE2E;
        expect(e2eHooks).toBeDefined();
        expect(typeof e2eHooks.setAuthenticated).toBe('function');
        expect(typeof e2eHooks.clearAuth).toBe('function');
    });

    it('E2E setAuthenticated updates store', () => {
        const auth = useAuth();
        const store = useAuthStore();
        const testUser: User = { id: 'test-id', name: 'Test', email: 'test@test.com' };

        (window as any).__tracklyAuthE2E.setAuthenticated(testUser);
        expect(store.user).toEqual(testUser);
    });

    it('E2E clearAuth resets store', () => {
        const auth = useAuth();
        const store = useAuthStore();

        (window as any).__tracklyAuthE2E.clearAuth();
        // Store should be reset to initial state
        expect(store.isAuthenticated).toBe(false);
    });

    it('_resetForTesting resets store', () => {
        const auth = useAuth();
        const store = useAuthStore();

        auth._resetForTesting();
        // Store should be reset to initial state
        expect(store.isAuthenticated).toBe(false);
    });
});
