import { getSessionId } from '../../utils/session.js';
import { getDefaultSegmentColor } from './trackGeometryUtils.js';

const API_BASE = '';

function buildWaypointsPayload(store) {
    const waypointsPayload = [];
    for (const seg of store.segments) {
        for (const idx of seg.waypoints) {
            if (idx < seg.points.length) {
                waypointsPayload.push({
                    lat: seg.points[idx][0],
                    lon: seg.points[idx][1],
                    index: idx,
                });
            }
        }
    }
    return waypointsPayload;
}

function buildSegmentMetaPayload(store) {
    return store.segments.map((seg, index) => ({
        name: seg.name ?? null,
        color: seg.color || getDefaultSegmentColor(index),
    }));
}

function toGeoJSON(store) {
    const coords = store.segments
        .filter((s) => s.points.length >= 2)
        .map((s) => s.points.map(([lat, lng]) => [lng, lat]));

    if (coords.length === 0) return null;

    return {
        type: 'MultiLineString',
        coordinates: coords,
    };
}

export async function saveTrack(store, getAuthHeader) {
    if (!store.canSave) return null;

    store.saving = true;
    store.error = null;

    const geojson = toGeoJSON(store);
    if (!geojson) {
        store.error = 'Track must contain at least 2 points';
        store.saving = false;
        return null;
    }

    const sessionId = getSessionId();
    const waypointsPayload = buildWaypointsPayload(store);

    try {
        const headers = {
            'Content-Type': 'application/json',
            ...(await getAuthHeader()),
        };

        if (store.savedTrackId) {
            // Update existing track geometry
            const resp = await fetch(
                `${API_BASE}/api/tracks/${store.savedTrackId}/geometry`,
                {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        geometry: geojson,
                        waypoints: waypointsPayload,
                        segment_meta: buildSegmentMetaPayload(store),
                        session_id: sessionId,
                    }),
                }
            );

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            // Also update metadata
            await updateMetadata(store, headers);

            store.saving = false;
            return store.savedTrackId;
        } else {
            // Create new track
            const resp = await fetch(`${API_BASE}/api/tracks/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: store.trackName.trim(),
                    description: store.trackDescription.trim(),
                    categories: store.trackCategories,
                    geometry: geojson,
                    waypoints: waypointsPayload,
                    segment_meta: buildSegmentMetaPayload(store),
                    pois: store.pois.map((p) => ({
                        lat: p.lat,
                        lon: p.lng,
                        name: p.name,
                        description: p.description,
                        category: p.category,
                    })),
                    session_id: sessionId,
                    is_draft: false,
                }),
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const result = await resp.json();
            store.savedTrackId = result.id;
            store.saving = false;
            return result.id;
        }
    } catch (e) {
        store.error = `Save error: ${e.message}`;
        store.saving = false;
        return null;
    }
}

export async function updateMetadata(store, headers) {
    const id = store.savedTrackId;
    if (!id) return;
    const sessionId = getSessionId();

    const requests = [
        fetch(`${API_BASE}/api/tracks/${id}/name`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                name: store.trackName.trim(),
                session_id: sessionId,
            }),
        }),
        fetch(`${API_BASE}/api/tracks/${id}/description`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                description: store.trackDescription.trim(),
                session_id: sessionId,
            }),
        }),
        fetch(`${API_BASE}/api/tracks/${id}/categories`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                categories: store.trackCategories,
                session_id: sessionId,
            }),
        }),
    ];

    await Promise.allSettled(requests);
}

export async function loadTrack(store, id, getAuthHeader) {
    store.loading = true;
    store.error = null;
    try {
        const sessionId = getSessionId();
        const headers = {
            ...(sessionId ? { 'x-session-id': sessionId } : {}),
            ...(await getAuthHeader()),
        };

        const response = await fetch(`${API_BASE}/api/tracks/${id}`, { headers });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const feature = data.features?.[0] ?? data;

        store.ownerSessionId = feature.session_id ?? feature.properties?.session_id ?? null;
        store.ownerUserId = feature.user_id ?? feature.properties?.user_id ?? null;

        store.trackName = feature.properties?.name ?? '';
        store.trackDescription = feature.properties?.description ?? '';
        store.trackCategories = feature.properties?.categories ?? [];
        store.savedTrackId = id;

        const segmentMeta = feature.segment_meta ?? feature.properties?.segment_meta ?? [];
        // fromGeoJSON will be called from the facade
        return { geometry: feature.geometry, waypoints: feature.properties?.waypoints ?? [], segmentMeta };
    } catch (e) {
        store.error = `Failed to load track: ${e.message}`;
        return null;
    } finally {
        store.loading = false;
    }
}

export async function loadTrackPois(store, id) {
    try {
        const resp = await fetch(`${API_BASE}/api/tracks/${id}/pois`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (Array.isArray(data)) {
            store.pois = data.map((p) => ({
                id: p.id,
                lat: p.lat ?? p.latitude,
                lng: p.lon ?? p.lng ?? p.longitude,
                name: p.name ?? '',
                description: p.description ?? '',
                category: p.category ?? '',
                distFromStart: p.distance_from_start ?? 0,
            }));
        }
    } catch {
        // Non-critical — POIs can be added later
    }
}

export async function duplicateTrack(store, getAuthHeader, { name } = {}) {
    if (!store.savedTrackId) {
        return { ok: false, error: 'Save the track before duplicating' };
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            ...(await getAuthHeader()),
        };
        const payload = {
            session_id: getSessionId(),
        };
        if (name && String(name).trim().length > 0) {
            payload.name = String(name).trim();
        }
        const resp = await fetch(
            `${API_BASE}/api/tracks/${store.savedTrackId}/duplicate`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            }
        );
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        return { ok: true, id: data.id };
    } catch (e) {
        store.error = `Duplicate error: ${e.message}`;
        return { ok: false, error: store.error };
    }
}

export async function exportTrack(store, getAuthHeader, format = 'gpx') {
    const id = store.savedTrackId;
    if (!id) {
        store.error = 'Save the track before exporting';
        return false;
    }

    try {
        const headers = await getAuthHeader();

        const resp = await fetch(
            `${API_BASE}/api/tracks/${id}/export?format=${format}`,
            { headers }
        );

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        const ext = format === 'geojson' ? 'json' : format;
        const fileName = `${store.trackName || 'track'}.${ext}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    } catch (e) {
        store.error = `Export error: ${e.message}`;
        return false;
    }
}
