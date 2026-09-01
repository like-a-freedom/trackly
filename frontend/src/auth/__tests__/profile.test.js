import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProfile, updateProfile, deleteAccount } from '../profile.js';

describe('profile', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchProfile', () => {
        it('returns user data on success', async () => {
            const fakeUser = { name: 'Test', email: 'test@example.com' };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(fakeUser)
            }));

            const user = await fetchProfile('token');
            expect(user).toEqual(fakeUser);
        });

        it('returns null when no token', async () => {
            const result = await fetchProfile(null);
            expect(result).toBeNull();
        });
    });

    describe('updateProfile', () => {
        it('sends PATCH with correct body', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ name: 'Updated' })
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await updateProfile('token', { name: 'Updated' });
            expect(result).toEqual({ name: 'Updated' });
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/account/profile'),
                expect.objectContaining({ method: 'PATCH' })
            );
        });
    });

    describe('deleteAccount', () => {
        it('sends DELETE request', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            vi.stubGlobal('fetch', mockFetch);

            await deleteAccount('token');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/account'),
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });
});
