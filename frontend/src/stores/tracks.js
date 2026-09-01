import { defineStore } from 'pinia';
import { getColorForId } from '../utils/trackColors';
import { geoJsonLineToLeaflet } from '../utils/coordinates';
import { validateSpeedData } from '../utils/format';

export const useTracksStore = defineStore('tracks', {
    state: () => ({
        polylines: [],
        tracksCollection: { type: 'FeatureCollection', features: [] },
        heatmapPoints: [],
        error: null
    }),

    actions: {
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
                processed.avg_speed = validateSpeedData(processed.avg_speed);
            }
            if (processed.max_speed !== undefined) {
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
