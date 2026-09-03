import { ref, computed } from 'vue';
import { haversineDistance } from '../../utils/haversine.js';
import { distancePointToSegmentMeters, isValidCoord } from './trackGeometryUtils.js';

const POI_FAR_DISTANCE_M = 1000;

/**
 * Composable for managing POIs (Points of Interest).
 * Can be used standalone or with the editorStore.
 *
 * @param {Object} options
 * @param {Array} options.initialPois - Initial POIs array
 * @returns {Object} POI management API
 */
export function useTrackPois({ initialPois = [] } = {}) {
    const pois = ref([...initialPois]);

    function getNextPoiName() {
        let maxNumber = 0;
        for (const poi of pois.value) {
            const match = /^POI\s*(\d{3})$/.exec(poi.name || '');
            if (match) {
                const num = Number(match[1]);
                if (!Number.isNaN(num)) {
                    maxNumber = Math.max(maxNumber, num);
                }
            }
        }
        const next = String(maxNumber + 1).padStart(3, '0');
        return `POI ${next}`;
    }

    function calculateNearestAlongTrack(lat, lng, segments) {
        let totalDistance = 0;
        let bestDistance = Infinity;
        let bestAlong = 0;

        for (const seg of segments) {
            const points = seg.points || seg;
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const segmentLength = haversineDistance(
                    { lat: prev[0], lng: prev[1] },
                    { lat: curr[0], lng: curr[1] }
                );

                const result = distancePointToSegmentMeters(
                    { lat, lng },
                    { lat: prev[0], lng: prev[1] },
                    { lat: curr[0], lng: curr[1] }
                );

                if (result.distance < bestDistance) {
                    bestDistance = result.distance;
                    bestAlong = totalDistance + segmentLength * result.t;
                }

                totalDistance += segmentLength;
            }
        }

        return {
            distanceFromStart: Math.round(bestAlong),
            distanceToTrack: Math.round(bestDistance),
        };
    }

    function addPoi({ lat, lng, name = '', description = '', category = '' } = {}) {
        if (!isValidCoord(lat, lng)) return null;

        const cleanedName = (name || '').trim();
        const finalName = cleanedName.length > 0 ? cleanedName : getNextPoiName();

        const poi = {
            id: Date.now() + Math.random(),
            lat,
            lng,
            name: finalName,
            description: description.trim(),
            category,
            distFromStart: 0,
            distanceToTrack: 0,
            isFarFromTrack: false,
        };

        pois.value.push(poi);
        return poi;
    }

    function getPoi(id) {
        return pois.value.find((p) => p.id === id);
    }

    function updatePoi(id, updates) {
        const poi = getPoi(id);
        if (!poi) return false;

        if (updates.name !== undefined) {
            const cleaned = updates.name.trim();
            if (cleaned.length === 0) return false;
            poi.name = cleaned;
        }
        if (updates.description !== undefined) {
            poi.description = (updates.description ?? '').trim();
        }
        if (updates.category !== undefined) {
            poi.category = updates.category;
        }
        if (updates.lat !== undefined) poi.lat = updates.lat;
        if (updates.lng !== undefined) poi.lng = updates.lng;

        return true;
    }

    function deletePoi(id) {
        const index = pois.value.findIndex((p) => p.id === id);
        if (index === -1) return false;
        pois.value.splice(index, 1);
        return true;
    }

    function clearPois() {
        pois.value = [];
    }

    function updatePoiMetrics(segments) {
        for (const poi of pois.value) {
            const metrics = calculateNearestAlongTrack(poi.lat, poi.lng, segments);
            poi.distFromStart = metrics.distanceFromStart;
            poi.distanceToTrack = metrics.distanceToTrack;
            poi.isFarFromTrack = metrics.distanceToTrack > POI_FAR_DISTANCE_M;
        }
    }

    return {
        pois,
        addPoi,
        getPoi,
        updatePoi,
        deletePoi,
        clearPois,
        getNextPoiName,
        updatePoiMetrics,
    };
}

