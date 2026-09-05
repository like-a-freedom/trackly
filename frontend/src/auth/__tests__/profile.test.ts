import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProfile, updateProfile, deleteAccount } from '../profile';

describe('profile', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchProfile', () => {
        it('returns null when no access token provided', async () => {
            const result = await fetchProfile('');
            expect(result).toBeNull();
        });

        it('fetches profile successfully', async () => {
            const mockUser = { id: '1', name: 'Test User', email: 'test@example.com' };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockUser)
            });

            const result = await fetchProfile('valid-token');
            expect(result).toEqual(mockUser);
            expect(fetch).toHaveBeenCalledWith('/api/account/me', {
                headers: { Authorization: 'Bearer valid-token' }
            });
        });

        it('throws error on failed fetch', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401
            });

            await expect(fetchProfile('invalid-token')).rejects.toThrow('Failed to fetch user profile');
        });
    });

    describe('updateProfile', () => {
        it('updates profile successfully', async () => {
            const mockUser = { id: '1', name: 'Updated Name' };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockUser)
            });

            const result = await updateProfile('valid-token', { name: 'Updated Name' });
            expect(result).toEqual(mockUser);
            expect(fetch).toHaveBeenCalledWith('/api/account/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer valid-token'
                },
                body: JSON.stringify({ name: 'Updated Name' })
            });
        });

        it('throws error with message on failed update', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ message: 'Validation failed' })
            });

            await expect(updateProfile('token', { name: '' })).rejects.toThrow('Validation failed');
        });

        it('throws error with default message when no error data', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.reject(new Error('Invalid JSON'))
            });

            await expect(updateProfile('token', {})).rejects.toThrow('Failed to update profile');
        });
    });

    describe('deleteAccount', () => {
        it('deletes account successfully', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true
            });

            await expect(deleteAccount('valid-token')).resolves.toBeUndefined();
            expect(fetch).toHaveBeenCalledWith('/api/account', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer valid-token' },
                credentials: 'include'
            });
        });

        it('throws error with message on failed delete', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ message: 'Cannot delete account' })
            });

            await expect(deleteAccount('token')).rejects.toThrow('Cannot delete account');
        });

        it('throws error with default message when no error data', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.reject(new Error('Invalid JSON'))
            });

            await expect(deleteAccount('token')).rejects.toThrow('Failed to delete account');
        });
    });
});
