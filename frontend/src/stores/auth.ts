import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
    startLogin as oauthStartLogin,
    handleCallback as oauthHandleCallback,
    clearOAuthState
} from '../auth/oauth-client';
import { refreshToken, logout as authLogout } from '../auth/refresh';
import {
    fetchProfile,
    updateProfile as authUpdateProfile,
    deleteAccount as authDeleteAccount
} from '../auth/profile';
import { migrateSessionTracks as authMigrateSessionTracks } from '../auth/migration';
import { getSessionId } from '../utils/session';
import type { User } from '@/types';

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export const useAuthStore = defineStore('auth', () => {
    const accessToken = ref<string | null>(null);
    const tokenExpiresAt = ref<number | null>(null);
    const user = ref<User | null>(null);
    const isInitialized = ref<boolean>(false);
    const isLoading = ref<boolean>(false);
    const error = ref<string | null>(null);

    const isAuthenticated = computed(() => !!accessToken.value && !!user.value);
    const isTokenExpiringSoon = computed(() => {
        if (!tokenExpiresAt.value) return true;
        return Date.now() >= tokenExpiresAt.value - REFRESH_THRESHOLD_MS;
    });

    async function initialize(): Promise<void> {
        if (isInitialized.value) return;
        isLoading.value = true;
        error.value = null;
        try {
            if (await _doRefresh()) {
                await _doFetchProfile();
            }
        } catch {
            /* no session */
        } finally {
            isLoading.value = false;
            isInitialized.value = true;
        }
    }

    async function login(): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await oauthStartLogin({
                onStateSet: () => {
                    const sessionId = getSessionId();
                    if (sessionId) {
                        sessionStorage.setItem('pending_migration_session_id', sessionId);
                    }
                }
            });
        } catch (e: unknown) {
            error.value = e instanceof Error ? e.message : 'Failed to start login';
            isLoading.value = false;
            throw e;
        }
    }

    async function handleCallback(code: string, state: string): Promise<boolean> {
        isLoading.value = true;
        error.value = null;
        try {
            const result = await oauthHandleCallback(code, state);
            accessToken.value = result.accessToken;
            tokenExpiresAt.value = result.expiresAt;
            if (result.user) {
                user.value = result.user;
            } else {
                await _doFetchProfile();
            }
            return true;
        } catch (e: unknown) {
            error.value = e instanceof Error ? e.message : 'Login failed';
            clearOAuthState();
            sessionStorage.removeItem('pending_migration_session_id');
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function logout(): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await authLogout(accessToken.value);
        } finally {
            accessToken.value = null;
            tokenExpiresAt.value = null;
            user.value = null;
            isLoading.value = false;
        }
    }

    async function refresh(): Promise<boolean> {
        return _doRefresh();
    }

    async function fetchUserProfile(): Promise<User | null> {
        return _doFetchProfile();
    }

    async function updateProfile(updates: Partial<User>): Promise<User> {
        await ensureValidToken();
        const result = await authUpdateProfile(accessToken.value!, updates);
        user.value = result;
        return result;
    }

    async function migrateSessionTracks(sessionId: string): Promise<{ tracks_migrated: number; pois_migrated: number }> {
        return authMigrateSessionTracks(accessToken.value!, sessionId);
    }

    async function deleteAccount(): Promise<void> {
        await ensureValidToken();
        await authDeleteAccount(accessToken.value!);
        accessToken.value = null;
        tokenExpiresAt.value = null;
        user.value = null;
    }

    async function ensureValidToken(): Promise<void> {
        if (!accessToken.value) throw new Error('Not authenticated');
        if (isTokenExpiringSoon.value) {
            if (!(await _doRefresh())) throw new Error('Session expired');
        }
    }

    async function getAuthHeader(): Promise<Record<string, string>> {
        if (!accessToken.value) return {};
        await ensureValidToken();
        return { Authorization: `Bearer ${accessToken.value}` };
    }

    async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
        await ensureValidToken();
        return fetch(url, {
            ...options,
            headers: {
                ...(options.headers || {}),
                Authorization: `Bearer ${accessToken.value}`
            }
        });
    }

    // Dev-only E2E hook
    function setE2EAuthenticated(testUser?: User): void {
        accessToken.value = 'e2e-access-token';
        tokenExpiresAt.value = Date.now() + 60 * 60 * 1000;
        user.value = testUser || {
            id: 'e2e-user-id',
            name: 'E2E User',
            email: 'e2e@example.com'
        };
        isInitialized.value = true;
    }

    async function _doRefresh(): Promise<boolean> {
        const result = await refreshToken();
        if (!result) {
            accessToken.value = null;
            tokenExpiresAt.value = null;
            user.value = null;
            return false;
        }
        accessToken.value = result.accessToken;
        tokenExpiresAt.value = result.expiresAt;
        return true;
    }

    async function _doFetchProfile(): Promise<User | null> {
        if (!accessToken.value) return null;
        try {
            user.value = await fetchProfile(accessToken.value);
            return user.value;
        } catch (e) {
            console.error('Failed to fetch user profile:', e);
            return null;
        }
    }

    // Custom $reset for setup store (required for testing)
    function $reset(): void {
        accessToken.value = null;
        tokenExpiresAt.value = null;
        user.value = null;
        isInitialized.value = false;
        isLoading.value = false;
        error.value = null;
    }

    return {
        // State
        accessToken,
        tokenExpiresAt,
        user,
        isInitialized,
        isLoading,
        error,

        // Getters
        isAuthenticated,
        isTokenExpiringSoon,

        // Actions
        initialize,
        login,
        handleCallback,
        logout,
        refresh,
        fetchUserProfile,
        updateProfile,
        migrateSessionTracks,
        deleteAccount,
        ensureValidToken,
        getAuthHeader,
        authFetch,
        setE2EAuthenticated,

        // Testing utility
        $reset
    };
});
