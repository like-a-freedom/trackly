import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

type SpeedUnit = 'kmh' | 'mph';

export const useUnitsStore = defineStore('units', () => {
    let initialSpeedUnit: SpeedUnit = 'kmh';
    try {
        const saved = localStorage.getItem('trackly_speed_unit');
        if (saved === 'kmh' || saved === 'mph') {
            initialSpeedUnit = saved;
        }
    } catch { /* ignore */ }

    const speedUnit = ref<SpeedUnit>(initialSpeedUnit);

    const distanceUnit = computed(() => (speedUnit.value === 'mph' ? 'mi' : 'km'));
    const paceUnit = computed(() => (speedUnit.value === 'mph' ? 'min/mi' : 'min/km'));

    function toggleSpeedUnit(): void {
        speedUnit.value = speedUnit.value === 'kmh' ? 'mph' : 'kmh';
        _savePreference();
    }

    function setSpeedUnit(unit: SpeedUnit): void {
        if (unit === 'kmh' || unit === 'mph') {
            speedUnit.value = unit;
            _savePreference();
        }
    }

    function convertPace(paceMinKm: number, targetUnit?: string): number | null {
        if (typeof paceMinKm !== 'number' || isNaN(paceMinKm) || paceMinKm <= 0) {
            return null;
        }
        const unit = targetUnit || paceUnit.value;
        if (unit === 'min/mi') {
            return paceMinKm * 1.60934;
        }
        return paceMinKm;
    }

    function resetToDefault(): void {
        speedUnit.value = 'kmh';
    }

    function _savePreference(): void {
        try {
            localStorage.setItem('trackly_speed_unit', speedUnit.value);
        } catch { /* ignore */ }
    }

    return {
        speedUnit,
        distanceUnit,
        paceUnit,
        toggleSpeedUnit,
        setSpeedUnit,
        convertPace,
        resetToDefault
    };
});
