import { ref } from 'vue';

// Global reactive speed unit state
const speedUnit = ref('kmh');

/**
 * Global unit management composable
 * Provides consistent unit handling across all components
 */
export function useUnits() {
    // Toggle between km/h and mph
    function toggleSpeedUnit() {
        speedUnit.value = speedUnit.value === 'kmh' ? 'mph' : 'kmh';
        saveUnitPreference();
    }

    // Set speed unit directly
    function setSpeedUnit(unit) {
        if (unit === 'kmh' || unit === 'mph') {
            speedUnit.value = unit;
            saveUnitPreference();
        }
    }

    // Get distance unit based on speed unit
    function getDistanceUnit() {
        return speedUnit.value === 'mph' ? 'mi' : 'km';
    }

    // Get pace unit based on speed unit
    function getPaceUnit() {
        return speedUnit.value === 'mph' ? 'min/mi' : 'min/km';
    }

    // Convert pace from min/km to appropriate unit
    function convertPace(paceMinKm, targetUnit = null) {
        if (typeof paceMinKm !== 'number' || isNaN(paceMinKm) || paceMinKm <= 0) {
            return null;
        }

        const unit = targetUnit || getPaceUnit();

        if (unit === 'min/mi') {
            // Convert min/km to min/mi: multiply by 1.60934 (km per mile)
            return paceMinKm * 1.60934;
        }

        // Return as-is for min/km
        return paceMinKm;
    }

    // Save unit preference to localStorage
    function saveUnitPreference() {
        try {
            localStorage.setItem('trackly_speed_unit', speedUnit.value);
        } catch (error) {
            console.warn('Could not save unit preference to localStorage:', error);
        }
    }

    // Load unit preference from localStorage
    function loadUnitPreference() {
        try {
            const saved = localStorage.getItem('trackly_speed_unit');
            if (saved === 'kmh' || saved === 'mph') {
                speedUnit.value = saved;
            }
        } catch (error) {
            console.warn('Could not load unit preference from localStorage:', error);
        }
    }

    // Reset function for testing purposes
    function resetToDefault() {
        speedUnit.value = 'kmh';
    }

    // Initialize with saved preference
    loadUnitPreference();

    return {
        speedUnit,
        toggleSpeedUnit,
        setSpeedUnit,
        getDistanceUnit,
        getPaceUnit,
        convertPace,
        saveUnitPreference,
        loadUnitPreference,
        resetToDefault
    };
}
