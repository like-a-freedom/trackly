import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getColorForId } from '../utils/trackColors';
import { geoJsonLineToLeaflet } from '../utils/coordinates';
import { validateSpeedData } from '../utils/format';
import type { LatLngTuple } from '@/types';

interface Polyline {
    latlngs: LatLngTuple[];
    color: string;
    properties: Record<string, unknown>;
    showTooltip: boolean;
}

interface TrackData {
    avg_speed?: number | null;
    max_speed?: number | null;
    length_km?: number | null;
    duration_seconds?: number | null;
    elevation_up?: number | null;
    elevation_down?: number | null;
    avg_hr?: number | null;
    [key: string]: unknown;
}

export const useTracksStore = defineStore('tracks', () => {
    const polylines = ref<Polyline[]>([]);
    const tracksCollection = ref<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });
    const heatmapPoints = ref<unknown[]>([]);
    const error = ref<string | null>(null);

    function updatePolylines(data: GeoJSON.FeatureCollection): void {
        if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
            tracksCollection.value = data;
            const newPolylines: Polyline[] = [];
            data.features.forEach((feature) => {
                const id = feature.properties?.id as string | undefined;
                const color = getColorForId(id);
                if (feature.geometry?.type === 'MultiLineString') {
                    feature.geometry.coordinates.forEach((coords) => {
                        newPolylines.push({
                            latlngs: geoJsonLineToLeaflet(coords as [number, number][]),
                            color,
                            properties: feature.properties ?? {},
                            showTooltip: false
                        });
                    });
                } else if (feature.geometry?.type === 'LineString') {
                    newPolylines.push({
                        latlngs: geoJsonLineToLeaflet(feature.geometry.coordinates as [number, number][]),
                        color,
                        properties: feature.properties ?? {},
                        showTooltip: false
                    });
                }
            });
            polylines.value = newPolylines;
        }
    }

    function updateTrackInPolylines(trackId: string, updates: Record<string, unknown>): void {
        polylines.value = polylines.value.map((polyline) => {
            if (polyline.properties?.id === trackId) {
                return { ...polyline, properties: { ...polyline.properties, ...updates } };
            }
            return polyline;
        });
        if (tracksCollection.value?.features) {
            tracksCollection.value.features = tracksCollection.value.features.map((feature) => {
                if (feature.properties?.id === trackId) {
                    return { ...feature, properties: { ...feature.properties, ...updates } };
                }
                return feature;
            });
        }
    }

    function processTrackData(trackData: TrackData): TrackData | null {
        if (!trackData || typeof trackData !== 'object') return null;
        const processed: TrackData = { ...trackData };
        if (processed.avg_speed !== undefined && processed.avg_speed !== null) {
            processed.avg_speed = validateSpeedData(processed.avg_speed);
        }
        if (processed.max_speed !== undefined && processed.max_speed !== null) {
            processed.max_speed = validateSpeedData(processed.max_speed);
        }
        if (processed.length_km !== undefined) {
            if (typeof processed.length_km !== 'number' || isNaN(processed.length_km) || processed.length_km < 0) {
                processed.length_km = null;
            }
        }
        if (processed.duration_seconds !== undefined) {
            if (typeof processed.duration_seconds !== 'number' || isNaN(processed.duration_seconds) || processed.duration_seconds < 0) {
                processed.duration_seconds = null;
            }
        }
        (['elevation_up', 'elevation_down', 'avg_hr'] as const).forEach((field) => {
            if (processed[field] !== undefined) {
                if (typeof processed[field] !== 'number' || isNaN(processed[field] as number)) {
                    processed[field] = null;
                }
            }
        });
        return processed;
    }

    return {
        polylines,
        tracksCollection,
        heatmapPoints,
        error,
        updatePolylines,
        updateTrackInPolylines,
        processTrackData
    };
});
