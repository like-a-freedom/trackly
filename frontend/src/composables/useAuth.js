import { ref, computed, readonly } from 'vue';
import { getSessionId } from '../utils/session';

/**
 * Authentication composable for user account management.
 * Handles OAuth2 flow, token management, and session migration.
 */

// Singleton state for authentication
const accessToken = ref(null);
const tokenExpiresAt = ref(null);
const authUser = ref(null);
const isInitialized = ref(false);
const isLoading = ref(false);
const authError = ref(null);

// Token refresh threshold (5 minutes before expiry)
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// API base URL
const API_BASE = '';

/**
 * Parse JWT token to extract payload
 */
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Failed to parse JWT:', e);
        return null;
    }
}

/**
 * Check if token is expired or will expire soon
 */
function isTokenExpiringSoon() {
    if (!tokenExpiresAt.value) return true;
    const now = Date.now();
    return now >= tokenExpiresAt.value - REFRESH_THRESHOLD_MS;
}

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePkce() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return { codeVerifier, codeChallenge };
}

/**
 * Generate random state for CSRF protection
 */
function generateState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function useAuth() {
    const isAuthenticated = computed(() => !!accessToken.value && !!authUser.value);
    const user = computed(() => authUser.value);

    /**
     * Initialize authentication state from refresh token cookie
     */
    async function initialize() {
        if (isInitialized.value) return;
        isLoading.value = true;
        authError.value = null;

        try {
            // Try to refresh token from cookie
            const refreshed = await refresh();
            if (refreshed) {
                await fetchUserProfile();
            }
        } catch (e) {
            // Silent fail - user is not logged in
            console.debug('Auth initialization: no valid session');
        } finally {
            isLoading.value = false;
            isInitialized.value = true;
        }
    }

    /**
     * Start OAuth2 login flow with Google
     */
    async function login() {
        isLoading.value = true;
        authError.value = null;

        try {
            // Generate PKCE challenge
            const { codeVerifier, codeChallenge } = await generatePkce();
            const state = generateState();

            // Store verifier and state for callback
            sessionStorage.setItem('pkce_code_verifier', codeVerifier);
            sessionStorage.setItem('oauth_state', state);

            // Store current session_id for migration after login
            const sessionId = getSessionId();
            if (sessionId) {
                sessionStorage.setItem('pending_migration_session_id', sessionId);
            }

            // Fetch OAuth config from backend
            const configResponse = await fetch(`${API_BASE}/auth/oauth-config`);
            if (!configResponse.ok) {
                throw new Error('Failed to get OAuth configuration');
            }
            const config = await configResponse.json();

            // Build Google OAuth URL
            const params = new URLSearchParams({
                client_id: config.client_id,
                redirect_uri: config.redirect_uri,
                response_type: 'code',
                scope: 'openid email profile',
                state: state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                access_type: 'offline',
                prompt: 'consent'
            });

            // Redirect to Google OAuth
            window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        } catch (e) {
            authError.value = e.message || 'Failed to start login';
            isLoading.value = false;
            throw e;
        }
    }

    /**
     * Handle OAuth callback - exchange code for tokens
     */
    async function handleCallback(code, state) {
        isLoading.value = true;
        authError.value = null;

        try {
            // Verify state
            const savedState = sessionStorage.getItem('oauth_state');
            if (state !== savedState) {
                throw new Error('Invalid OAuth state - possible CSRF attack');
            }

            // Get code verifier
            const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
            if (!codeVerifier) {
                throw new Error('Missing PKCE code verifier');
            }

            // Exchange code for tokens
            const response = await fetch(`${API_BASE}/auth/google/callback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Important for receiving HttpOnly cookie
                body: JSON.stringify({
                    code,
                    state,
                    pkce_verifier: codeVerifier
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to exchange authorization code');
            }

            const data = await response.json();

            // Store access token in memory
            accessToken.value = data.access_token;
            const payload = parseJwt(data.access_token);
            if (payload?.exp) {
                tokenExpiresAt.value = payload.exp * 1000;
            }

            // Set user data
            if (data.user) {
                authUser.value = data.user;
            } else {
                await fetchUserProfile();
            }

            // Clean up sessionStorage
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('pkce_code_verifier');

            // Migrate session tracks if needed
            const pendingSessionId = sessionStorage.getItem('pending_migration_session_id');
            if (pendingSessionId) {
                await migrateSessionTracks(pendingSessionId);
                sessionStorage.removeItem('pending_migration_session_id');
            }

            return true;
        } catch (e) {
            authError.value = e.message || 'Login failed';
            // Clean up on error
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('pkce_code_verifier');
            sessionStorage.removeItem('pending_migration_session_id');
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Refresh access token using refresh token cookie
     */
    async function refresh() {
        try {
            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                credentials: 'include' // Include HttpOnly cookie
            });

            // 204 No Content -> no session (no cookie) - not an error
            if (response.status === 204) {
                return false;
            }

            if (!response.ok) {
                // Clear tokens on refresh failure
                accessToken.value = null;
                tokenExpiresAt.value = null;
                authUser.value = null;
                return false;
            }

            const data = await response.json();
            accessToken.value = data.access_token;

            const payload = parseJwt(data.access_token);
            if (payload?.exp) {
                tokenExpiresAt.value = payload.exp * 1000;
            }

            return true;
        } catch (e) {
            console.error('Token refresh failed:', e);
            accessToken.value = null;
            tokenExpiresAt.value = null;
            authUser.value = null;
            return false;
        }
    }

    /**
     * Logout - invalidate refresh token and clear state
     */
    async function logout() {
        isLoading.value = true;
        authError.value = null;

        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: accessToken.value
                    ? { Authorization: `Bearer ${accessToken.value}` }
                    : {}
            });
        } catch (e) {
            console.error('Logout request failed:', e);
            // Continue with local cleanup even if request fails
        } finally {
            // Clear local state
            accessToken.value = null;
            tokenExpiresAt.value = null;
            authUser.value = null;
            isLoading.value = false;
        }
    }

    /**
     * Fetch user profile from API
     */
    async function fetchUserProfile() {
        if (!accessToken.value) return null;

        try {
            const response = await fetch(`${API_BASE}/api/account/me`, {
                headers: {
                    Authorization: `Bearer ${accessToken.value}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch user profile');
            }

            authUser.value = await response.json();
            return authUser.value;
        } catch (e) {
            console.error('Failed to fetch user profile:', e);
            return null;
        }
    }

    /**
     * Update user profile
     */
    async function updateProfile(updates) {
        await ensureValidToken();

        const response = await fetch(`${API_BASE}/api/account/profile`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken.value}`
            },
            body: JSON.stringify(updates)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Failed to update profile');
        }

        authUser.value = await response.json();
        return authUser.value;
    }

    /**
     * Migrate anonymous session tracks to user account
     */
    async function migrateSessionTracks(sessionId) {
        if (!accessToken.value || !sessionId) return { migrated_count: 0 };

        try {
            const response = await fetch(`${API_BASE}/auth/migrate-session-tracks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken.value}`
                },
                body: JSON.stringify({ session_id: sessionId })
            });

            if (!response.ok) {
                console.error('Track migration failed');
                return { migrated_count: 0 };
            }

            return await response.json();
        } catch (e) {
            console.error('Track migration error:', e);
            return { migrated_count: 0 };
        }
    }

    /**
     * Delete user account
     */
    async function deleteAccount() {
        await ensureValidToken();

        const response = await fetch(`${API_BASE}/api/account`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken.value}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Failed to delete account');
        }

        // Clear local state
        accessToken.value = null;
        tokenExpiresAt.value = null;
        authUser.value = null;
    }

    /**
     * Ensure access token is valid, refresh if needed
     */
    async function ensureValidToken() {
        if (!accessToken.value) {
            throw new Error('Not authenticated');
        }

        if (isTokenExpiringSoon()) {
            const refreshed = await refresh();
            if (!refreshed) {
                throw new Error('Session expired');
            }
        }
    }

    /**
     * Get authorization header for API requests
     */
    async function getAuthHeader() {
        if (!accessToken.value) return {};

        await ensureValidToken();
        return { Authorization: `Bearer ${accessToken.value}` };
    }

    /**
     * Make authenticated fetch request
     */
    async function authFetch(url, options = {}) {
        await ensureValidToken();

        const headers = {
            ...options.headers,
            Authorization: `Bearer ${accessToken.value}`
        };

        return fetch(url, { ...options, headers });
    }

    /**
     * Reset all state - ONLY for testing purposes
     * @private
     */
    function _resetForTesting() {
        accessToken.value = null;
        tokenExpiresAt.value = null;
        authUser.value = null;
        isInitialized.value = false;
        isLoading.value = false;
        authError.value = null;
    }

    // Dev-only hook for E2E tests to simulate authenticated state
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
        // State
        isAuthenticated,
        isInitialized: readonly(isInitialized),
        isLoading: readonly(isLoading),
        user,
        error: readonly(authError),
        accessToken: readonly(accessToken),

        // Methods
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

        // Testing only
        _resetForTesting
    };
}
