import { defineStore } from 'pinia';
import { ref } from 'vue';

const DISTANCE_MARKERS_KEY = 'trackly_distance_markers';

/** Personal display preferences for this browser, shared across track views. */
export const useMapDisplayStore = defineStore('mapDisplay', () => {
    const distanceMarkersEnabled = ref(true);
    const preferencePersisted = ref(true);
    try {
        distanceMarkersEnabled.value = localStorage.getItem(DISTANCE_MARKERS_KEY) !== 'false';
    } catch {
        preferencePersisted.value = false;
    }

    function setDistanceMarkersEnabled(enabled: boolean): void {
        distanceMarkersEnabled.value = enabled;
        try {
            localStorage.setItem(DISTANCE_MARKERS_KEY, String(enabled));
            preferencePersisted.value = true;
        } catch {
            preferencePersisted.value = false;
        }
    }

    return { distanceMarkersEnabled, preferencePersisted, setDistanceMarkersEnabled };
});
