import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    validateSpeedData,
    formatSpeed,
    calculatePaceFromSpeed,
    speedToPace,
    paceToSpeed,
    formatDuration,
    formatDistance,
    formatPace
} from '../useTracks';

describe('useTracks utility functions', () => {

    describe('validateSpeedData', () => {
        it('returns valid speed when input is a positive number', () => {
            expect(validateSpeedData(10.5)).toBe(10.5);
            expect(validateSpeedData(0)).toBe(0);
            expect(validateSpeedData(199.9)).toBe(199.9);
        });

        it('returns null for invalid inputs', () => {
            expect(validateSpeedData(-1)).toBe(null);
            expect(validateSpeedData(201)).toBe(null);
            expect(validateSpeedData(NaN)).toBe(null);
            expect(validateSpeedData('10')).toBe(null);
            expect(validateSpeedData(null)).toBe(null);
            expect(validateSpeedData(undefined)).toBe(null);
        });

        it('handles edge cases', () => {
            expect(validateSpeedData(0)).toBe(0);
            expect(validateSpeedData(200)).toBe(200);
            expect(validateSpeedData(Infinity)).toBe(null);
            expect(validateSpeedData(-Infinity)).toBe(null);
        });
    });

    describe('formatSpeed', () => {
        it('formats speed in km/h by default', () => {
            expect(formatSpeed(10.5)).toBe('10.50 km/h');
            expect(formatSpeed(0)).toBe('0.00 km/h');
            expect(formatSpeed(100.567)).toBe('100.57 km/h');
        });

        it('formats speed in mph when unit is specified', () => {
            expect(formatSpeed(10, 'mph')).toBe('6.21 mph');
            expect(formatSpeed(16.09, 'mph')).toBe('10.00 mph');
        });

        it('returns N/A for invalid speeds', () => {
            expect(formatSpeed(-1)).toBe('N/A');
            expect(formatSpeed(null)).toBe('N/A');
            expect(formatSpeed(undefined)).toBe('N/A');
            expect(formatSpeed(NaN)).toBe('N/A');
            expect(formatSpeed(250)).toBe('N/A');
        });

        it('handles edge cases correctly', () => {
            expect(formatSpeed(0)).toBe('0.00 km/h');
            expect(formatSpeed(200)).toBe('200.00 km/h');
        });
    });

    describe('calculatePaceFromSpeed', () => {
        it('calculates pace in min/km from speed', () => {
            expect(calculatePaceFromSpeed(10)).toBe('6:00 min/km'); // 60/10 = 6 min/km
            expect(calculatePaceFromSpeed(12)).toBe('5:00 min/km'); // 60/12 = 5 min/km
            expect(calculatePaceFromSpeed(15)).toBe('4:00 min/km'); // 60/15 = 4 min/km
        });

        it('calculates pace in min/mi from speed', () => {
            expect(calculatePaceFromSpeed(10, 'min/mi')).toBe('9:39 min/mi');
            expect(calculatePaceFromSpeed(16.09, 'min/mi')).toBe('6:00 min/mi');
        });

        it('handles fractional results correctly', () => {
            expect(calculatePaceFromSpeed(8.5)).toBe('7:04 min/km'); // 60/8.5 ≈ 7.06 min/km
            expect(calculatePaceFromSpeed(13.33)).toBe('4:30 min/km'); // 60/13.33 ≈ 4.5 min/km
        });

        it('returns N/A for invalid or zero speeds', () => {
            expect(calculatePaceFromSpeed(0)).toBe('N/A');
            expect(calculatePaceFromSpeed(-1)).toBe('N/A');
            expect(calculatePaceFromSpeed(null)).toBe('N/A');
            expect(calculatePaceFromSpeed(undefined)).toBe('N/A');
            expect(calculatePaceFromSpeed(NaN)).toBe('N/A');
            expect(calculatePaceFromSpeed(250)).toBe('N/A');
        });

        it('rounds seconds correctly', () => {
            expect(calculatePaceFromSpeed(9.876)).toBe('6:05 min/km'); // Should round to nearest second
        });
    });

    describe('speedToPace', () => {
        it('is an alias for calculatePaceFromSpeed', () => {
            expect(speedToPace(10)).toBe(calculatePaceFromSpeed(10));
            expect(speedToPace(15, 'min/mi')).toBe(calculatePaceFromSpeed(15, 'min/mi'));
        });
    });

    describe('paceToSpeed', () => {
        it('converts min/km pace to km/h speed', () => {
            expect(paceToSpeed('5:00')).toBe(12); // 60/5 = 12 km/h
            expect(paceToSpeed('6:00')).toBe(10); // 60/6 = 10 km/h
            expect(paceToSpeed('4:30')).toBeCloseTo(13.33, 2); // 60/4.5 ≈ 13.33 km/h
        });

        it('converts min/mi pace to km/h speed', () => {
            expect(paceToSpeed('6:00', 'min/mi')).toBeCloseTo(16.09, 2);
            expect(paceToSpeed('8:00', 'min/mi')).toBeCloseTo(12.07, 2);
        });

        it('handles pace strings with unit suffix', () => {
            expect(paceToSpeed('5:00 min/km')).toBe(12);
            expect(paceToSpeed('6:30 min/mi', 'min/mi')).toBeCloseTo(14.85, 1);
        });

        it('returns null for invalid pace strings', () => {
            expect(paceToSpeed('')).toBe(null);
            expect(paceToSpeed('invalid')).toBe(null);
            expect(paceToSpeed('5:70')).toBe(null); // Invalid seconds
            expect(paceToSpeed('-1:30')).toBe(null); // Negative minutes
            expect(paceToSpeed(null)).toBe(null);
            expect(paceToSpeed(undefined)).toBe(null);
        });

        it('handles edge cases', () => {
            expect(paceToSpeed('0:30')).toBe(120); // 60/0.5 = 120 km/h
            expect(paceToSpeed('1:00')).toBe(60); // 60/1 = 60 km/h
        });
    });

    describe('formatDuration', () => {
        it('formats duration in seconds only', () => {
            expect(formatDuration(30)).toBe('30s');
            expect(formatDuration(0)).toBe('0s');
            expect(formatDuration(59)).toBe('59s');
        });

        it('formats duration in minutes and seconds', () => {
            expect(formatDuration(60)).toBe('1m 0s');
            expect(formatDuration(90)).toBe('1m 30s');
            expect(formatDuration(3599)).toBe('59m 59s');
        });

        it('formats duration in hours, minutes and seconds', () => {
            expect(formatDuration(3600)).toBe('1h 0m 0s');
            expect(formatDuration(3661)).toBe('1h 1m 1s');
            expect(formatDuration(7200)).toBe('2h 0m 0s');
            expect(formatDuration(86400)).toBe('24h 0m 0s');
        });

        it('returns N/A for invalid inputs', () => {
            expect(formatDuration(null)).toBe('N/A');
            expect(formatDuration(undefined)).toBe('N/A');
            expect(formatDuration(-1)).toBe('N/A');
            expect(formatDuration(NaN)).toBe('N/A');
        });

        it('handles large durations correctly', () => {
            expect(formatDuration(90061)).toBe('25h 1m 1s'); // 25 hours, 1 minute, 1 second
        });

        it('floors fractional seconds', () => {
            expect(formatDuration(30.9)).toBe('30s');
            expect(formatDuration(90.7)).toBe('1m 30s');
        });
    });

    describe('formatDistance', () => {
        it('formats distance in kilometers by default', () => {
            expect(formatDistance(10.5)).toBe('10.50 km');
            expect(formatDistance(0)).toBe('0.00 km');
            expect(formatDistance(100.567)).toBe('100.57 km');
        });

        it('formats distance in miles when unit is specified', () => {
            expect(formatDistance(10, 'mi')).toBe('6.21 mi');
            expect(formatDistance(16.09, 'mi')).toBe('10.00 mi');
            expect(formatDistance(42.195, 'mi')).toBe('26.22 mi'); // Marathon distance
        });

        it('returns N/A for invalid distances', () => {
            expect(formatDistance(-1)).toBe('N/A');
            expect(formatDistance(null)).toBe('N/A');
            expect(formatDistance(undefined)).toBe('N/A');
            expect(formatDistance(NaN)).toBe('N/A');
        });

        it('handles edge cases correctly', () => {
            expect(formatDistance(0)).toBe('0.00 km');
            expect(formatDistance(0.01)).toBe('0.01 km');
        });

        it('handles very large distances', () => {
            expect(formatDistance(1000)).toBe('1000.00 km');
            expect(formatDistance(1000, 'mi')).toBe('621.37 mi');
        });
    });

    describe('formatPace', () => {
        it('formats pace in min/km by default', () => {
            expect(formatPace(5.5)).toBe('5:30 min/km');
            expect(formatPace(6.0)).toBe('6:00 min/km');
            expect(formatPace(4.25)).toBe('4:15 min/km');
        });

        it('formats pace in min/mi when unit is specified', () => {
            expect(formatPace(5.5, 'min/mi')).toBe('5:30 min/mi');
            expect(formatPace(8.0, 'min/mi')).toBe('8:00 min/mi');
        });

        it('returns N/A for invalid pace values', () => {
            expect(formatPace(null)).toBe('N/A');
            expect(formatPace(undefined)).toBe('N/A');
            expect(formatPace(-1)).toBe('N/A');
            expect(formatPace(0)).toBe('N/A');
            expect(formatPace(NaN)).toBe('N/A');
            expect(formatPace('5.5')).toBe('N/A');
        });

        it('handles fractional minutes correctly', () => {
            expect(formatPace(5.75)).toBe('5:45 min/km'); // 5.75 * 60 = 45 seconds
            expect(formatPace(4.333)).toBe('4:20 min/km'); // 4.333 * 60 ≈ 20 seconds
        });
    });
});
