import { describe, it, expect } from 'vitest';
import { getSlopeColor, getSlopeCategory, getSlopeRanges } from '../slopeColors';

describe('slopeColors', () => {
    describe('getSlopeColor', () => {
        it('returns dark green for very steep downhill', () => {
            expect(getSlopeColor(-20)).toBe('#006400');
        });

        it('returns forest green for moderate downhill', () => {
            expect(getSlopeColor(-10)).toBe('#228B22');
        });

        it('returns lime green for gentle downhill', () => {
            expect(getSlopeColor(-6)).toBe('#32CD32');
        });

        it('returns light green for slight downhill', () => {
            expect(getSlopeColor(-2)).toBe('#90EE90');
        });

        it('returns cyan for gentle uphill', () => {
            expect(getSlopeColor(2)).toBe('#4BC0C0');
        });

        it('returns light orange for moderate uphill', () => {
            expect(getSlopeColor(6)).toBe('#FFB347');
        });

        it('returns tomato red for steep uphill', () => {
            expect(getSlopeColor(10)).toBe('#FF6347');
        });

        it('returns crimson for very steep uphill', () => {
            expect(getSlopeColor(15)).toBe('#DC143C');
        });

        it('returns dark red for extreme uphill', () => {
            expect(getSlopeColor(25)).toBe('#8B0000');
        });

        it('returns gray for NaN', () => {
            expect(getSlopeColor(NaN)).toBe('#808080');
        });

        it('returns gray for non-number', () => {
            expect(getSlopeColor('invalid' as any)).toBe('#808080');
        });

        it('handles boundary values', () => {
            expect(getSlopeColor(-15)).toBe('#228B22');
            expect(getSlopeColor(-8)).toBe('#32CD32');
            expect(getSlopeColor(-4)).toBe('#90EE90');
            expect(getSlopeColor(0)).toBe('#4BC0C0');
            expect(getSlopeColor(4)).toBe('#FFB347');
            expect(getSlopeColor(8)).toBe('#FF6347');
            expect(getSlopeColor(12)).toBe('#DC143C');
            expect(getSlopeColor(18)).toBe('#8B0000');
        });
    });

    describe('getSlopeCategory', () => {
        it('returns "Very Steep Downhill" for <= -15%', () => {
            expect(getSlopeCategory(-20)).toBe('Very Steep Downhill');
        });

        it('returns "Moderate Downhill" for -8% to -15%', () => {
            expect(getSlopeCategory(-10)).toBe('Moderate Downhill');
        });

        it('returns "Gentle Downhill" for -4% to -8%', () => {
            expect(getSlopeCategory(-6)).toBe('Gentle Downhill');
        });

        it('returns "Slight Downhill" for 0% to -4%', () => {
            expect(getSlopeCategory(-2)).toBe('Slight Downhill');
        });

        it('returns "Gentle Uphill" for 0% to 4%', () => {
            expect(getSlopeCategory(2)).toBe('Gentle Uphill');
        });

        it('returns "Moderate Uphill" for 4% to 8%', () => {
            expect(getSlopeCategory(6)).toBe('Moderate Uphill');
        });

        it('returns "Steep Uphill" for 8% to 12%', () => {
            expect(getSlopeCategory(10)).toBe('Steep Uphill');
        });

        it('returns "Very Steep Uphill" for 12% to 18%', () => {
            expect(getSlopeCategory(15)).toBe('Very Steep Uphill');
        });

        it('returns "Extreme Uphill" for > 18%', () => {
            expect(getSlopeCategory(25)).toBe('Extreme Uphill');
        });

        it('returns "Unknown" for NaN', () => {
            expect(getSlopeCategory(NaN)).toBe('Unknown');
        });

        it('returns "Unknown" for non-number', () => {
            expect(getSlopeCategory('invalid' as any)).toBe('Unknown');
        });
    });

    describe('getSlopeRanges', () => {
        it('returns all slope ranges with labels', () => {
            const ranges = getSlopeRanges();
            expect(ranges.length).toBe(9);
            ranges.forEach(range => {
                expect(range).toHaveProperty('min');
                expect(range).toHaveProperty('max');
                expect(range).toHaveProperty('color');
                expect(range).toHaveProperty('label');
            });
        });

        it('includes all categories', () => {
            const ranges = getSlopeRanges();
            const labels = ranges.map(r => r.label);
            expect(labels).toContain('Very Steep Downhill');
            expect(labels).toContain('Moderate Downhill');
            expect(labels).toContain('Gentle Downhill');
            expect(labels).toContain('Slight Downhill');
            expect(labels).toContain('Gentle Uphill');
            expect(labels).toContain('Moderate Uphill');
            expect(labels).toContain('Steep Uphill');
            expect(labels).toContain('Very Steep Uphill');
            expect(labels).toContain('Extreme Uphill');
        });
    });
});
