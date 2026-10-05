/**
 * Track Editor Facade
 * Composes specialized sub-modules and exposes a unified API.
 * Each sub-module owns a single concern; this facade wires cross-module dependencies.
 */
import { ref, computed, watch, type Ref } from 'vue';
import { getSessionId } from '../utils/session';
import { haversineDistance } from '../utils/haversine';
import { useAuth } from './useAuth';
import { useUndoRedo } from './useUndoRedo';
import { useDraftSave, type DraftState } from './useDraftSave';
import { useRouting } from './useRouting';
import { isValidCoord, getDefaultSegmentColor, SEGMENT_COLORS } from './editor/trackGeometryUtils';
import { useTrackGeometry } from './editor/useTrackGeometry';
import { useTrackPois } from './editor/useTrackPois';
import { useTrackFragments } from './editor/useTrackFragments';
import { scheduleElevationPreview } from './editor/useElevationPreview';
import { useTrackOptimizer } from './editor/useTrackOptimizer';
import { useTrackPersistence } from './editor/useTrackPersistence';
import { useTrackWaypoints } from './editor/useTrackWaypoints';
import { useTrackSegments } from './editor/useTrackSegments';
import type { Segment, LatLngTuple, EditorMode, SnapMode } from '@/types';


// ── Category constants (from useTrackMetadata) ─────────────
const CATEGORY_SPEEDS: Record<string, number> = {
    hiking: 5,
    walking: 4,
    running: 10,
    cycling: 20,
    mtb: 15,
};

const CATEGORY_SLOPE_PENALTY: Record<string, number> = {
    hiking: 0.5,
    walking: 0.5,
    running: 0.6,
    cycling: 0.4,
    mtb: 0.5,
};

