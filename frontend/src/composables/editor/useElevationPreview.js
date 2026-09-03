const API_BASE = '';
const MAX_ELEVATION_PREVIEW_POINTS = 2000;

function clampCoordinateArray(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const ratio = (points.length - 1) / (maxPoints - 1);
    const sampled = [];
    for (let i = 0; i < maxPoints; i++) {
        const idx = Math.round(i * ratio);
        sampled.push(points[idx]);
    }
    return sampled;
}

let elevationTimer = null;
let elevationAbort = null;

export function scheduleElevationPreview(store) {
    if (typeof fetch !== 'function') return;
    if (elevationTimer) clearTimeout(elevationTimer);
    elevationTimer = setTimeout(async () => {
        const allPoints = store.coordinateData;
        if (allPoints.length < 2) {
            store.elevationProfile = [];
            store.elevationStats = {};
            store.elevationError = null;
            store.elevationLoading = false;
            return;
        }

        const limitedPoints = clampCoordinateArray(
            allPoints.map(([lat, lng]) => [lat, lng]),
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
        } catch (e) {
            if (e.name !== 'AbortError') {
                store.elevationError = 'Unable to fetch elevation profile';
            }
        } finally {
            store.elevationLoading = false;
        }
    }, 600);
}

export function cancelElevationPreview() {
    if (elevationTimer) clearTimeout(elevationTimer);
    if (elevationAbort) {
        elevationAbort.abort();
    }
}
