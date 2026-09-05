import { ref, type Ref } from 'vue';
import type { Segment, Poi, LatLngTuple } from '@/types';
import { getSessionId } from '../../utils/session';
import { getDefaultSegmentColor } from './trackGeometryUtils';

const API_BASE = '';

/**
 * Store interface for persistence operations.
 * Provides access to track data needed for server communication.
 */
export interface PersistenceStore {
    trackName: string;
    trackDescription: string;
    trackCategories: string[];
    segments: Segment[];
    pois: Poi[];
    savedTrackId: string | null;
    error: string | null;
}

export function useTrackPersistence() {
    const saving = ref<boolean>(false);
    const loading = ref<boolean>(false);
    const error = ref<string | null>(null);
    const savedTrackId = ref<string | null>(null);
    const ownerSessionId = ref<string | null>(null);
    const ownerUserId = ref<string | null>(null);

    /** Build a minimal GPX XML string from an array of [lat, lng] points. */
    function buildFragmentGpx(points: LatLngTuple[], name: string = 'Fragment'): string {
        const escXml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const trkpts = points
            .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
            .join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trackly"
  xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
    }

    function buildSegmentMetaPayload(
        store: PersistenceStore,
    ): Array<{ name: string | null; color: string }> {
        return store.segments.map((seg, index) => ({
            name: seg.name ?? null,
            color: seg.color || getDefaultSegmentColor(index),
        }));
    }

    function extractSegmentAsTrack(
        store: PersistenceStore,
        segIndex: number,
    ): { geometry: GeoJSON.Geometry; name: string } | null {
        const seg = store.segments[segIndex];
        if (!seg || seg.points.length < 2) return null;

        const coords = seg.points.map(([lat, lng]) => [lng, lat]);
        return {
            geometry: { type: 'MultiLineString', coordinates: [coords] } as GeoJSON.Geometry,
            name: `${store.trackName} — segment ${segIndex + 1}`,
        };
    }

    async function createTrackFromSegment(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
        segIndex: number,
        name?: string,
    ): Promise<{ ok: boolean; id?: string; error?: string }> {
        const segmentPayload = extractSegmentAsTrack(store, segIndex);
        if (!segmentPayload) {
            return { ok: false, error: 'Segment must have at least 2 points' };
        }
        const seg = store.segments[segIndex];
        if (!seg) return { ok: false, error: 'Segment not found' };

        const baseName = segmentPayload.name || `Segment ${segIndex + 1}`;
        const finalName = String(name ?? baseName).trim();
        if (!finalName) {
            return { ok: false, error: 'Track name is required' };
        }

        const headers = {
            'Content-Type': 'application/json',
            ...(await getAuthHeader()),
        };

        const waypointsPayload = (seg.waypoints || [])
            .filter((idx) => idx >= 0 && idx < seg.points.length)
            .map((idx) => ({
                lat: seg.points[idx][0],
                lon: seg.points[idx][1],
                index: idx,
            }));

        const segmentMetaPayload = [
            {
                name: seg.name ?? null,
                color: seg.color || getDefaultSegmentColor(0),
            },
        ];

        try {
            const resp = await fetch(`${API_BASE}/api/tracks/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: finalName,
                    description: store.trackDescription.trim(),
                    categories: store.trackCategories,
                    geometry: segmentPayload.geometry,
                    waypoints: waypointsPayload,
                    segment_meta: segmentMetaPayload,
                    session_id: getSessionId(),
                    is_draft: false,
                }),
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            return { ok: true, id: data.id };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            error.value = `Segment export error: ${msg}`;
            return { ok: false, error: error.value };
        }
    }

    async function duplicateTrack(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
    ): Promise<{ ok: boolean; id?: string; error?: string }> {
        if (!store.savedTrackId) {
            return { ok: false, error: 'Save the track before duplicating' };
        }

        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(await getAuthHeader()),
            };
            const payload: Record<string, string> = {
                session_id: getSessionId(),
            };
            const resp = await fetch(
                `${API_BASE}/api/tracks/${store.savedTrackId}/duplicate`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                },
            );
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            return { ok: true, id: data.id };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            error.value = `Duplicate error: ${msg}`;
            return { ok: false, error: error.value };
        }
    }

    async function exportTrack(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
        format: 'gpx' | 'kml' | 'geojson',
    ): Promise<boolean> {
        const id = store.savedTrackId;
        if (!id) {
            error.value = 'Save the track before exporting';
            return false;
        }

        try {
            const headers = await getAuthHeader();

            const resp = await fetch(
                `${API_BASE}/api/tracks/${id}/export?format=${format}`,
                { headers },
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
            const msg = e instanceof Error ? e.message : 'Unknown error';
            error.value = `Export error: ${msg}`;
            return false;
        }
    }

    async function loadTrackPois(store: PersistenceStore, id: string): Promise<void> {
        try {
            const resp = await fetch(`${API_BASE}/api/tracks/${id}/pois`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (Array.isArray(data)) {
                store.pois = data.map((p) => ({
                    id: p.id ?? '',
                    lat: p.lat ?? p.latitude ?? 0,
                    lng: p.lon ?? p.lng ?? p.longitude ?? 0,
                    name: p.name ?? '',
                    description: p.description ?? '',
                    category: p.category ?? '',
                    distFromStart: p.distance_from_start ?? 0,
                    distanceToTrack: 0,
                    isFarFromTrack: false,
                }));
            }
        } catch {
            // Non-critical — POIs can be added later
        }
    }

    async function loadTrack(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
        id: string,
        onTrackLoaded: (data: any) => void,
    ): Promise<void> {
        loading.value = true;
        error.value = null;
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

            ownerSessionId.value = feature.session_id ?? feature.properties?.session_id ?? null;
            ownerUserId.value = feature.user_id ?? feature.properties?.user_id ?? null;

            store.trackName = feature.properties?.name ?? '';
            store.trackDescription = feature.properties?.description ?? '';
            store.trackCategories = feature.properties?.categories ?? [];
            savedTrackId.value = id;
            store.savedTrackId = id;

            // Call facade-provided callback to handle geometry initialization
            onTrackLoaded(feature);

            // Load associated POIs
            await loadTrackPois(store, id);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            error.value = `Failed to load track: ${msg}`;
        } finally {
            loading.value = false;
        }
    }

    async function saveTrack(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
        geometryToGeoJSON: () => GeoJSON.Geometry | null,
        draftSave: { markClean: () => void; deleteDraft: () => void },
    ): Promise<string | null> {
        if (!store.trackName.trim() || store.segments.reduce((sum, s) => sum + s.points.length, 0) < 2) {
            return null;
        }

        saving.value = true;
        error.value = null;

        const geojson = geometryToGeoJSON();
        if (!geojson) {
            error.value = 'Track must contain at least 2 points';
            saving.value = false;
            return null;
        }

        const sessionId = getSessionId();
        const waypointsPayload: Array<{ lat: number; lon: number; index: number }> = [];
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
                    },
                );

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                // Also update metadata
                await updateMetadata(store, headers);

                draftSave.markClean();
                draftSave.deleteDraft();
                saving.value = false;
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
                savedTrackId.value = result.id;
                store.savedTrackId = result.id;
                draftSave.markClean();
                draftSave.deleteDraft();
                saving.value = false;
                return result.id;
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            error.value = `Save error: ${msg}`;
            saving.value = false;
            return null;
        }
    }

    async function updateMetadata(
        store: PersistenceStore,
        headers: Record<string, string>,
    ): Promise<void> {
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

    return {
        saving,
        loading,
        error,
        savedTrackId,
        ownerSessionId,
        ownerUserId,
        buildFragmentGpx,
        buildSegmentMetaPayload,
        extractSegmentAsTrack,
        createTrackFromSegment,
        duplicateTrack,
        exportTrack,
        loadTrackPois,
        loadTrack,
        saveTrack,
        updateMetadata,
    };
}
