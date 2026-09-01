const API_BASE = '';

/**
 * Migrate anonymous session tracks to user account.
 *
 * @param {string} accessToken - Current access token
 * @param {string} sessionId - Anonymous session ID to migrate from
 * @returns {Promise<{ tracks_migrated: number, pois_migrated: number }>}
 */
export async function migrateSessionTracks(accessToken, sessionId) {
    if (!accessToken || !sessionId) {
        return { tracks_migrated: 0, pois_migrated: 0 };
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/migrate-session-tracks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ session_id: sessionId })
        });

        if (!response.ok) {
            console.error('Track migration failed');
            return { tracks_migrated: 0, pois_migrated: 0 };
        }

        const data = await response.json();
        return {
            tracks_migrated: Number(data.tracks_migrated ?? data.migrated_count ?? 0),
            pois_migrated: Number(data.pois_migrated ?? 0)
        };
    } catch (e) {
        console.error('Track migration error:', e);
        return { tracks_migrated: 0, pois_migrated: 0 };
    }
}
