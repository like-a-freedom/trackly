import { ref, type Ref } from 'vue';
import type { Poi } from '@/types';

/**
 * Composable for managing POIs (Points of Interest)
 */
export function usePois() {
    const pois: Ref<Poi[]> = ref([]);
    const loading: Ref<boolean> = ref(false);
    const error: Ref<string | null> = ref(null);

    /**
     * Fetch POIs for a specific track
     * @param trackId - UUID of the track
     * @returns Array of POIs with distance information
     */
    async function fetchTrackPois(trackId: string): Promise<Poi[]> {
        if (!trackId) {
            console.warn('[usePois] No trackId provided');
            return [];
        }

        loading.value = true;
        error.value = null;

        try {
            console.log(`[usePois] Fetching POIs for track ${trackId}`);
            const response = await fetch(`/api/tracks/${trackId}/pois`);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log(`[usePois] No POIs found for track ${trackId}`);
                    pois.value = [];
                    return [];
                }
                throw new Error(`Failed to fetch POIs: ${response.status}`);
            }

            const data: Poi[] = await response.json();
            console.log(`[usePois] Fetched ${data.length} POIs for track ${trackId}`);
            pois.value = data;
            return data;
        } catch (err: unknown) {
            console.error('[usePois] Error fetching track POIs:', err);
            error.value = err instanceof Error ? err.message : 'Unknown error';
            pois.value = [];
            return [];
        } finally {
            loading.value = false;
        }
    }

    /**
     * Fetch POIs within a bounding box
     * @param bbox - Bounding box string "minLon,minLat,maxLon,maxLat"
     * @param limit - Maximum number of POIs to fetch
     * @returns Object with pois array and total count
     */
    async function fetchPoisInBbox(bbox: string, limit: number = 100): Promise<{ pois: Poi[]; total: number }> {
        loading.value = true;
        error.value = null;

        try {
            const params = new URLSearchParams({ bbox, limit: limit.toString() });
            console.log(`[usePois] Fetching POIs in bbox: ${bbox}`);
            const response = await fetch(`/api/pois?${params}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch POIs: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[usePois] Fetched ${data.pois.length} POIs in bbox`);
            pois.value = data.pois;
            return data;
        } catch (err: unknown) {
            console.error('[usePois] Error fetching POIs in bbox:', err);
            error.value = err instanceof Error ? err.message : 'Unknown error';
            pois.value = [];
            return { pois: [], total: 0 };
        } finally {
            loading.value = false;
        }
    }

    // Client-only approach: POIs are fetched and clustering is performed on the frontend (PoiClusterGroup.vue)

    /**
     * Clear all POI and cluster data
     */
    function clearPois(): void {
        pois.value = [];
        // Server clusters not used; client-side clustering used in PoiClusterGroup
        error.value = null;
    }

    return {
        pois,
        loading,
        error,
        fetchTrackPois,
        fetchPoisInBbox,
        clearPois,
    };
}
