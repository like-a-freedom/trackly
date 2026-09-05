import type { LatLngTuple, ElevationPoint } from '@/types';

const API_BASE = '';
const MAX_ELEVATION_PREVIEW_POINTS = 2000;

function clampCoordinateArray(points: LatLngTuple[], maxPoints: number): LatLngTuple[] {
    if (points.length <= maxPoints) return points;
    const ratio = (points.length - 1) / (maxPoints - 1);
    const sampled: LatLngTuple[] = [];
    for (let i = 0; i < maxPoints; i++) {
        const idx = Math.round(i * ratio);
        const point = points[idx];
        if (point) sampled.push(point);
    }
    return sampled;
}

interface ElevationStats {
    gain?: number;
    loss?: number;
    min?: number;
    max?: number;
    dataset?: string;
    enriched: boolean;
    _lastUpdated: number;
}

interface EditorStore {
    coordinateData: LatLngTuple[];
    elevationProfile: ElevationPoint[];
    elevationStats: ElevationStats;
    elevationError: string | null;
    elevationLoading: boolean;
}

let elevationTimer: ReturnType<typeof setTimeout> | null = null;
let elevationAbort: AbortController | null = null;

export function scheduleElevationPreview(store: EditorStore): void {
    if (typeof fetch !== 'function') return;
    if (elevationTimer) clearTimeout(elevationTimer);
    elevationTimer = setTimeout(async () => {
        const allPoints = store.coordinateData;
        if (allPoints.length < 2) {
            store.elevationProfile = [];
            store.elevationStats = { enriched: false, _lastUpdated: Date.now() };
            store.elevationError = null;
            store.elevationLoading = false;
            return;
        }

        const limitedPoints = clampCoordinateArray(
            allPoints.map(([lat, lng]) => [lat, lng] as LatLngTuple),
            MAX_ELEVATION_PREVIEW_POINTS
        );

        store.elevationLoading = true;
        store.elevationError = null;

        if (elevationAbort) {
            elevationAbort.abort();
        }
        elevationAbort = new AbortController();

        try {
            const resp = await fetch(`${API_BASE}/api/elevation/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: limitedPoints }),
                signal: elevationAbort.signal,
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            store.elevationProfile = data.elevation_profile || [];
            store.elevationStats = {
                gain: data.elevation_gain,
                loss: data.elevation_loss,
                min: data.elevation_min,
                max: data.elevation_max,
                dataset: data.elevation_dataset,
                enriched: true,
                _lastUpdated: Date.now(),
            };
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'AbortError')) {
                store.elevationError = 'Unable to fetch elevation profile';
            }
        } finally {
            store.elevationLoading = false;
        }
    }, 600);
}

export function cancelElevationPreview(): void {
    if (elevationTimer) clearTimeout(elevationTimer);
    if (elevationAbort) {
        elevationAbort.abort();
    }
    elevationTimer = null;
    elevationAbort = null;
}
