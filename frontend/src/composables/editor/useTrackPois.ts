import { ref, type Ref } from 'vue';
import { haversineDistance } from '../../utils/haversine';
import { distancePointToSegmentMeters, isValidCoord } from './trackGeometryUtils';
import type { LatLngTuple, Poi } from '@/types';

const POI_FAR_DISTANCE_M = 1000;

export interface TrackSegment {
    points: LatLngTuple[];
}

export interface PoiWithMetrics extends Poi {
    distFromStart: number;
    distanceToTrack: number;
    isFarFromTrack: boolean;
}

interface UseTrackPoisOptions {
    initialPois?: Poi[];
}

/**
 * Composable for managing POIs (Points of Interest).
 * Can be used standalone or with the editorStore.
 */
export function useTrackPois({ initialPois = [] }: UseTrackPoisOptions = {}) {
    // Store POIs as-is for backward compatibility
    const pois: Ref<PoiWithMetrics[]> = ref(initialPois as PoiWithMetrics[]);

    function getNextPoiName(): string {
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

    function calculateNearestAlongTrack(lat: number, lng: number, segments: TrackSegment[]): { distanceFromStart: number; distanceToTrack: number } {
        let totalDistance = 0;
        let bestDistance = Infinity;
        let bestAlong = 0;

        for (const seg of segments) {
            const points = seg.points || seg;
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                if (!prev || !curr) continue;
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

    function addPoi({ lat, lng, name = '', description = '', category = '' }: { lat: number; lng: number; name?: string; description?: string; category?: string } = {} as any): PoiWithMetrics | null {
        if (!isValidCoord(lat, lng)) return null;

        const cleanedName = (name || '').trim();
        const finalName = cleanedName.length > 0 ? cleanedName : getNextPoiName();

        const poi: PoiWithMetrics = {
            id: String(Date.now() + Math.random()),
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

    function getPoi(id: string): PoiWithMetrics | undefined {
        return pois.value.find((p) => p.id === id);
    }

    function updatePoi(id: string, updates: Partial<PoiWithMetrics>): boolean {
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

    function deletePoi(id: string): boolean {
        const index = pois.value.findIndex((p) => p.id === id);
        if (index === -1) return false;
        pois.value.splice(index, 1);
        return true;
    }

    function clearPois(): void {
        pois.value = [];
    }

    function updatePoiMetrics(segments: TrackSegment[]): void {
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
