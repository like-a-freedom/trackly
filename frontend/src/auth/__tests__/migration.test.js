import { describe, it, expect, vi, afterEach } from 'vitest';
import { migrateSessionTracks } from '../migration.js';

describe('migration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('migrateSessionTracks', () => {
        it('returns zero migration when no token', async () => {
            const result = await migrateSessionTracks(null, 'session-123');
            expect(result).toEqual({ tracks_migrated: 0, pois_migrated: 0 });
        });

        it('returns zero migration when no sessionId', async () => {
            const result = await migrateSessionTracks('token', null);
            expect(result).toEqual({ tracks_migrated: 0, pois_migrated: 0 });
        });

        it('returns migration counts from server', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ tracks_migrated: 5, pois_migrated: 12 })
            }));

            const result = await migrateSessionTracks('token', 'session-123');
            expect(result).toEqual({ tracks_migrated: 5, pois_migrated: 12 });
        });
    });
});
