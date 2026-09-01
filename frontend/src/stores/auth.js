import { defineStore } from 'pinia';
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
import { getSessionId } from '../utils/session';

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export const useAuthStore = defineStore('auth', {
    state: () => ({
        accessToken: null,
        tokenExpiresAt: null,
        user: null,
        isInitialized: false,
        isLoading: false,
        error: null
    }),

    getters: {
        isAuthenticated: (state) => !!state.accessToken && !!state.user,
        isTokenExpiringSoon: (state) => {
            if (!state.tokenExpiresAt) return true;
            return Date.now() >= state.tokenExpiresAt - REFRESH_THRESHOLD_MS;
        }
    },

    actions: {
        async initialize() {
            if (this.isInitialized) return;
            this.isLoading = true;
            this.error = null;
            try {
                if (await this._doRefresh()) {
                    await this._doFetchProfile();
                }
            } catch {
                /* no session */
            } finally {
                this.isLoading = false;
                this.isInitialized = true;
            }
        },

        async login() {
            this.isLoading = true;
            this.error = null;
            try {
                await oauthStartLogin({
                    onStateSet: () => {
                        const sessionId = getSessionId();
                        if (sessionId) {
                            sessionStorage.setItem('pending_migration_session_id', sessionId);
                        }
                    }
                });
            } catch (e) {
                this.error = e.message || 'Failed to start login';
                this.isLoading = false;
                throw e;
            }
        },

        async handleCallback(code, state) {
            this.isLoading = true;
            this.error = null;
            try {
                const result = await oauthHandleCallback(code, state);
                this.accessToken = result.accessToken;
                this.tokenExpiresAt = result.expiresAt;
                if (result.user) {
                    this.user = result.user;
                } else {
                    await this._doFetchProfile();
                }
                return true;
            } catch (e) {
                this.error = e.message || 'Login failed';
                clearOAuthState();
                sessionStorage.removeItem('pending_migration_session_id');
                throw e;
            } finally {
                this.isLoading = false;
            }
        },

        async logout() {
            this.isLoading = true;
            this.error = null;
            try {
                await authLogout(this.accessToken);
            } finally {
                this.accessToken = null;
                this.tokenExpiresAt = null;
                this.user = null;
                this.isLoading = false;
            }
        },

        async refresh() {
            return this._doRefresh();
        },

        async fetchUserProfile() {
            return this._doFetchProfile();
        },

        async updateProfile(updates) {
            await this.ensureValidToken();
            const result = await authUpdateProfile(this.accessToken, updates);
            this.user = result;
            return result;
        },

        async migrateSessionTracks(sessionId) {
            return authMigrateSessionTracks(this.accessToken, sessionId);
        },

        async deleteAccount() {
            await this.ensureValidToken();
            await authDeleteAccount(this.accessToken);
            this.accessToken = null;
            this.tokenExpiresAt = null;
            this.user = null;
        },

        async ensureValidToken() {
            if (!this.accessToken) throw new Error('Not authenticated');
            if (this.isTokenExpiringSoon) {
                if (!(await this._doRefresh())) throw new Error('Session expired');
            }
        },

        async getAuthHeader() {
            if (!this.accessToken) return {};
            await this.ensureValidToken();
            return { Authorization: `Bearer ${this.accessToken}` };
        },

        async authFetch(url, options = {}) {
            await this.ensureValidToken();
            return fetch(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    Authorization: `Bearer ${this.accessToken}`
                }
            });
        },

        // Dev-only E2E hook
        setE2EAuthenticated(testUser) {
            this.accessToken = 'e2e-access-token';
            this.tokenExpiresAt = Date.now() + 60 * 60 * 1000;
            this.user = testUser || {
                name: 'E2E User',
                email: 'e2e@example.com',
                avatar_url: null
            };
            this.isInitialized = true;
        },

        async _doRefresh() {
            const result = await refreshToken();
            if (!result) {
                this.accessToken = null;
                this.tokenExpiresAt = null;
                this.user = null;
                return false;
            }
            this.accessToken = result.accessToken;
            this.tokenExpiresAt = result.expiresAt;
            return true;
        },

        async _doFetchProfile() {
            if (!this.accessToken) return null;
            try {
                this.user = await fetchProfile(this.accessToken);
                return this.user;
            } catch (e) {
                console.error('Failed to fetch user profile:', e);
                return null;
            }
        }
    }
});
