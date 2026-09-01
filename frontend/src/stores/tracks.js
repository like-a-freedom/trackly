import { defineStore } from 'pinia';
import { getColorForId } from '../utils/trackColors';
import { geoJsonLineToLeaflet } from '../utils/coordinates';

export const useTracksStore = defineStore('tracks', {
    state: () => ({
        polylines: [],
        tracksCollection: { type: 'FeatureCollection', features: [] },
        heatmapPoints: [],
        error: null,
        bboxCache: new Map()
    }),

    actions: {
        getCachedTracks(bboxString) {
            const cached = this.bboxCache.get(bboxString);
            if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
                return cached.data;
            }
            if (cached) this.bboxCache.delete(bboxString);
            return null;
        },

        setCachedTracks(bboxString, data) {
            this.bboxCache.set(bboxString, { data, timestamp: Date.now() });
            if (this.bboxCache.size > 100) {
                const oldest = this.bboxCache.keys().next().value;
                this.bboxCache.delete(oldest);
            }
        },

        getCachedHeatmap(cacheKey) {
            const cached = this.bboxCache.get(`heatmap_${cacheKey}`);
            if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
                return cached.data;
            }
            if (cached) this.bboxCache.delete(`heatmap_${cacheKey}`);
            return null;
        },

        setCachedHeatmap(cacheKey, data) {
            this.bboxCache.set(`heatmap_${cacheKey}`, { data, timestamp: Date.now() });
        },

        clearHeatmap() {
            this.heatmapPoints = [];
        },

        updatePolylines(data) {
            if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
                this.tracksCollection = data;
                const newPolylines = [];
                data.features.forEach((feature) => {
                    const id = feature.properties?.id;
                    const color = getColorForId(id);
                    if (feature.geometry?.type === 'MultiLineString') {
                        feature.geometry.coordinates.forEach((coords) => {
                            newPolylines.push({
                                latlngs: geoJsonLineToLeaflet(coords),
                                color,
                                properties: feature.properties,
                                showTooltip: false
                            });
                        });
                    } else if (feature.geometry?.type === 'LineString') {
                        newPolylines.push({
                            latlngs: geoJsonLineToLeaflet(feature.geometry.coordinates),
                            color,
                            properties: feature.properties,
                            showTooltip: false
                        });
                    }
                });
                this.polylines = newPolylines;
            }
        },

        updateTrackInPolylines(trackId, updates) {
            this.polylines = this.polylines.map((polyline) => {
                if (polyline.properties?.id === trackId) {
                    return { ...polyline, properties: { ...polyline.properties, ...updates } };
                }
                return polyline;
            });
            if (this.tracksCollection?.features) {
                this.tracksCollection.features = this.tracksCollection.features.map((feature) => {
                    if (feature.properties?.id === trackId) {
                        return { ...feature, properties: { ...feature.properties, ...updates } };
                    }
                    return feature;
                });
            }
        },

        processTrackData(trackData) {
            if (!trackData || typeof trackData !== 'object') return null;
            const processed = { ...trackData };
            if (processed.avg_speed !== undefined) {
                const v = Number(processed.avg_speed);
                processed.avg_speed = isNaN(v) || v < 0 ? null : v;
            }
            if (processed.max_speed !== undefined) {
                const v = Number(processed.max_speed);
                processed.max_speed = isNaN(v) || v < 0 ? null : v;
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
            ['elevation_up', 'elevation_down', 'avg_hr'].forEach((field) => {
                if (processed[field] !== undefined) {
                    if (typeof processed[field] !== 'number' || isNaN(processed[field])) {
                        processed[field] = null;
                    }
                }
            });
            return processed;
        }
    }
});
