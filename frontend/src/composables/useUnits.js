import { computed } from 'vue';
import { useUnitsStore } from '../stores/units.js';

/**
 * Global unit management composable.
 * Thin wrapper over useUnitsStore.
 */
export function useUnits() {
    const store = useUnitsStore();
    const speedUnit = computed(() => store.speedUnit);

    return {
        speedUnit,
        toggleSpeedUnit: store.toggleSpeedUnit.bind(store),
        setSpeedUnit: store.setSpeedUnit.bind(store),
        getDistanceUnit: () => store.distanceUnit,
        getPaceUnit: () => store.paceUnit,
        convertPace: (p, u) => store.convertPace(p, u),
        saveUnitPreference: store._savePreference.bind(store),
        loadUnitPreference: () => {},
        resetToDefault: store.resetToDefault.bind(store)
    };
}
