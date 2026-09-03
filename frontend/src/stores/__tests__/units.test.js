import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUnitsStore } from '../units';

describe('useUnitsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
    });

    it('initializes with kmh as default speed unit', () => {
        const store = useUnitsStore();
        expect(store.speedUnit).toBe('kmh');
    });

    it('loads saved unit from localStorage', () => {
        localStorage.setItem('trackly_speed_unit', 'mph');
        const store = useUnitsStore();
        expect(store.speedUnit).toBe('mph');
    });

    it('ignores invalid localStorage values', () => {
        localStorage.setItem('trackly_speed_unit', 'invalid');
        const store = useUnitsStore();
        expect(store.speedUnit).toBe('kmh');
    });

    it('toggles speed unit', () => {
        const store = useUnitsStore();
        store.toggleSpeedUnit();
        expect(store.speedUnit).toBe('mph');
        store.toggleSpeedUnit();
        expect(store.speedUnit).toBe('kmh');
    });

    it('sets speed unit to valid values', () => {
        const store = useUnitsStore();
        store.setSpeedUnit('mph');
        expect(store.speedUnit).toBe('mph');
        store.setSpeedUnit('kmh');
        expect(store.speedUnit).toBe('kmh');
    });

    it('ignores invalid speed unit values', () => {
        const store = useUnitsStore();
        store.setSpeedUnit('invalid');
        expect(store.speedUnit).toBe('kmh');
    });

    it('returns correct distance unit', () => {
        const store = useUnitsStore();
        expect(store.distanceUnit).toBe('km');
        store.setSpeedUnit('mph');
        expect(store.distanceUnit).toBe('mi');
    });

    it('returns correct pace unit', () => {
        const store = useUnitsStore();
        expect(store.paceUnit).toBe('min/km');
        store.setSpeedUnit('mph');
        expect(store.paceUnit).toBe('min/mi');
    });

    it('converts pace correctly', () => {
        const store = useUnitsStore();
        const paceMinKm = 5;
        const paceMinMi = store.convertPace(paceMinKm, 'min/mi');
        expect(paceMinMi).toBeCloseTo(paceMinKm * 1.60934, 5);
    });

    it('returns null for invalid pace values', () => {
        const store = useUnitsStore();
        expect(store.convertPace(-1)).toBeNull();
        expect(store.convertPace(0)).toBeNull();
        expect(store.convertPace(NaN)).toBeNull();
        expect(store.convertPace('invalid')).toBeNull();
    });

    it('resets to default', () => {
        const store = useUnitsStore();
        store.setSpeedUnit('mph');
        store.resetToDefault();
        expect(store.speedUnit).toBe('kmh');
    });

    it('persists preference to localStorage', () => {
        const store = useUnitsStore();
        store.setSpeedUnit('mph');
        expect(localStorage.getItem('trackly_speed_unit')).toBe('mph');
    });
});