export function useTrackEditor({ trackId = null }: { trackId?: string | null } = {}) {
    const { getAuthHeader, user } = useAuth();
    const routing = useRouting();
    const undoRedo = useUndoRedo(50);
    const draftSave = useDraftSave({ trackId });
    const viewport = ref<{lat: number; lng: number; zoom: number} | null>(null);
    function setViewport(value: {lat: number; lng: number; zoom: number}): void {
        if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || !Number.isFinite(value.zoom) || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180 || value.zoom < 0 || value.zoom > 22) return;
        viewport.value = value;
        autosave(false);
    }
    const recordedSeries = ref<{speed: (number | null)[]; pace: (number | null)[]; heartRate: (number | null)[]; temperature: (number | null)[]; time: (number | null)[]; coordinates: number[][]; distance: number} | null>(null);

    // ── Sub-modules ──────────────────────────────────────────
    const geometry = useTrackGeometry();
    const loadedDistance = ref<number | null>(null);
    let loadedPoints = '';
    const pointsIdentity = () => JSON.stringify(geometry.segments.value.map(s => s.points.map(p => p.map(n => Math.round(n * 1e9) / 1e9))));
    const canonicalDistanceKm = computed(() => loadedDistance.value !== null && pointsIdentity() === loadedPoints ? loadedDistance.value : geometry.totalDistanceKm.value);
    const pois = useTrackPois();
    const fragments = useTrackFragments();
    const optimizer = useTrackOptimizer();
    const persistence = useTrackPersistence();

    // ── Metadata state (inlined from useTrackMetadata) ────────
    const createRequestId = ref<string>(crypto.randomUUID());
    const trackName = ref<string>('');
    const trackDescription = ref<string>('');
    const trackCategories = ref<string[]>([]);
    const editorMode = ref<EditorMode>('edit');
    const snapToRoadMode = ref<SnapMode>('auto');

    // ── Waypoint & Segment operations (deep modules) ─────────
    // Note: saveUndoState, autosave, scheduleGeometryUpdates are defined later
    // but JavaScript allows forward references in closures
    const waypointOps = useTrackWaypoints({
        editorMode,
        geometry,
        routing,
        saveUndoState,
        autosave,
        scheduleGeometryUpdates,
    });

    const segmentOps = useTrackSegments({
        editorMode,
        geometry,
        routing,
        saveUndoState,
        autosave,
        scheduleGeometryUpdates,
    });

    // ── Integration state (cross-module) ─────────────────────
    const elevationProfile = ref<Array<{ distance: number; elevation: number }>>([]);
    const elevationStats = ref<{
        gain?: number;
        loss?: number;
        min?: number;
        max?: number;
        dataset?: string;
        enriched: boolean;
        _lastUpdated: number;
    }>({ enriched: false, _lastUpdated: 0 });
    const elevationLoading = ref<boolean>(false);
    const elevationError = ref<string | null>(null);

    const optimizerTargetRatioRef = ref<number>(0.1);
    const optimizerPreview = ref<{
        geometry: GeoJSON.Geometry;
        segments: LatLngTuple[][];
        waypoints: number[][];
    } | null>(null);
    const optimizerStats = ref<{
        originalPoints: number;
        simplifiedPoints: number;
        compressionRatio: number;
        toleranceUsed: number;
    } | null>(null);
    const optimizerLoading = ref<boolean>(false);
    const optimizerError = ref<string | null>(null);

    // ── Optimizer store helpers ──────────────────────────────

    function getOptimizerStore() {
        return {
            segments: geometry.segments.value,
            activeSegmentIndex: geometry.activeSegmentIndex.value,
            optimizerTargetRatio: optimizerTargetRatioRef.value,
            optimizerPreview: optimizerPreview.value,
            optimizerStats: optimizerStats.value,
            optimizerError: optimizerError.value,
            optimizerLoading: optimizerLoading.value,
            trackName: trackName.value,
            coordinateData: geometry.coordinateData.value,
        };
    }

    function syncOptimizerFromStore(store: ReturnType<typeof getOptimizerStore>) {
        optimizerTargetRatioRef.value = store.optimizerTargetRatio;
        optimizerPreview.value = store.optimizerPreview;
        optimizerStats.value = store.optimizerStats;
        optimizerError.value = store.optimizerError;
        optimizerLoading.value = store.optimizerLoading;
        // Sync back geometry changes from optimizer
        geometry.segments.value = store.segments;
        geometry.activeSegmentIndex.value = store.activeSegmentIndex;
    }

    // ── Cross-module wiring ──────────────────────────────────

    function scheduleGeometryUpdates() {
        pois.updatePoiMetrics(geometry.segments.value);

        // Elevation: pass a store object with getters/setters backed by the refs
        // so the async debounced callback writes through to the refs
        const elevationStore = {
            get coordinateData() { return geometry.coordinateData.value; },
            get elevationProfile() { return elevationProfile.value; },
            set elevationProfile(v) { elevationProfile.value = v; },
            get elevationStats() { return elevationStats.value; },
            set elevationStats(v) { elevationStats.value = v; },
            get elevationError() { return elevationError.value; },
            set elevationError(v) { elevationError.value = v; },
            get elevationLoading() { return elevationLoading.value; },
            set elevationLoading(v) { elevationLoading.value = v; },
        };
        scheduleElevationPreview(elevationStore);

        // Optimizer: clear preview (geometry changed, preview is stale)
        const optimizerStore = getOptimizerStore();
        optimizer.clearOptimizationPreview(optimizerStore, { keepRatio: true, silent: true });
        syncOptimizerFromStore(optimizerStore);
    }

    function getGeometrySnapshot(): { segments: Segment[]; activeSegmentIndex: number; pois: typeof pois.pois.value } {
        return {
            segments: JSON.parse(JSON.stringify(geometry.segments.value)),
            activeSegmentIndex: geometry.activeSegmentIndex.value,
            pois: JSON.parse(JSON.stringify(pois.pois.value)),
        };
    }

    function applySnapshot(snapshot: ReturnType<typeof getGeometrySnapshot>) {
        geometry.segments.value = snapshot.segments;
        geometry.activeSegmentIndex.value = snapshot.activeSegmentIndex;
        pois.pois.value = snapshot.pois;
        scheduleGeometryUpdates();
    }

    function saveUndoState() {
        undoRedo.pushState(getGeometrySnapshot());
    }

    let revision = 0;
    let restoring = false;
    function autosave(dirty = true) {
        if (restoring) return;
        const draftState: DraftState = {
            track: {
                name: trackName.value,
                description: trackDescription.value,
                categories: trackCategories.value,
                segments: JSON.parse(JSON.stringify(geometry.segments.value)),
                pois: JSON.parse(JSON.stringify(pois.pois.value)),
            },
            editingState: {
                mode: editorMode.value,
                activeSegmentIndex: geometry.activeSegmentIndex.value,
                routingMode: routing.mode.value,
                routingProfile: routing.profile.value,
                snapToRoadMode: snapToRoadMode.value,
                createRequestId: createRequestId.value,
                contentDirty: dirty || draftSave.isDirty.value,
                viewport: viewport.value ?? undefined,
            },
        };
        if (dirty) revision += 1;
        draftSave.debouncedSave(draftState, dirty);
    }

    watch([trackName, trackDescription, trackCategories, () => geometry.segments.value.map(s => [s.name, s.color])], () => autosave(), { deep: true, flush: 'sync' });
    watch([editorMode, geometry.activeSegmentIndex, routing.mode, routing.profile, snapToRoadMode], () => autosave(false), {flush:'sync'});

    // ── Waypoint operations (delegated to useTrackWaypoints) ──

    function addWaypoint(lat: number, lng: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean {
        return waypointOps.addWaypoint(lat, lng, options);
    }

    function appendTrace(points: LatLngTuple[]): void {
        const valid = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
        if (valid.length < 2 || geometry.totalPoints.value + valid.length > 100000) return;
        saveUndoState();
        const segment = geometry.segments.value[geometry.activeSegmentIndex.value];
        segment.surfaceTypes ??= [];
        for (const point of valid) {
            segment.points.push(point);
            segment.waypoints.push(segment.points.length - 1);
            segment.surfaceTypes.push('unknown');
        }
        scheduleGeometryUpdates();
        autosave();
    }

    function moveWaypoint(segIndex: number, pointIndex: number, lat: number, lng: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean {
        return waypointOps.moveWaypoint(segIndex, pointIndex, lat, lng, options);
    }

    function deleteWaypoint(segIndex: number, pointIndex: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean {
        const seg = geometry.segments.value[segIndex];
        if (!seg) return false;
        if (seg.points.length <= 1) {
            return segmentOps.deleteSegment(segIndex);
        }
        return waypointOps.deleteWaypoint(segIndex, pointIndex, options);
    }

    function insertWaypoint(segIndex: number, afterIndex: number, lat: number, lng: number, options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean {
        return waypointOps.insertWaypoint(segIndex, afterIndex, lat, lng, options);
    }

    // ── Segment operations (delegated to useTrackSegments) ────

    function addSegment(): number {
        return segmentOps.addSegment();
    }

    function deleteSegment(segIndex: number): boolean {
        return segmentOps.deleteSegment(segIndex);
    }

    function splitSegment(pointIndex: number): boolean {
        return segmentOps.splitSegment(pointIndex);
    }

    function reverseSegment(segIndex: number): void {
        segmentOps.reverseSegment(segIndex);
    }

    function reverseTrack(): boolean {
        return segmentOps.reverseTrack();
    }

    function setActiveSegment(index: number): void {
        segmentOps.setActiveSegment(index);
    }

    function joinSegments(segIndexA: number, segIndexB: number): boolean {
        return segmentOps.joinSegments(segIndexA, segIndexB);
    }

    function closeLoop(): boolean {
        return segmentOps.closeLoop();
    }

    function closeLoopSameWay(): boolean {
        return segmentOps.closeLoopSameWay();
    }

    function closeLoopDifferentRoute(options?: { onRoutingNotAvailable?: (msg: string) => void }): boolean {
        return segmentOps.closeLoopDifferentRoute(options);
    }

    function promoteToWaypoint(segIndex: number, pointIndex: number): boolean {
        return segmentOps.promoteToWaypoint(segIndex, pointIndex);
    }

    function deleteLastPoint(): boolean {
        return segmentOps.deleteLastPoint();
    }

    // ── Fragment operations ──────────────────────────────────

    function setFragmentPoint(segIndex: number, pointIndex: number): boolean {
        const store = {
            segments: geometry.segments.value,
            fragmentSelection: fragments.fragmentSelection.value,
        };
        const ok = fragments.setFragmentPoint(store, segIndex, pointIndex);
        // Sync back fragment selection changes
        fragments.fragmentSelection.value = store.fragmentSelection;
        return ok;
    }

    function clearFragmentSelection(): void {
        fragments.clearFragmentSelection();
    }

    function getFragmentRange(): { segIndex: number; startIdx: number; endIdx: number } | null {
        return fragments.getFragmentRange();
    }

    function deleteFragmentConnect(segIndex: number, startIdx: number, endIdx: number): boolean {
        saveUndoState();
        const ok = fragments.deleteFragmentConnect(
            { segments: geometry.segments.value, fragmentSelection: fragments.fragmentSelection.value },
            segIndex, startIdx, endIdx,
        );
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function deleteFragmentSplit(segIndex: number, startIdx: number, endIdx: number): boolean {
        saveUndoState();
        const ok = fragments.deleteFragmentSplit(
            { segments: geometry.segments.value, fragmentSelection: fragments.fragmentSelection.value },
            segIndex, startIdx, endIdx,
        );
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function reverseFragment(segIndex: number, startIdx: number, endIdx: number): boolean {
        saveUndoState();
        const ok = fragments.reverseFragment(
            { segments: geometry.segments.value, fragmentSelection: fragments.fragmentSelection.value },
            segIndex, startIdx, endIdx,
        );
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function rerouteFragment(segIndex: number, startIdx: number, endIdx: number, { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        const seg = geometry.segments.value[segIndex];
        if (!seg) return false;
        if (endIdx - startIdx < 2) return false;

        const from = seg.points[startIdx];
        const to = seg.points[endIdx];
        const routeData = routing.findRouteDetailed(
            { lat: from[0], lng: from[1] },
            { lat: to[0], lng: to[1] },
            { onNotAvailable: onRoutingNotAvailable },
        );

        if (!routeData || routeData.points.length < 2) return false;

        saveUndoState();
        fragments.replaceRangeWithPoints(
            { segments: geometry.segments.value, fragmentSelection: fragments.fragmentSelection.value },
            segIndex, startIdx, endIdx, routeData.points,
        );
        if (seg.surfaceTypes) {
            seg.surfaceTypes.splice(startIdx, endIdx - startIdx + 1, ...routeData.surfaceTypes);
        } else {
            seg.surfaceTypes = routeData.surfaceTypes;
        }
        autosave();
        scheduleGeometryUpdates();
        fragments.clearFragmentSelection();
        return true;
    }

    function shortcutBetweenPoints(segIndex: number, fromIdx: number, toIdx: number): boolean {
        saveUndoState();
        const ok = fragments.shortcutBetweenPoints(
            { segments: geometry.segments.value, fragmentSelection: fragments.fragmentSelection.value },
            segIndex, fromIdx, toIdx,
        );
        if (ok) {
            autosave();
            scheduleGeometryUpdates();
        }
        return ok;
    }

    function cutSegmentAt(segIndex: number, afterIndex: number, lat: number, lng: number, { onRoutingNotAvailable }: { onRoutingNotAvailable?: (msg: string) => void } = {}): boolean {
        if (!isValidCoord(lat, lng)) return false;
        const seg = geometry.segments.value[segIndex];
        if (!seg || seg.points.length < 2) return false;

        const inserted = insertWaypoint(segIndex, afterIndex, lat, lng, { onRoutingNotAvailable });
        if (!inserted) return false;

        const updatedSeg = geometry.segments.value[segIndex];
        let splitIndex = 0;
        let bestDist = Infinity;
        for (let i = 0; i < updatedSeg.points.length; i++) {
            const [ptLat, ptLng] = updatedSeg.points[i];
            const dist = haversineDistance({ lat: ptLat, lng: ptLng }, { lat, lng });
            if (dist < bestDist) {
                bestDist = dist;
                splitIndex = i;
            }
        }

        const prevActive = geometry.activeSegmentIndex.value;
        geometry.activeSegmentIndex.value = segIndex;
        const ok = splitSegment(splitIndex);
        if (!ok) {
            geometry.activeSegmentIndex.value = prevActive;
            return false;
        }
        return true;
    }

    function extractSegmentAsTrack(segIndex: number): { geometry: GeoJSON.Geometry; name: string } | null {
        const seg = geometry.segments.value[segIndex];
        if (!seg || seg.points.length < 2) return null;

        const coords = seg.points.map(([lat, lng]) => [lng, lat]);
        return {
            geometry: { type: 'MultiLineString', coordinates: [coords] } as GeoJSON.Geometry,
            name: `${trackName.value} — segment ${segIndex + 1}`,
        };
    }

    // ── POI operations ────────────────────────────────────────

    function addPoi(lat: number, lng: number, name: string, { description = '', category = '' }: { description?: string; category?: string } = {}): { ok: boolean; warning?: string | null; poi?: any } {
        if (!isValidCoord(lat, lng)) return { ok: false };

        const cleanedName = (name || '').trim();
        const finalName = cleanedName.length > 0 ? cleanedName : pois.getNextPoiName();

        saveUndoState();

        let totalDistance = 0;
        let bestDistance = Infinity;
        let bestAlong = 0;
        for (const seg of geometry.segments.value) {
            for (let i = 1; i < seg.points.length; i++) {
                const prev = seg.points[i - 1];
                const curr = seg.points[i];
                const segmentLength = haversineDistance({ lat: prev[0], lng: prev[1] }, { lat: curr[0], lng: curr[1] });
                const dist = haversineDistance({ lat, lng }, { lat: curr[0], lng: curr[1] });
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestAlong = totalDistance + segmentLength * 0.5;
                }
                totalDistance += segmentLength;
            }
        }

        const poi = {
            id: String(Date.now() + Math.random()),
            lat, lng, name: finalName, description: description.trim(), category,
            distFromStart: Math.round(bestAlong),
            distanceToTrack: Math.round(bestDistance),
            isFarFromTrack: bestDistance > 1000,
        };

        pois.pois.value.push(poi);
        autosave();
        return {
            ok: true,
            warning: poi.isFarFromTrack ? 'POI is more than 1 km from the track' : null,
            poi,
        };
    }

    async function updatePoi(poiIndex: number, updates: any): Promise<{ ok: boolean; error?: string }> {
        const poi = pois.pois.value[poiIndex];
        if (!poi) return { ok: false, error: 'POI not found' };
        if (updates.name !== undefined && updates.name.trim().length === 0) {
            return { ok: false, error: 'POI name cannot be empty' };
        }

        const nextName = updates.name !== undefined ? updates.name.trim() : poi.name;
        const nextDescription = updates.description !== undefined ? (updates.description ?? '').trim() : (poi.description ?? '');
        const nextCategory = updates.category !== undefined ? updates.category : (poi.category ?? '');

        saveUndoState();
        poi.name = nextName;
        poi.description = nextDescription;
        poi.category = nextCategory;
        autosave();
        return { ok: true };
    }

    async function deletePoi(poiIndex: number): Promise<{ ok: boolean; error?: string }> {
        if (poiIndex < 0 || poiIndex >= pois.pois.value.length) {
            return { ok: false, error: 'POI not found' };
        }

        saveUndoState();
        pois.pois.value.splice(poiIndex, 1);
        autosave();
        return { ok: true };
    }

    function calcDistanceFromStart(lat: number, lng: number): number {
        let totalDistance = 0;
        let bestAlong = 0;
        for (const seg of geometry.segments.value) {
            for (let i = 1; i < seg.points.length; i++) {
                const prev = seg.points[i - 1];
                const curr = seg.points[i];
                const segmentLength = haversineDistance({ lat: prev[0], lng: prev[1] }, { lat: curr[0], lng: curr[1] });
                const dist = haversineDistance({ lat, lng }, { lat: curr[0], lng: curr[1] });
                if (dist < 100) {
                    bestAlong = totalDistance + segmentLength * 0.5;
                }
                totalDistance += segmentLength;
            }
        }
        return Math.round(bestAlong);
    }

    // ── GeoJSON conversion ───────────────────────────────────

    function toGeoJSON(): GeoJSON.MultiLineString | null {
        return geometry.toGeoJSON();
    }

    function fromGeoJSON(geojson: GeoJSON.Geometry | null, waypoints: number[] = [], segmentMeta: Array<{ name?: string; color?: string }> = []): void {
        geometry.fromGeoJSON(geojson, waypoints, segmentMeta);
        scheduleGeometryUpdates();
    }

    // ── Undo / Redo ──────────────────────────────────────────

    function handleUndo() {
        const snapshot = undoRedo.undo(getGeometrySnapshot()) as ReturnType<typeof getGeometrySnapshot> | null;
        if (snapshot) {
            applySnapshot(snapshot);
            autosave();
        }
    }

    function handleRedo() {
        const snapshot = undoRedo.redo(getGeometrySnapshot()) as ReturnType<typeof getGeometrySnapshot> | null;
        if (snapshot) {
            applySnapshot(snapshot);
            autosave();
        }
    }

    // ── Server operations ────────────────────────────────────

    async function loadTrack(id: string): Promise<void> {
        restoring = true;
        const store = {
            trackName: trackName.value,
            trackDescription: trackDescription.value,
            trackCategories: trackCategories.value,
            segments: geometry.segments.value,
            pois: pois.pois.value,
            savedTrackId: persistence.savedTrackId.value,
            error: persistence.error.value,
        };
        await persistence.loadTrack(
            store,
            getAuthHeader,
            id,
            (feature: any) => {
                const properties = feature.properties ?? feature;
                const series = (key: string): (number | null)[] => Array.isArray(properties[key]) ? properties[key] : [];
                recordedSeries.value = {speed:series('speed_data'),pace:series('pace_data'),heartRate:series('hr_data'),temperature:series('temp_data'),time:series('time_data'),coordinates:feature.geometry.type === 'LineString' ? feature.geometry.coordinates.map((p:number[]) => [p[1],p[0]]) : feature.geometry.coordinates.flat().map((p:number[]) => [p[1],p[0]]),distance:properties.length_km ?? 0};
                const segmentMeta = feature.segment_meta ?? feature.properties?.segment_meta ?? [];
                geometry.fromGeoJSON(feature.geometry, feature.properties?.waypoints ?? [], segmentMeta);
                loadedDistance.value = typeof properties.length_km === 'number' && Number.isFinite(properties.length_km) ? properties.length_km : null;
                loadedPoints = pointsIdentity();
                const elevationProfileData = feature.elevation_profile || feature.properties?.elevation_profile;
                if (Array.isArray(elevationProfileData)) {
                    elevationProfile.value = elevationProfileData;
                    elevationStats.value = {
                        gain: feature.elevation_gain ?? feature.properties?.elevation_gain,
                        loss: feature.elevation_loss ?? feature.properties?.elevation_loss,
                        min: feature.elevation_min ?? feature.properties?.elevation_min,
                        max: feature.elevation_max ?? feature.properties?.elevation_max,
                        dataset: feature.elevation_dataset || feature.properties?.elevation_dataset,
                        enriched: feature.elevation_enriched || feature.properties?.elevation_enriched,
                        _lastUpdated: Date.now(),
                    };
                } else {
                    scheduleElevationPreview({
                        coordinateData: geometry.coordinateData.value,
                        elevationProfile: elevationProfile.value,
                        elevationStats: elevationStats.value,
                        elevationError: elevationError.value,
                        elevationLoading: elevationLoading.value,
                    });
                }
                undoRedo.clear();
                draftSave.markClean();
                scheduleGeometryUpdates();
            },
        );
        // Sync back persistence state changes to refs (geometry already updated in callback)
        trackName.value = store.trackName;
        trackDescription.value = store.trackDescription;
        trackCategories.value = store.trackCategories;
        // Don't overwrite segments - they were already set by fromGeoJSON in the callback
        // geometry.segments.value = store.segments;
        pois.pois.value = store.pois;
        restoring = false;
        draftSave.markClean();
    }

    async function saveTrack(): Promise<string | null> {
        if (!canSave.value) return null;
        const savedRevision = revision;
        return persistence.saveTrack(
            {
                requestId: createRequestId.value,
                trackName: trackName.value,
                trackDescription: trackDescription.value,
                trackCategories: trackCategories.value,
                segments: geometry.segments.value,
                pois: pois.pois.value,
                savedTrackId: persistence.savedTrackId.value,
                error: persistence.error.value,
            },
            getAuthHeader,
            toGeoJSON,
            { ...draftSave, isCurrentRevision: () => revision === savedRevision && !draftSave.conflict.value },
        );
    }

    async function duplicateTrack(): Promise<{ ok: boolean; id?: string; error?: string }> {
        return persistence.duplicateTrack(
            {
                trackName: trackName.value,
                trackDescription: trackDescription.value,
                trackCategories: trackCategories.value,
                segments: geometry.segments.value,
                pois: pois.pois.value,
                savedTrackId: persistence.savedTrackId.value,
                error: persistence.error.value,
            },
            getAuthHeader,
        );
    }

    async function createTrackFromSegment(segIndex: number, { name }: { name?: string } = {}): Promise<{ ok: boolean; id?: string; error?: string }> {
        return persistence.createTrackFromSegment(
            {
                trackName: trackName.value,
                trackDescription: trackDescription.value,
                trackCategories: trackCategories.value,
                segments: geometry.segments.value,
                pois: pois.pois.value,
                savedTrackId: persistence.savedTrackId.value,
                error: persistence.error.value,
            },
            getAuthHeader,
            segIndex,
            name,
        );
    }

    async function exportTrack(format: 'gpx' | 'kml' | 'geojson'): Promise<boolean> {
        return persistence.exportTrack(
            {
                trackName: trackName.value,
                trackDescription: trackDescription.value,
                trackCategories: trackCategories.value,
                segments: geometry.segments.value,
                pois: pois.pois.value,
                savedTrackId: persistence.savedTrackId.value,
                error: persistence.error.value,
            },
            getAuthHeader,
            format,
        );
    }

    function exportFragment(): boolean {
        const range = fragments.getFragmentRange();
        if (!range) return false;
        const { segIndex, startIdx, endIdx } = range;
        const seg = geometry.segments.value[segIndex];
        if (!seg) return false;
        const pts = seg.points.slice(startIdx, endIdx + 1);
        if (pts.length < 2) return false;

        const name = trackName.value || 'track';
        const gpxContent = persistence.buildFragmentGpx(pts, `${name} (fragment)`);

        const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}_fragment.gpx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    // ── Draft operations ─────────────────────────────────────

    function restoreDraft(): boolean {
        const draft = draftSave.loadDraft();
        if (!draft?.track) return false;

        draftSave.acceptIncoming();
        restoring = true;
        trackName.value = draft.track.name ?? '';
        trackDescription.value = draft.track.description ?? '';
        trackCategories.value = draft.track.categories ?? [];
        geometry.segments.value = draft.track.segments?.length
            ? draft.track.segments.map((s, idx) => ({ points: s.points, waypoints: s.waypoints ?? [], surfaceTypes: s.surfaceTypes ?? [], name: s.name ?? null, color: s.color ?? getDefaultSegmentColor(idx) }))
            : [{ points: [], waypoints: [], surfaceTypes: [], name: null, color: getDefaultSegmentColor(0) }];
        if (draft.track.pois) {
            pois.pois.value = draft.track.pois as typeof pois.pois.value;
        }
        // Support both old draft format (activeSegment) and new format (activeSegmentIndex)
        geometry.activeSegmentIndex.value = draft.editingState?.activeSegmentIndex ?? draft.editingState?.activeSegment ?? 0;
        if (draft.editingState?.createRequestId) createRequestId.value = draft.editingState.createRequestId;
        if (draft.editingState?.viewport) setViewport(draft.editingState.viewport);
        if (draft.editingState?.mode) setMode(draft.editingState.mode as EditorMode);

        // Restore routing state from draft (stored as extra properties)
        if (draft.editingState?.routingMode) routing.setMode(draft.editingState.routingMode);
        if (draft.editingState?.routingProfile) routing.setProfile(draft.editingState.routingProfile);
        if (draft.editingState?.snapToRoadMode) setSnapToRoadMode(draft.editingState.snapToRoadMode as SnapMode);

        undoRedo.clear();
        scheduleGeometryUpdates();
        restoring = false;
        autosave(draft.editingState?.contentDirty ?? true);
        return true;
    }

    // ── Mode operations ──────────────────────────────────────

    function setMode(newMode: EditorMode): void {
        if (['view', 'edit', 'fragment', 'routing', 'trace'].includes(newMode)) {
            editorMode.value = newMode;
        }
        if (newMode === 'routing') routing.setMode('auto');
        if (newMode !== 'fragment') fragments.clearFragmentSelection();
    }

    function setSnapToRoadMode(newMode: SnapMode): void {
        if (['auto', 'on', 'off'].includes(newMode)) {
            snapToRoadMode.value = newMode;
        }
        autosave(false);
    }

    // ── Computed ─────────────────────────────────────────────

    const canSave = computed(
        () => !draftSave.conflict.value && !persistence.loading.value && !persistence.loadFailed.value && trackName.value.trim().length > 0 && geometry.totalPoints.value >= 2 && geometry.segments.value.every(s => s.points.length === 0 || s.points.length >= 2),
    );

    const isNewTrack = computed(() => !persistence.savedTrackId.value);

    const isOwner = computed(() => {
        const sessionId = getSessionId();
        const currentUser = user.value as { user_id?: string; id?: string } | null;
        const currentUserId = currentUser?.user_id ?? currentUser?.id ?? null;

        if (currentUserId && persistence.ownerUserId.value) {
            return String(currentUserId) === String(persistence.ownerUserId.value);
        }
        if (sessionId && persistence.ownerSessionId.value) {
            return String(sessionId) === String(persistence.ownerSessionId.value);
        }
        return false;
    });

    const estimatedTimeMinutes = computed(() => {
        const dist = canonicalDistanceKm.value;
        if (dist <= 0) return 0;
        const cat = routing.profile.value;
        const baseSpeed = CATEGORY_SPEEDS[cat] ?? 5;
        let speed = baseSpeed;

        const gain = elevationStats.value?.gain ?? 0;
        const distanceMeters = dist * 1000;
        if (gain > 0 && distanceMeters > 0) {
            const avgSlope = (gain / distanceMeters) * 100;
            if (avgSlope >= 10) {
                const slopePenalty = CATEGORY_SLOPE_PENALTY[cat] ?? 0.5;
                speed = baseSpeed * slopePenalty;
            }
        }

        if (speed <= 0) return 0;
        return (dist / speed) * 60;
    });

    const manualRoutingPercent = computed(() =>
        routing.mode.value === 'manual' ? 100 : 0,
    );

    // ── Init ─────────────────────────────────────────────────
    draftSave.install();

    // ── Public API ───────────────────────────────────────────

    return {
        // Mode
        editorMode: editorMode,
        setMode,
        viewport,
        setViewport,
        snapToRoadMode: snapToRoadMode,
        setSnapToRoadMode,

        // Metadata
        trackName: trackName,
        trackDescription: trackDescription,
        trackCategories: trackCategories,

        // Geometry
        segments: geometry.segments,
        activeSegmentIndex: geometry.activeSegmentIndex,
        activeSegment: geometry.activeSegment,
        totalPoints: geometry.totalPoints,
        totalDistanceKm: canonicalDistanceKm,
        coordinateData: geometry.coordinateData,
        segmentStats: geometry.segmentStats,
        SEGMENT_COLORS,
        setSegmentName: geometry.setSegmentName,
        setSegmentColor: geometry.setSegmentColor,

        // Fragment selection
        fragmentSelection: fragments.fragmentSelection,
        setFragmentPoint,
        clearFragmentSelection,
        getFragmentRange,
        deleteFragmentConnect,
        deleteFragmentSplit,
        reverseFragment,
        rerouteFragment,

        // Waypoint ops
        addWaypoint,
        appendTrace,
        moveWaypoint,
        deleteWaypoint,
        insertWaypoint,
        promoteToWaypoint,
        deleteLastPoint,

        // Segment ops
        addSegment,
        deleteSegment,
        splitSegment,
        reverseSegment,
        reverseTrack,
        setActiveSegment,
        joinSegments,
        closeLoop,
        closeLoopSameWay,
        closeLoopDifferentRoute,
        shortcutBetweenPoints,
        cutSegmentAt,
        extractSegmentAsTrack,
        createTrackFromSegment,
        duplicateTrack,

        // Undo/Redo
        handleUndo,
        handleRedo,
        canUndo: undoRedo.canUndo,
        canRedo: undoRedo.canRedo,

        // GeoJSON
        toGeoJSON,
        fromGeoJSON,

        // Server
        loadTrack,
        saveTrack,
        savedTrackId: persistence.savedTrackId,
        recordedTrack: persistence.recordedTrack,
        recordedSeries,
        draftStorageError: draftSave.storageError,
        draftConflict: draftSave.conflict,
        keepLocalDraft: draftSave.resumeWrites,
        saving: persistence.saving,
        loading: persistence.loading,
        error: persistence.error,
        canSave,
        isNewTrack,
        isOwner,

        // Draft
        restoreDraft,
        hasDraft: draftSave.hasDraft,
        deleteDraft: draftSave.deleteDraft,
        isDirty: draftSave.isDirty,

        // Routing
        routing,

        // Elevation preview
        elevationProfile,
        elevationStats,
        elevationLoading,
        elevationError,

        // Optimizer (wrapped to sync plain store → refs)
        optimizerTargetRatio: optimizerTargetRatioRef,
        optimizerPreview,
        optimizerStats,
        optimizerLoading,
        optimizerError,
        setOptimizerTargetRatio: (ratio: number) => {
            const store = getOptimizerStore();
            optimizer.setOptimizerTargetRatio(store, ratio);
            syncOptimizerFromStore(store);
        },
        scheduleOptimizationPreview: (ratio: number) => {
            const store = getOptimizerStore();
            optimizer.scheduleOptimizationPreview(store, ratio);
            syncOptimizerFromStore(store);
        },
        previewOptimization: async (ratio?: number) => {
            const store = getOptimizerStore();
            const result = await optimizer.previewOptimization(store, ratio);
            syncOptimizerFromStore(store);
            return result;
        },
        applyOptimizationPreview: () => {
            const store = getOptimizerStore();
            const ok = optimizer.applyOptimizationPreview(store);
            syncOptimizerFromStore(store);
            if (ok) {
                autosave();
                scheduleGeometryUpdates();
            }
            return ok;
        },
        clearOptimizationPreview: () => {
            const store = getOptimizerStore();
            optimizer.clearOptimizationPreview(store);
            syncOptimizerFromStore(store);
        },
        downloadOptimizationPreview: () => {
            const store = getOptimizerStore();
            const result = optimizer.downloadOptimizationPreview(store);
            syncOptimizerFromStore(store);
            return result;
        },

        // POIs
        pois: pois.pois,
        addPoi,
        updatePoi,
        deletePoi,

        // Export
        exportTrack,
        exportFragment,

        // Time estimation
        estimatedTimeMinutes,
        manualRoutingPercent,
    };
}
