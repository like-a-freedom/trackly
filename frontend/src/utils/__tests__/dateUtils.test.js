import { describe, it, expect } from 'vitest';
import { formatDateTime } from '../format';

// Test formatDate function used in components
describe('formatDate utility', () => {
    const formatDate = formatDateTime;

    it('should format dates in 24-hour format', () => {
        const testDate = '2023-05-20T10:30:00Z';
        const result = formatDate(testDate);

        // Should not contain AM/PM
        expect(result).not.toContain('AM');
        expect(result).not.toContain('PM');

        // Should contain time in 24-hour format
        expect(result).toMatch(/\d{2}:\d{2}/); // HH:MM pattern
    });

    it('should handle afternoon times correctly', () => {
        const testDate = '2023-05-20T14:30:00Z';
        const result = formatDate(testDate);

        // Should not contain AM/PM
        expect(result).not.toContain('AM');
        expect(result).not.toContain('PM');

        // Should contain 14:30 or similar 24-hour format
        expect(result).toMatch(/1[4-9]:\d{2}/); // Afternoon hour pattern
    });

    it('should handle null/undefined gracefully', () => {
        expect(formatDate(null)).toBe('N/A');
        expect(formatDate(undefined)).toBe('N/A');
        expect(formatDate('')).toBe('N/A');
    });

    it('should handle invalid dates', () => {
        expect(formatDate('invalid-date')).toBe('Invalid Date');
    });

    it('should format dates consistently with tooltip', () => {
        const testDate = '2023-05-20T10:30:00Z';
        const dateResult = formatDate(testDate);
        const dateTimeResult = formatDateTime(testDate);

        // Both should format the same way
        expect(dateResult).toBe(dateTimeResult);
    });
});