// ── Standalone functions for use with editorStore ────────────────

export function calculateNearestAlongTrackStandalone(store, lat, lng) {
    let totalDistance = 0;
    let bestDistance = Infinity;
    let bestAlong = 0;

    for (const seg of store.segments) {
        for (let i = 1; i < seg.points.length; i++) {
            const prev = seg.points[i - 1];
            const curr = seg.points[i];
            const segmentLength = haversineDistance(
                { lat: prev[0], lng: prev[1] },
                { lat: curr[0], lng: curr[1] }
            );

            const result = distancePointToSegmentMeters(
                { lat, lng },
                { lat: prev[0], lng: prev[1] },
                { lat: curr[0], lng: curr[1] }
            );

            if (result.distance < bestDistance) {
                bestDistance = result.distance;
                bestAlong = totalDistance + segmentLength * result.t;
            }

            totalDistance += segmentLength;
        }
    }

    return {
        distanceFromStart: Math.round(bestAlong),
        distanceToTrack: Math.round(bestDistance),
    };
}

export function getNextPoiNameStandalone(store) {
    let maxNumber = 0;
    for (const poi of store.pois) {
        const match = /^POI\s*(\d{3})$/.exec(poi.name || '');
        if (match) {
            const num = Number(match[1]);
            if (!Number.isNaN(num)) {
                maxNumber = Math.max(maxNumber, num);
            }
        }
    }
    const next = String(maxNumber + 1).padStart(3, '0');
    return `POI ${next}`;
}

export function updatePoiMetricsStandalone(store) {
    for (const poi of store.pois) {
        const metrics = calculateNearestAlongTrackStandalone(store, poi.lat, poi.lng);
        poi.distFromStart = metrics.distanceFromStart;
        poi.distanceToTrack = metrics.distanceToTrack;
        poi.isFarFromTrack = metrics.distanceToTrack > POI_FAR_DISTANCE_M;
    }
}

export function addPoiStandalone(store, lat, lng, name, { description = '', category = '' } = {}) {
    if (!isValidCoord(lat, lng)) return { ok: false };

    const cleanedName = (name || '').trim();
    const finalName = cleanedName.length > 0 ? cleanedName : getNextPoiNameStandalone(store);

    const metrics = calculateNearestAlongTrackStandalone(store, lat, lng);

    const poi = {
        lat,
        lng,
        name: finalName,
        description: description.trim(),
        category,
        distFromStart: metrics.distanceFromStart,
        distanceToTrack: metrics.distanceToTrack,
        isFarFromTrack: metrics.distanceToTrack > POI_FAR_DISTANCE_M,
        id: null,
    };

    store.pois.push(poi);

    return {
        ok: true,
        warning: poi.isFarFromTrack
            ? 'POI is more than 1 km from the track'
            : null,
        poi,
    };
}

export function updatePoiStandalone(store, poiIndex, updates) {
    const poi = store.pois[poiIndex];
    if (!poi) return { ok: false, error: 'POI not found' };
    if (updates.name !== undefined && updates.name.trim().length === 0) {
        return { ok: false, error: 'POI name cannot be empty' };
    }

    const nextName = updates.name !== undefined ? updates.name.trim() : poi.name;
    const nextDescription = updates.description !== undefined
        ? (updates.description ?? '').trim()
        : (poi.description ?? '');
    const nextCategory = updates.category !== undefined
        ? updates.category
        : (poi.category ?? '');

    poi.name = nextName;
    poi.description = nextDescription;
    poi.category = nextCategory;

    return { ok: true };
}

export function deletePoiStandalone(store, poiIndex) {
    if (poiIndex < 0 || poiIndex >= store.pois.length) {
        return { ok: false, error: 'POI not found' };
    }

    store.pois.splice(poiIndex, 1);
    return { ok: true };
}
