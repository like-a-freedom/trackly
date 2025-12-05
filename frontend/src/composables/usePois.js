import { ref } from 'vue';

/**
 * Composable for managing POIs (Points of Interest)
 */
export function usePois() {
  const pois = ref([]);
  const loading = ref(false);
  const error = ref(null);

  /**
   * Fetch POIs for a specific track
   * @param {string} trackId - UUID of the track
   * @returns {Promise<Array>} Array of POIs with distance information
   */
  async function fetchTrackPois(trackId) {
    if (!trackId) {
      console.warn('[usePois] No trackId provided');
      return [];
    }

    loading.value = true;
    error.value = null;

    try {
      console.log(`[usePois] Fetching POIs for track ${trackId}`);
      const response = await fetch(`/tracks/${trackId}/pois`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[usePois] No POIs found for track ${trackId}`);
          pois.value = [];
          return [];
        }
        throw new Error(`Failed to fetch POIs: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[usePois] Fetched ${data.length} POIs for track ${trackId}`);
      pois.value = data;
      return data;
    } catch (err) {
      console.error('[usePois] Error fetching track POIs:', err);
      error.value = err.message;
      pois.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Fetch POIs within a bounding box
   * @param {string} bbox - Bounding box string "minLon,minLat,maxLon,maxLat"
   * @param {number} limit - Maximum number of POIs to fetch
   * @returns {Promise<Object>} Object with pois array and total count
   */
  async function fetchPoisInBbox(bbox, limit = 100) {
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams({ bbox, limit });
      console.log(`[usePois] Fetching POIs in bbox: ${bbox}`);
      const response = await fetch(`/pois?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch POIs: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[usePois] Fetched ${data.pois.length} POIs in bbox`);
      pois.value = data.pois;
      return data;
    } catch (err) {
      console.error('[usePois] Error fetching POIs in bbox:', err);
      error.value = err.message;
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
  function clearPois() {
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
