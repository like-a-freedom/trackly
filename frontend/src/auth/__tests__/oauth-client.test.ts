import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startLogin, handleCallback, clearOAuthState } from '../oauth-client';

// Mock pkce module
vi.mock('../pkce', () => ({
    generatePkce: vi.fn().mockResolvedValue({
        codeVerifier: 'test-verifier',
        codeChallenge: 'test-challenge',
    }),
    generateState: vi.fn().mockReturnValue('test-state'),
    parseJwt: vi.fn().mockReturnValue({ exp: '1234567890' }),
}));

describe('oauth-client', () => {
    let sessionStore: Record<string, string> = {};
    const originalLocation = window.location;

    beforeEach(() => {
        sessionStore = {};

        // Spy on sessionStorage methods
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => sessionStore[key] || null);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
            sessionStore[key] = value;
        });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
            delete sessionStore[key];
        });

        // Mock fetch
        global.fetch = vi.fn();

        // Mock window.location
        delete (window as any).location;
        (window as any).location = { href: '' };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        (window as any).location = originalLocation;
    });

    describe('startLogin', () => {
        it('should store PKCE verifier and state in sessionStorage', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    client_id: 'test-client-id',
                    redirect_uri: 'http://localhost/callback',
                }),
            });

            await startLogin();

            expect(sessionStore['pkce_code_verifier']).toBe('test-verifier');
            expect(sessionStore['oauth_state']).toBe('test-state');
        });

        it('should call onStateSet callback', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    client_id: 'test-client-id',
                    redirect_uri: 'http://localhost/callback',
                }),
            });

            const onStateSet = vi.fn();
            await startLogin({ onStateSet });

            expect(onStateSet).toHaveBeenCalledWith('test-state');
        });

        it('should redirect to Google OAuth', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    client_id: 'test-client-id',
                    redirect_uri: 'http://localhost/callback',
                }),
            });

            await startLogin();

            expect(window.location.href).toContain('https://accounts.google.com/o/oauth2/v2/auth');
            expect(window.location.href).toContain('client_id=test-client-id');
        });

        it('should throw error when OAuth config fetch fails', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: false,
            });

            await expect(startLogin()).rejects.toThrow('Failed to get OAuth configuration');
        });
    });

    describe('handleCallback', () => {
        beforeEach(() => {
            // Set up sessionStorage with valid state
            sessionStore = {
                oauth_state: 'test-state',
                pkce_code_verifier: 'test-verifier',
            };
        });

        it('should exchange code for tokens', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'test-token',
                    user: { id: '1', email: 'test@example.com' },
                }),
            });

            const result = await handleCallback('test-code', 'test-state');

            expect(result.accessToken).toBe('test-token');
            expect(result.user).toEqual({ id: '1', email: 'test@example.com' });
            expect(sessionStore['oauth_state']).toBeUndefined();
            expect(sessionStore['pkce_code_verifier']).toBeUndefined();
        });

        it('should throw error for invalid state', async () => {
            await expect(handleCallback('test-code', 'wrong-state'))
                .rejects.toThrow('Invalid OAuth state');
        });

        it('should throw error for missing code verifier', async () => {
            sessionStore = { oauth_state: 'test-state' }; // No verifier

            await expect(handleCallback('test-code', 'test-state'))
                .rejects.toThrow('Missing PKCE code verifier');
        });

        it('should throw error when callback fails', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ message: 'Invalid code' }),
            });

            await expect(handleCallback('test-code', 'test-state'))
                .rejects.toThrow('Invalid code');
        });

        it('should handle missing user in response', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'test-token',
                }),
            });

            const result = await handleCallback('test-code', 'test-state');

            expect(result.user).toBeNull();
        });
    });

    describe('clearOAuthState', () => {
        it('should clear all OAuth state from sessionStorage', () => {
            sessionStore = {
                oauth_state: 'test',
                pkce_code_verifier: 'test',
                pending_migration_session_id: 'test',
            };

            clearOAuthState();

            expect(sessionStore['oauth_state']).toBeUndefined();
            expect(sessionStore['pkce_code_verifier']).toBeUndefined();
            expect(sessionStore['pending_migration_session_id']).toBeUndefined();
        });
    });
});
