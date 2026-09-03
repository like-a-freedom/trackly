/**
 * Composable for track POI (Point of Interest) management.
 * Handles POI CRUD operations and metrics calculation.
 */
import { ref } from 'vue';
import { haversineDistance } from '../../utils/haversine';

export function useTrackPois(options = {}) {
    const pois = ref(options.initialPois || []);

    // Far distance threshold in meters
    const POI_FAR_DISTANCE_M = 1000;

    /**
     * Calculate nearest point metrics for a POI.
     * @param {number} lat - POI latitude
     * @param {number} lng - POI longitude
     * @param {Array} segments - Track segments
     * @returns {{distanceFromStart: number, distanceToTrack: number, nearestPoint: Object}}
     */
    function calculateNearestMetrics(lat, lng, segments) {
        let distanceFromStart = 0;
        let minDistToTrack = Infinity;
        let nearestPoint = null;

        for (const seg of segments) {
            for (let i = 0; i < seg.points.length; i++) {
                const [ptLat, ptLng] = seg.points[i];
                const dist = haversineDistance({ lat, lng }, { lat: ptLat, lng: ptLng });

                if (dist < minDistToTrack) {
                    minDistToTrack = dist;
                    nearestPoint = { lat: ptLat, lng: ptLng, segIndex: seg.index, pointIndex: i };
                }
                if (i > 0) {
                    const [prevLat, prevLng] = seg.points[i - 1];
                    distanceFromStart += haversineDistance(
                        { lat: prevLat, lng: prevLng },
                        { lat: ptLat, lng: ptLng }
                    );
                }
            }
        }

        return {
            distanceFromStart,
            distanceToTrack: minDistToTrack,
            nearestPoint,
        };
    }

    /**
     * Update POI metrics based on track segments.
     * @param {Array} segments - Track segments
     */
    function updatePoiMetrics(segments) {
        for (const poi of pois.value) {
            const metrics = calculateNearestMetrics(poi.lat, poi.lng, segments);
            poi.distFromStart = metrics.distanceFromStart;
            poi.distanceToTrack = metrics.distanceToTrack;
            poi.isFarFromTrack = metrics.distanceToTrack > POI_FAR_DISTANCE_M;
        }
    }

    /**
     * Get next available POI name.
     * @returns {string} Next POI name (e.g., "POI 001")
     */
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

    /**
     * Add a new POI.
     * @param {Object} poi - POI data
     * @returns {Object} Added POI
     */
    function addPoi(poi) {
        const newPoi = {
            id: poi.id || Date.now(),
            name: poi.name || getNextPoiName(),
            lat: poi.lat,
            lng: poi.lng,
            category: poi.category || 'default',
            description: poi.description || '',
        };
        pois.value.push(newPoi);
        return newPoi;
    }

    /**
     * Update an existing POI.
     * @param {string|number} id - POI ID
     * @param {Object} updates - Fields to update
     * @returns {boolean} Whether the update succeeded
     */
    function updatePoi(id, updates) {
        const poi = pois.value.find((p) => p.id === id);
        if (!poi) return false;
        Object.assign(poi, updates);
        return true;
    }

    /**
     * Delete a POI by ID.
     * @param {string|number} id - POI ID
     * @returns {boolean} Whether the deletion succeeded
     */
    function deletePoi(id) {
        const index = pois.value.findIndex((p) => p.id === id);
        if (index === -1) return false;
        pois.value.splice(index, 1);
        return true;
    }

    /**
     * Get POI by ID.
     * @param {string|number} id - POI ID
     * @returns {Object|undefined} POI or undefined
     */
    function getPoi(id) {
        return pois.value.find((p) => p.id === id);
    }

    /**
     * Clear all POIs.
     */
    function clearPois() {
        pois.value = [];
    }

    return {
        pois,
        getNextPoiName,
        updatePoiMetrics,
        addPoi,
        updatePoi,
        deletePoi,
        getPoi,
        clearPois,
    };
}
