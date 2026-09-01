import { describe, it, expect, vi, afterEach } from 'vitest';
import { refreshToken, logout } from '../refresh.js';

describe('refresh', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('refreshToken', () => {
        it('returns token data on successful refresh', async () => {
            const fakePayload = { exp: Math.floor(Date.now() / 1000) + 3600 };
            const fakeToken = `header.${btoa(JSON.stringify(fakePayload))}.sig`;
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ access_token: fakeToken })
            }));

            const result = await refreshToken();
            expect(result).not.toBeNull();
            expect(result.accessToken).toBe(fakeToken);
            expect(result.expiresAt).toBeGreaterThan(Date.now());
        });

        it('returns null on 204 (no session)', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                status: 204,
                ok: true
            }));

            const result = await refreshToken();
            expect(result).toBeNull();
        });

        it('returns null on network error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network')));

            const result = await refreshToken();
            expect(result).toBeNull();
        });
    });

    describe('logout', () => {
        it('calls the logout endpoint', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            vi.stubGlobal('fetch', mockFetch);

            await logout('test-token');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/auth/logout'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });
});
