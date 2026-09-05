import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateSessionTracks } from '../migration';

describe('migration', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('returns zero counts when no access token provided', async () => {
        const result = await migrateSessionTracks('', 'session-123');
        expect(result).toEqual({ tracks_migrated: 0, pois_migrated: 0 });
    });

    it('returns zero counts when no session ID provided', async () => {
        const result = await migrateSessionTracks('token', '');
        expect(result).toEqual({ tracks_migrated: 0, pois_migrated: 0 });
    });

    it('migrates tracks successfully', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ tracks_migrated: 5, pois_migrated: 3 })
        });

        const result = await migrateSessionTracks('valid-token', 'session-123');
        expect(result).toEqual({ tracks_migrated: 5, pois_migrated: 3 });
        expect(fetch).toHaveBeenCalledWith('/api/auth/migrate-session-tracks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer valid-token'
            },
            body: JSON.stringify({ session_id: 'session-123' })
        });
    });

    it('handles alternative response format with migrated_count', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ migrated_count: 10 })
        });

        const result = await migrateSessionTracks('token', 'session');
        expect(result.tracks_migrated).toBe(10);
        expect(result.pois_migrated).toBe(0);
    });

    it('returns zero counts on failed migration', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500
        });

        const result = await migrateSessionTracks('token', 'session');
        expect(result).toEqual({ tracks_migrated: 0, pois_migrated: 0 });
    });

    it('returns zero counts on network error', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const result = await migrateSessionTracks('token', 'session');
        expect(result).toEqual({ tracks_migrated: 0, pois_migrated: 0 });
    });
});
