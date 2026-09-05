import { describe, it, expect } from 'vitest';
import { formatDateTime } from '../format';

describe('formatDateTime', () => {
    it('should format dates in 24-hour format', () => {
        const testDate = '2023-05-20T10:30:00Z';
        const result = formatDateTime(testDate);

        expect(result).not.toContain('AM');
        expect(result).not.toContain('PM');
        expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('should handle afternoon times correctly', () => {
        const testDate = '2023-05-20T14:30:00Z';
        const result = formatDateTime(testDate);

        expect(result).not.toContain('AM');
        expect(result).not.toContain('PM');
        expect(result).toMatch(/1[4-9]:\d{2}/);
    });

    it('should handle empty string', () => {
        expect(formatDateTime('')).toBe('N/A');
    });

    it('should handle invalid dates', () => {
        expect(formatDateTime('invalid-date')).toBe('Invalid Date');
    });

    it('should format dates consistently', () => {
        const testDate = '2023-05-20T10:30:00Z';
        const result = formatDateTime(testDate);

        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
});
