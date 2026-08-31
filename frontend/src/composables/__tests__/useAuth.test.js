import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuth } from '../useAuth';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto API
Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => 'test-uuid-1234',
        getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        },
        subtle: {
            digest: async (algorithm, data) => {
                // Simple mock implementation
                return new ArrayBuffer(32);
            }
        }
    },
    writable: true
});

// Mock sessionStorage
const mockSessionStorage = {};
Object.defineProperty(global, 'sessionStorage', {
    value: {
        getItem: (key) => mockSessionStorage[key] || null,
        setItem: (key, value) => { mockSessionStorage[key] = value; },
        removeItem: (key) => { delete mockSessionStorage[key]; },
        clear: () => { Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]); }
    },
    writable: true
});

// Mock localStorage for session.js
const mockLocalStorage = {};
Object.defineProperty(global, 'localStorage', {
    value: {
        getItem: (key) => mockLocalStorage[key] || null,
        setItem: (key, value) => { mockLocalStorage[key] = value; },
        removeItem: (key) => { delete mockLocalStorage[key]; },
        clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }
    },
    writable: true
});

describe('useAuth composable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
        sessionStorage.clear();
        localStorage.clear();
        // Reset singleton state before each test
        const { _resetForTesting } = useAuth();
        _resetForTesting();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initial state', () => {
        it('should have correct initial state', () => {
            const { isAuthenticated, isInitialized, isLoading, user, error } = useAuth();

            expect(isAuthenticated.value).toBe(false);
            expect(isInitialized.value).toBe(false);
            expect(isLoading.value).toBe(false);
            expect(user.value).toBe(null);
            expect(error.value).toBe(null);
        });
    });

    describe('initialize', () => {
        it('should attempt to refresh token on initialization', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            const { initialize, isInitialized } = useAuth();
            await initialize();

            expect(isInitialized.value).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include'
            });
        });

        it('should set authenticated state on successful refresh', async () => {
            const mockToken = createMockJwt({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 });

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ access_token: mockToken })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        user_id: 'user-123',
                        email: 'test@example.com',
                        name: 'Test User'
                    })
                });

            const { initialize, isAuthenticated, user } = useAuth();
            await initialize();

            expect(isAuthenticated.value).toBe(true);
            expect(user.value).toEqual({
                user_id: 'user-123',
                email: 'test@example.com',
                name: 'Test User'
            });
        });

        it('should not reinitialize if already initialized', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            const { initialize, isInitialized } = useAuth();
            await initialize();
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Try to initialize again
            await initialize();
            expect(mockFetch).toHaveBeenCalledTimes(1); // Should not call fetch again
        });
    });

    describe('handleCallback', () => {
        it('should throw error on state mismatch', async () => {
            sessionStorage.setItem('oauth_state', 'saved-state');
            sessionStorage.setItem('pkce_code_verifier', 'test-verifier');

            const { handleCallback } = useAuth();

            await expect(handleCallback('auth-code', 'wrong-state'))
                .rejects.toThrow('Invalid OAuth state - possible CSRF attack');
        });

        it('should throw error when code verifier is missing', async () => {
            sessionStorage.setItem('oauth_state', 'saved-state');
            // Not setting pkce_code_verifier

            const { handleCallback } = useAuth();

            await expect(handleCallback('auth-code', 'saved-state'))
                .rejects.toThrow('Missing PKCE code verifier');
        });

        it('should exchange code for tokens successfully', async () => {
            sessionStorage.setItem('oauth_state', 'saved-state');
            sessionStorage.setItem('pkce_code_verifier', 'test-verifier');

            const mockToken = createMockJwt({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: mockToken,
                    user: {
                        user_id: 'user-123',
                        email: 'test@example.com',
                        name: 'Test User'
                    }
                })
            });

            const { handleCallback, isAuthenticated, user } = useAuth();
            const result = await handleCallback('auth-code', 'saved-state');

            expect(result).toBe(true);
            expect(isAuthenticated.value).toBe(true);
            expect(user.value.email).toBe('test@example.com');
            expect(mockFetch).toHaveBeenCalledWith('/api/auth/google/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    code: 'auth-code',
                    state: 'saved-state',
                    pkce_verifier: 'test-verifier'
                })
            });
        });

        it('should clean up sessionStorage on error', async () => {
            sessionStorage.setItem('oauth_state', 'saved-state');
            sessionStorage.setItem('pkce_code_verifier', 'test-verifier');
            sessionStorage.setItem('pending_migration_session_id', 'session-123');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                json: async () => ({ message: 'Invalid code' })
            });

            const { handleCallback } = useAuth();

            await expect(handleCallback('invalid-code', 'saved-state'))
                .rejects.toThrow('Invalid code');

            expect(sessionStorage.getItem('oauth_state')).toBe(null);
            expect(sessionStorage.getItem('pkce_code_verifier')).toBe(null);
            expect(sessionStorage.getItem('pending_migration_session_id')).toBe(null);
        });
    });

    describe('logout', () => {
        it('should call logout endpoint and clear state', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Logged out' })
            });

            const { logout, isAuthenticated } = useAuth();
            await logout();

            expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {}
            });
            expect(isAuthenticated.value).toBe(false);
        });

        it('should clear state even if request fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const { logout, isAuthenticated } = useAuth();
            await logout();

            expect(isAuthenticated.value).toBe(false);
        });
    });

    describe('refresh', () => {
        it('should refresh token successfully', async () => {
            const mockToken = createMockJwt({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: mockToken })
            });

            const { refresh, accessToken } = useAuth();
            const result = await refresh();

            expect(result).toBe(true);
            expect(accessToken.value).toBe(mockToken);
        });

        it('should clear state on refresh failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            const { refresh, isAuthenticated } = useAuth();
            const result = await refresh();

            expect(result).toBe(false);
            expect(isAuthenticated.value).toBe(false);
        });
    });

    describe('updateProfile', () => {
        it('should update profile successfully', async () => {
            // First, set up authenticated state
            const mockToken = createMockJwt({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 });

            // Mock the fetch calls
            mockFetch
                // For refresh check
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ access_token: mockToken })
                })
                // For profile update
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        user_id: 'user-123',
                        email: 'test@example.com',
                        name: 'Test User',
                        nickname: 'testuser'
                    })
                });

            const { refresh, updateProfile, user } = useAuth();
            await refresh();

            const result = await updateProfile({ nickname: 'testuser' });

            expect(result.nickname).toBe('testuser');
            expect(user.value.nickname).toBe('testuser');
        });

        it('should throw error when not authenticated', async () => {
            const { updateProfile } = useAuth();

            await expect(updateProfile({ nickname: 'test' }))
                .rejects.toThrow('Not authenticated');
        });
    });

    describe('migrateSessionTracks', () => {
        it('should migrate tracks successfully', async () => {
            const mockToken = createMockJwt({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 });

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ access_token: mockToken })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ tracks_migrated: 5, pois_migrated: 2 })
                });

            const { refresh, migrateSessionTracks } = useAuth();
            await refresh();

            const result = await migrateSessionTracks('session-123');

            expect(result.tracks_migrated).toBe(5);
            expect(result.pois_migrated).toBe(2);
            expect(mockFetch).toHaveBeenLastCalledWith('/api/auth/migrate-session-tracks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockToken}`
                },
                body: JSON.stringify({ session_id: 'session-123' })
            });
        });

        it('should return zero count when not authenticated', async () => {
            const { migrateSessionTracks } = useAuth();
            const result = await migrateSessionTracks('session-123');

            expect(result.tracks_migrated).toBe(0);
            expect(result.pois_migrated).toBe(0);
        });
    });

    describe('getAuthHeader', () => {
        it('should return empty object when not authenticated', async () => {
            const { getAuthHeader } = useAuth();
            const header = await getAuthHeader();

            expect(header).toEqual({});
        });

        it('should return authorization header when authenticated', async () => {
            const mockToken = createMockJwt({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: mockToken })
            });

            const { refresh, getAuthHeader } = useAuth();
            await refresh();

            const header = await getAuthHeader();

            expect(header).toEqual({ Authorization: `Bearer ${mockToken}` });
        });
    });
});

// Helper function to create mock JWT
function createMockJwt(payload) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadBase64 = btoa(JSON.stringify(payload));
    const signature = 'mock-signature';
    return `${header}.${payloadBase64}.${signature}`;
}
