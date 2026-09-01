import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startLogin, handleCallback, clearOAuthState } from '../oauth-client.js';

describe('oauth-client', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('startLogin', () => {
        it('stores PKCE verifier and state in sessionStorage', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ client_id: 'test', redirect_uri: 'http://localhost' })
            }));
            vi.stubGlobal('window', { location: { href: '' } });

            await startLogin();

            expect(sessionStorage.getItem('pkce_code_verifier')).toBeTruthy();
            expect(sessionStorage.getItem('oauth_state')).toMatch(/^[0-9a-f]{32}$/);
        });

        it('calls onStateSet callback with the generated state', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ client_id: 'test', redirect_uri: 'http://localhost' })
            }));
            vi.stubGlobal('window', { location: { href: '' } });
            const onStateSet = vi.fn();

            await startLogin({ onStateSet });

            expect(onStateSet).toHaveBeenCalledTimes(1);
            expect(typeof onStateSet.mock.calls[0][0]).toBe('string');
        });
    });

    describe('clearOAuthState', () => {
        it('removes OAuth-related keys from sessionStorage', () => {
            sessionStorage.setItem('oauth_state', 'test');
            sessionStorage.setItem('pkce_code_verifier', 'verifier');
            sessionStorage.setItem('pending_migration_session_id', 'session');

            clearOAuthState();

            expect(sessionStorage.getItem('oauth_state')).toBeNull();
            expect(sessionStorage.getItem('pkce_code_verifier')).toBeNull();
            expect(sessionStorage.getItem('pending_migration_session_id')).toBeNull();
        });
    });
});
