import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUnits } from '../useUnits';

// Mock localStorage
const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
});

describe('useUnits', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockLocalStorage.getItem.mockReturnValue(null);

        // Reset global state to default
        const { resetToDefault } = useUnits();
        resetToDefault();
    });

    it('should initialize with kmh by default', () => {
        const { speedUnit } = useUnits();
        expect(speedUnit.value).toBe('kmh');
    });

    it('should toggle between kmh and mph', () => {
        const { speedUnit, toggleSpeedUnit } = useUnits();

        expect(speedUnit.value).toBe('kmh');

        toggleSpeedUnit();
        expect(speedUnit.value).toBe('mph');

        toggleSpeedUnit();
        expect(speedUnit.value).toBe('kmh');
    });

    it('should set speed unit directly', () => {
        const { speedUnit, setSpeedUnit } = useUnits();

        setSpeedUnit('mph');
        expect(speedUnit.value).toBe('mph');

        setSpeedUnit('kmh');
        expect(speedUnit.value).toBe('kmh');
    });

    it('should ignore invalid unit values', () => {
        const { speedUnit, setSpeedUnit } = useUnits();

        setSpeedUnit('invalid');
        expect(speedUnit.value).toBe('kmh'); // Should remain unchanged
    });

    it('should return correct distance unit', () => {
        const { getDistanceUnit, setSpeedUnit } = useUnits();

        setSpeedUnit('kmh');
        expect(getDistanceUnit()).toBe('km');

        setSpeedUnit('mph');
        expect(getDistanceUnit()).toBe('mi');
    });

    it('should return correct pace unit', () => {
        const { getPaceUnit, setSpeedUnit } = useUnits();

        setSpeedUnit('kmh');
        expect(getPaceUnit()).toBe('min/km');

        setSpeedUnit('mph');
        expect(getPaceUnit()).toBe('min/mi');
    });

    it('should save to localStorage when unit changes', () => {
        const { setSpeedUnit } = useUnits();

        setSpeedUnit('mph');

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('trackly_speed_unit', 'mph');
    });

    it('should load saved preference from localStorage', () => {
        mockLocalStorage.getItem.mockReturnValue('mph');

        const { speedUnit } = useUnits();

        expect(speedUnit.value).toBe('mph');
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith('trackly_speed_unit');
    });

    it('should handle localStorage errors gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        mockLocalStorage.getItem.mockImplementation(() => {
            throw new Error('localStorage error');
        });

        const { speedUnit } = useUnits();

        expect(speedUnit.value).toBe('kmh'); // Should fall back to default
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});
