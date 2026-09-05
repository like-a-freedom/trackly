import { geojsonToPoints } from './trackGeometryUtils';
import type { LatLngTuple, Segment } from '@/types';

const API_BASE = '';
const OPTIMIZER_DEFAULT_RATIO = 0.1;
const OPTIMIZER_MIN_RATIO = 0.01;
const OPTIMIZER_MAX_RATIO = 1.0;

interface OptimizerPreview {
    geometry: GeoJSON.Geometry;
    segments: LatLngTuple[][];
    waypoints: number[][];
}

interface OptimizerStats {
    originalPoints: number;
    simplifiedPoints: number;
    compressionRatio: number;
    toleranceUsed: number;
}

interface EditorStore {
    segments: Segment[];
    activeSegmentIndex: number;
    optimizerTargetRatio: number;
    optimizerPreview: OptimizerPreview | null;
    optimizerStats: OptimizerStats | null;
    optimizerError: string | null;
    optimizerLoading: boolean;
    trackName: string;
    coordinateData: LatLngTuple[];
}

export interface TrackOptimizer {
    setOptimizerTargetRatio(store: EditorStore, nextRatio: number): void;
    scheduleOptimizationPreview(store: EditorStore, ratio: number): void;
    previewOptimization(store: EditorStore, ratio?: number): Promise<boolean>;
    applyOptimizationPreview(store: EditorStore): boolean;
    clearOptimizationPreview(store: EditorStore, options?: { keepRatio?: boolean; silent?: boolean }): void;
    downloadOptimizationPreview(store: EditorStore): boolean;
}

export function useTrackOptimizer(): TrackOptimizer {
    let optimizerTimer: ReturnType<typeof setTimeout> | null = null;
    let optimizerAbort: AbortController | null = null;

    function setOptimizerTargetRatio(store: EditorStore, nextRatio: number): void {
        const ratio = Number(nextRatio);
        if (!Number.isFinite(ratio)) return;
        store.optimizerTargetRatio = Math.min(
            OPTIMIZER_MAX_RATIO,
            Math.max(OPTIMIZER_MIN_RATIO, ratio)
        );
        scheduleOptimizationPreview(store, store.optimizerTargetRatio);
    }

    function scheduleOptimizationPreview(store: EditorStore, ratio: number): void {
        if (optimizerTimer) clearTimeout(optimizerTimer);
        optimizerTimer = setTimeout(() => {
            previewOptimization(store, ratio);
        }, 500);
    }

    async function previewOptimization(store: EditorStore, ratio: number = store.optimizerTargetRatio): Promise<boolean> {
        if (typeof fetch !== 'function') return false;

        const coords = store.segments
            .filter((s) => s.points.length >= 2)
            .map((s) => s.points.map(([lat, lng]) => [lng, lat]));

        if (coords.length === 0) {
            store.optimizerError = 'Track needs at least 2 points to optimize.';
            return false;
        }

        const geojson: GeoJSON.MultiLineString = { type: 'MultiLineString', coordinates: coords };

        store.optimizerLoading = true;
        store.optimizerError = null;

        if (optimizerAbort) {
            optimizerAbort.abort();
        }
        optimizerAbort = new AbortController();

        try {
            const resp = await fetch(`${API_BASE}/api/tracks/simplify-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    geometry: geojson,
                    waypoints: buildWaypointsMatrix(store),
                    target_ratio: ratio,
                }),
                signal: optimizerAbort.signal,
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            const previewSegments = geojsonToPoints(data.geometry);
            store.optimizerPreview = {
                geometry: data.geometry,
                segments: previewSegments,
                waypoints: Array.isArray(data.waypoints) ? data.waypoints : [],
            };
            store.optimizerStats = {
                originalPoints: data.original_points,
                simplifiedPoints: data.simplified_points,
                compressionRatio: data.compression_ratio,
                toleranceUsed: data.tolerance_used,
            };
            return true;
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'AbortError')) {
                store.optimizerError = 'Unable to build optimization preview.';
            }
            return false;
        } finally {
            store.optimizerLoading = false;
        }
    }

    function applyOptimizationPreview(store: EditorStore): boolean {
        if (!store.optimizerPreview?.segments?.length) return false;

        const nextSegments: Segment[] = store.optimizerPreview.segments.map((points, idx) => {
            const waypointList = store.optimizerPreview!.waypoints?.[idx] || [];
            const prevSegment = store.segments[idx];
            const segment: Segment = {
                points,
                waypoints: waypointList.filter((wp) => wp >= 0 && wp < points.length),
                surfaceTypes: points.map(() => 'unknown'),
                name: prevSegment?.name ?? null,
                color: prevSegment?.color || '#2196F3',
            };
            if (segment.points.length > 0) {
                const waypointSet = new Set(segment.waypoints);
                waypointSet.add(0);
                waypointSet.add(segment.points.length - 1);
                segment.waypoints = Array.from(waypointSet)
                    .filter((i) => i >= 0 && i < segment.points.length)
                    .sort((a, b) => a - b);
            }
            return segment;
        });

        store.segments = nextSegments.length > 0 ? nextSegments : [{ points: [], waypoints: [], surfaceTypes: [], name: null, color: '#2196F3' }];
        store.activeSegmentIndex = Math.min(
            store.activeSegmentIndex,
            store.segments.length - 1
        );

        clearOptimizationPreview(store, { keepRatio: true });
        return true;
    }

    function clearOptimizationPreview(store: EditorStore, { keepRatio = true, silent = false }: { keepRatio?: boolean; silent?: boolean } = {}): void {
        if (optimizerTimer) clearTimeout(optimizerTimer);
        if (optimizerAbort) {
            optimizerAbort.abort();
        }
        optimizerTimer = null;
        optimizerAbort = null;
        store.optimizerPreview = null;
        store.optimizerStats = null;
        if (!silent) {
            store.optimizerError = null;
        }
        if (!keepRatio) {
            store.optimizerTargetRatio = OPTIMIZER_DEFAULT_RATIO;
        }
    }

    function downloadOptimizationPreview(store: EditorStore): boolean {
        if (!store.optimizerPreview?.geometry) return false;
        const data = store.optimizerPreview.geometry;
        const blob = new Blob([JSON.stringify(data)], {
            type: 'application/geo+json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${store.trackName || 'track'}-optimized.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    function buildWaypointsMatrix(store: EditorStore): number[][] {
        return store.segments.map((seg) => [...seg.waypoints]);
    }

    return {
        setOptimizerTargetRatio,
        scheduleOptimizationPreview,
        previewOptimization,
        applyOptimizationPreview,
        clearOptimizationPreview,
        downloadOptimizationPreview,
    };
}
