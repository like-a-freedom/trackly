import { ref, computed, readonly } from 'vue';
import { getSessionId } from '../utils/session';
import { generatePkce, generateState, parseJwt } from '../auth/pkce.js';
import {
    startLogin as oauthStartLogin,
    handleCallback as oauthHandleCallback,
    clearOAuthState
} from '../auth/oauth-client.js';
import { refreshToken, logout as authLogout } from '../auth/refresh.js';
import {
    fetchProfile,
    updateProfile as authUpdateProfile,
    deleteAccount as authDeleteAccount
} from '../auth/profile.js';
import { migrateSessionTracks as authMigrateSessionTracks } from '../auth/migration.js';

const accessToken = ref(null);
const tokenExpiresAt = ref(null);
const authUser = ref(null);
const isInitialized = ref(false);
const isLoading = ref(false);
const authError = ref(null);

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

function isTokenExpiringSoon() {
    if (!tokenExpiresAt.value) return true;
    return Date.now() >= tokenExpiresAt.value - REFRESH_THRESHOLD_MS;
}

export function useAuth() {
    const isAuthenticated = computed(() => !!accessToken.value && !!authUser.value);
    const user = computed(() => authUser.value);

    async function doRefresh() {
        const result = await refreshToken();
        if (!result) {
            accessToken.value = null;
            tokenExpiresAt.value = null;
            authUser.value = null;
            return false;
        }
        accessToken.value = result.accessToken;
        tokenExpiresAt.value = result.expiresAt;
        return true;
    }

    async function doFetchUserProfile() {
        if (!accessToken.value) return null;
        try {
            authUser.value = await fetchProfile(accessToken.value);
            return authUser.value;
        } catch (e) {
            console.error('Failed to fetch user profile:', e);
            return null;
        }
    }

    async function initialize() {
        if (isInitialized.value) return;
        isLoading.value = true;
        authError.value = null;
        try {
            if (await doRefresh()) await doFetchUserProfile();
        } catch {
            console.debug('Auth initialization: no valid session');
        } finally {
            isLoading.value = false;
            isInitialized.value = true;
        }
    }

    async function login() {
        isLoading.value = true;
        authError.value = null;
        try {
            await oauthStartLogin({
                onStateSet: () => {
                    const sessionId = getSessionId();
                    if (sessionId) sessionStorage.setItem('pending_migration_session_id', sessionId);
                }
            });
        } catch (e) {
            authError.value = e.message || 'Failed to start login';
            isLoading.value = false;
            throw e;
        }
    }

    async function handleCallback(code, state) {
        isLoading.value = true;
        authError.value = null;
        try {
            const result = await oauthHandleCallback(code, state);
            accessToken.value = result.accessToken;
            tokenExpiresAt.value = result.expiresAt;
            if (result.user) {
                authUser.value = result.user;
            } else {
                await doFetchUserProfile();
            }
            return true;
        } catch (e) {
            authError.value = e.message || 'Login failed';
            clearOAuthState();
            sessionStorage.removeItem('pending_migration_session_id');
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function logout() {
        isLoading.value = true;
        authError.value = null;
        try {
            await authLogout(accessToken.value);
        } finally {
            accessToken.value = null;
            tokenExpiresAt.value = null;
            authUser.value = null;
            isLoading.value = false;
        }
    }

    async function refresh() {
        return doRefresh();
    }

    async function fetchUserProfile() {
        return doFetchUserProfile();
    }

    async function updateProfile(updates) {
        await ensureValidToken();
        const result = await authUpdateProfile(accessToken.value, updates);
        authUser.value = result;
        return result;
    }

    async function migrateSessionTracks(sessionId) {
        return authMigrateSessionTracks(accessToken.value, sessionId);
    }

    async function deleteAccount() {
        await ensureValidToken();
        await authDeleteAccount(accessToken.value);
        accessToken.value = null;
        tokenExpiresAt.value = null;
        authUser.value = null;
    }

    async function ensureValidToken() {
        if (!accessToken.value) throw new Error('Not authenticated');
        if (isTokenExpiringSoon()) {
            if (!(await doRefresh())) throw new Error('Session expired');
        }
    }

    async function getAuthHeader() {
        if (!accessToken.value) return {};
        await ensureValidToken();
        return { Authorization: `Bearer ${accessToken.value}` };
    }

    async function authFetch(url, options = {}) {
        await ensureValidToken();
        return fetch(url, {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${accessToken.value}` }
        });
    }

    function _resetForTesting() {
        accessToken.value = null;
        tokenExpiresAt.value = null;
        authUser.value = null;
        isInitialized.value = false;
        isLoading.value = false;
        authError.value = null;
    }

    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
        window.__tracklyAuthE2E = {
            setAuthenticated(testUser) {
                accessToken.value = 'e2e-access-token';
                tokenExpiresAt.value = Date.now() + 60 * 60 * 1000;
                authUser.value = testUser || {
                    name: 'E2E User',
                    email: 'e2e@example.com',
                    avatar_url: null
                };
                isInitialized.value = true;
            },
            clearAuth() {
                _resetForTesting();
            }
        };
    }

    return {
        isAuthenticated,
        isInitialized: readonly(isInitialized),
        isLoading: readonly(isLoading),
        user,
        error: readonly(authError),
        accessToken: readonly(accessToken),
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
        _resetForTesting
    };
}
