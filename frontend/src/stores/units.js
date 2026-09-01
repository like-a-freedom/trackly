import { defineStore } from 'pinia';

export const useUnitsStore = defineStore('units', {
    state: () => {
        let speedUnit = 'kmh';
        try {
            const saved = localStorage.getItem('trackly_speed_unit');
            if (saved === 'kmh' || saved === 'mph') {
                speedUnit = saved;
            }
        } catch { /* ignore */ }
        return { speedUnit };
    },

    getters: {
        distanceUnit: (state) => (state.speedUnit === 'mph' ? 'mi' : 'km'),
        paceUnit: (state) => (state.speedUnit === 'mph' ? 'min/mi' : 'min/km')
    },

    actions: {
        toggleSpeedUnit() {
            this.speedUnit = this.speedUnit === 'kmh' ? 'mph' : 'kmh';
            this._savePreference();
        },

        setSpeedUnit(unit) {
            if (unit === 'kmh' || unit === 'mph') {
                this.speedUnit = unit;
                this._savePreference();
            }
        },

        convertPace(paceMinKm, targetUnit) {
            if (typeof paceMinKm !== 'number' || isNaN(paceMinKm) || paceMinKm <= 0) {
                return null;
            }
            const unit = targetUnit || this.paceUnit;
            if (unit === 'min/mi') {
                return paceMinKm * 1.60934;
            }
            return paceMinKm;
        },

        resetToDefault() {
            this.speedUnit = 'kmh';
        },

        _savePreference() {
            try {
                localStorage.setItem('trackly_speed_unit', this.speedUnit);
            } catch { /* ignore */ }
        }
    }
});
