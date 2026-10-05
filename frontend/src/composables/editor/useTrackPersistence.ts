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
    requestId?: string;
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
    const loadFailed = ref(false);
    const error = ref<string | null>(null);
    let loadedGeometry: string | null = null;
    const recordedTrack = ref(false);
    const geometryIdentity = (geometry: GeoJSON.Geometry | null): string => {
        if (!geometry) return 'null';
        const coordinates = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
        return JSON.stringify(normalizeCoordinates(coordinates));
    };
    function normalizeCoordinates(value: unknown): unknown {
        if (!Array.isArray(value)) return value;
        if (typeof value[0] === 'number') return value.slice(0, 2).map(coordinate => Math.round(coordinate * 1e9) / 1e9);
        return value.map(normalizeCoordinates);
    }
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
        return store.segments.filter(segment => segment.points.length >= 2).map((seg, index) => ({
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
            if (!resp.ok) throw new Error(`Places could not be loaded (HTTP ${resp.status}). Retry before saving.`);
            const data = await resp.json();
            if (Array.isArray(data)) {
                store.pois = data.map((p) => ({
                    id: p.id ?? '',
                    lat: p.lat ?? p.latitude ?? p.geom?.coordinates?.[1] ?? 0,
                    lng: p.lon ?? p.lng ?? p.longitude ?? p.geom?.coordinates?.[0] ?? 0,
                    name: p.name ?? '',
                    description: p.description ?? '',
                    category: p.category ?? '',
                    distFromStart: p.distance_from_start_m ?? p.distance_from_start ?? 0,
                    distanceToTrack: 0,
                    isFarFromTrack: false,
                }));
            }
        } catch (cause) {
            throw cause instanceof Error ? cause : new Error('Places could not be loaded. Retry before saving.');
        }
    }

    async function loadTrack(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
        id: string,
        onTrackLoaded: (data: any) => void,
    ): Promise<void> {
        loading.value = true;
        loadFailed.value = false;
        error.value = null;
        try {
            const sessionId = getSessionId();
            const headers = {
                ...(sessionId ? { 'x-session-id': sessionId } : {}),
                ...(await getAuthHeader()),
            };

            const response = await fetch(`${API_BASE}/api/tracks/${id}/simplified`, { headers });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const raw = data.features?.[0] ?? data;
            const properties = raw.properties ?? { ...raw };
            const geometry = raw.geometry ?? raw.geom_geojson;
            const feature = { ...raw, properties, geometry: typeof geometry === 'string' ? JSON.parse(geometry) : geometry };

            ownerSessionId.value = feature.session_id ?? feature.properties?.session_id ?? null;
            ownerUserId.value = feature.user_id ?? feature.properties?.user_id ?? null;

            store.trackName = properties.name ?? '';
            store.trackDescription = properties.description ?? '';
            store.trackCategories = properties.categories ?? [];
            savedTrackId.value = id;
            store.savedTrackId = id;

            // Call facade-provided callback to handle geometry initialization
            onTrackLoaded(feature);
            loadedGeometry = geometryIdentity(feature.geometry);
            recordedTrack.value = Boolean(properties.time_data || properties.hr_data || properties.speed_data || properties.temp_data || properties.recorded_at);

            // Load associated POIs
            await loadTrackPois(store, id);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            error.value = `Failed to load track: ${msg}`;
            loadFailed.value = true;
        } finally {
            loading.value = false;
        }
    }

    async function saveTrack(
        store: PersistenceStore,
        getAuthHeader: () => Promise<Record<string, string>>,
        geometryToGeoJSON: () => GeoJSON.Geometry | null,
        draftSave: { markClean: () => void; deleteDraft: () => void; isCurrentRevision?: () => boolean },
    ): Promise<string | null> {
        if (!store.trackName.trim() || store.segments.reduce((sum, s) => sum + s.points.length, 0) < 2) {
            return null;
        }

        if (saving.value) return null;
        store = JSON.parse(JSON.stringify(store));
        saving.value = true;
        error.value = null;

        const geojson = geometryToGeoJSON();
        if (!geojson) {
            error.value = 'Track must contain at least 2 points';
            saving.value = false;
            return null;
        }

        if (recordedTrack.value && loadedGeometry !== geometryIdentity(geojson)) {
            store.savedTrackId = null;
        }
        const sessionId = getSessionId();
        const waypointsPayload: Array<{ lat: number; lon: number; index: number }> = [];
        let pointOffset = 0;
        for (const seg of store.segments) {
            for (const idx of seg.waypoints) {
                if (idx < seg.points.length) {
                    waypointsPayload.push({
                        lat: seg.points[idx][0],
                        lon: seg.points[idx][1],
                        index: pointOffset + idx,
                    });
                }
            }
            pointOffset += seg.points.length;
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
                            pois: store.pois.map(p => ({ lat:p.lat, lon:p.lng, name:p.name, description:p.description, category:p.category })),
                            session_id: sessionId,
                        }),
                    },
                );

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                // Also update metadata
                await updateMetadata(store, headers);
                await verifySavedTrack(store, headers, geojson, waypointsPayload);

                if (draftSave.isCurrentRevision?.() ?? true) {
                    draftSave.deleteDraft();
                    draftSave.markClean();
                }
                saving.value = false;
                return store.savedTrackId;
            } else {
                // Create new track
                const resp = await fetch(`${API_BASE}/api/tracks/create`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        request_id: store.requestId,
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
                recordedTrack.value = false;
                loadedGeometry = geometryIdentity(geojson);
                store.savedTrackId = result.id;
                // A replayed create can refer to an earlier, unacknowledged revision.
                const confirmation = await fetch(`${API_BASE}/api/tracks/${result.id}/geometry`, {
                    method:'PUT', headers, body:JSON.stringify({geometry:geojson,waypoints:waypointsPayload,segment_meta:buildSegmentMetaPayload(store),pois:store.pois.map(p => ({lat:p.lat,lon:p.lng,name:p.name,description:p.description,category:p.category})),session_id:sessionId}),
                });
                if (!confirmation.ok) throw new Error(`Track created, but current route confirmation failed: HTTP ${confirmation.status}`);
                await updateMetadata(store, headers);
                await verifySavedTrack(store, headers, geojson, waypointsPayload);
                if (draftSave.isCurrentRevision?.() ?? true) {
                    draftSave.deleteDraft();
                    draftSave.markClean();
                }
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

    const textIdentity = (text: string): string => new DOMParser().parseFromString(text, 'text/html').body.textContent?.trim() ?? '';

    async function verifySavedTrack(store: PersistenceStore, headers: Record<string, string>, geometry: GeoJSON.Geometry, anchors: Array<{lat:number;lon:number;index:number}>): Promise<void> {
        const [detailResponse, placesResponse] = await Promise.all([
            fetch(`${API_BASE}/api/tracks/${store.savedTrackId}/simplified`, { headers }),
            fetch(`${API_BASE}/api/tracks/${store.savedTrackId}/pois`, { headers }),
        ]);
        if (!detailResponse.ok || !placesResponse.ok) throw new Error('Save requests completed, but final readback is unconfirmed. Your draft is retained; retry Save.');
        const detail = await detailResponse.json();
        const feature = detail.features?.[0] ?? detail;
        const data = feature.properties ?? feature;
        const serverGeometry = feature.geometry ?? data.geom_geojson;
        const places = await placesResponse.json();
        const serverAnchors = data.waypoints ?? [];
        const serverMeta = data.segment_meta ?? [];
        const expectedMeta = buildSegmentMetaPayload(store);
        const anchorsMatch = Array.isArray(serverAnchors) && serverAnchors.length === anchors.length && anchors.every((anchor,index) => {
            const saved = serverAnchors[index];
            return saved?.index === anchor.index && Math.abs(saved.lat-anchor.lat) < 1e-8 && Math.abs(saved.lon-anchor.lon) < 1e-8;
        });
        const segmentMetaMatch = Array.isArray(serverMeta) && serverMeta.length === expectedMeta.length && expectedMeta.every((meta,index) => textIdentity(serverMeta[index]?.name ?? '') === textIdentity(meta.name ?? '') && serverMeta[index]?.color?.toLowerCase() === meta.color.toLowerCase());
        const mismatch = textIdentity(data.name ?? '') !== textIdentity(store.trackName) || textIdentity(data.description ?? '') !== textIdentity(store.trackDescription)
            || !anchorsMatch || !segmentMetaMatch
            || JSON.stringify([...(data.categories ?? [])].sort()) !== JSON.stringify([...store.trackCategories].sort())
            || geometryIdentity(typeof serverGeometry === 'string' ? JSON.parse(serverGeometry) : serverGeometry) !== geometryIdentity(geometry)
            || !Array.isArray(places) || places.length !== store.pois.length
            || store.pois.some(p => !places.some(saved => textIdentity(saved.name ?? '') === textIdentity(p.name) && textIdentity(saved.description ?? '') === textIdentity(p.description ?? '') && (saved.category ?? '') === (p.category ?? '') && Math.abs((saved.lat ?? saved.geom?.coordinates?.[1]) - p.lat) < 1e-8 && Math.abs((saved.lon ?? saved.geom?.coordinates?.[0]) - p.lng) < 1e-8));
        if (mismatch) throw new Error('Save requests completed, but final readback differs from this revision. Your draft is retained; retry Save.');
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

        const results = await Promise.allSettled(requests);
        const fields = ['name', 'description', 'categories'];
        const failed = results.flatMap((result, index) => result.status === 'rejected' ? [`${fields[index]} (unconfirmed)`] : result.value.ok ? [] : [`${fields[index]} (HTTP ${result.value.status})`]);
        if (failed.length) {
            const confirmed = results.flatMap((result, index) => result.status === 'fulfilled' && result.value.ok ? [fields[index]] : []);
            throw new Error(`Incomplete save. Route and places are saved${confirmed.length ? `, along with ${confirmed.join(', ')}` : ''}. Retry to finish: ${failed.join(', ')}.`);
        }
    }

    return {
        recordedTrack,
        saving,
        loading,
        loadFailed,
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
