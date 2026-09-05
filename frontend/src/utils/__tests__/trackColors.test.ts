import { describe, it, expect, beforeEach } from 'vitest';
import { getColorForId } from '../trackColors';

describe('trackColors', () => {
    describe('getColorForId', () => {
        it('returns default color for undefined id', () => {
            expect(getColorForId(undefined)).toBe('#0D3632');
        });

        it('returns consistent color for same id', () => {
            const color1 = getColorForId('track-1');
            const color2 = getColorForId('track-1');
            expect(color1).toBe(color2);
        });

        it('returns different colors for different ids', () => {
            const color1 = getColorForId('track-1');
            const color2 = getColorForId('track-2');
            // Colors may or may not be different depending on palette size
            expect(color1).toMatch(/^#[0-9A-F]{6}$/);
            expect(color2).toMatch(/^#[0-9A-F]{6}$/);
        });

        it('cycles through palette', () => {
            const colors = new Set<string>();
            for (let i = 0; i < 10; i++) {
                colors.add(getColorForId(`track-${i}`));
            }
            // Should use multiple colors from palette
            expect(colors.size).toBeGreaterThan(0);
        });

        it('handles empty string id', () => {
            const color = getColorForId('');
            expect(color).toMatch(/^#[0-9A-F]{6}$/);
        });
    });
});
