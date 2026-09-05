import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshToken, logout } from '../refresh';

// Mock pkce module
vi.mock('../pkce', () => ({
    parseJwt: vi.fn(),
}));

import { parseJwt } from '../pkce';

describe('refresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('refreshToken', () => {
        it('should return null on 204 response', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                status: 204,
                ok: false,
            });

            const result = await refreshToken();

            expect(result).toBeNull();
        });

        it('should return null on non-ok response', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                status: 401,
                ok: false,
            });

            const result = await refreshToken();

            expect(result).toBeNull();
        });

        it('should return token data on success', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: () => Promise.resolve({ access_token: 'test-token' }),
            });
            (parseJwt as ReturnType<typeof vi.fn>).mockReturnValue({ exp: '1234567890' });

            const result = await refreshToken();

            expect(result).toEqual({
                accessToken: 'test-token',
                expiresAt: 1234567890000,
            });
        });

        it('should handle token without exp claim', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: () => Promise.resolve({ access_token: 'test-token' }),
            });
            (parseJwt as ReturnType<typeof vi.fn>).mockReturnValue(null);

            const result = await refreshToken();

            expect(result).toEqual({
                accessToken: 'test-token',
                expiresAt: null,
            });
        });

        it('should return null on network error', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
                new Error('Network error')
            );

            const result = await refreshToken();

            expect(result).toBeNull();
        });
    });

    describe('logout', () => {
        it('should send logout request with auth header', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

            await logout('test-token');

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/auth/logout'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { Authorization: 'Bearer test-token' },
                })
            );
        });

        it('should send logout request without auth header when token is null', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

            await logout(null);

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/auth/logout'),
                expect.objectContaining({
                    method: 'POST',
                    headers: {},
                })
            );
        });

        it('should not throw on network error', async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
                new Error('Network error')
            );

            await expect(logout('test-token')).resolves.toBeUndefined();
        });
    });
});
