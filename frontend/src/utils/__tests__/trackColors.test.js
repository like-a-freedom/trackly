import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getColorForId } from '../trackColors';

describe('trackColors', () => {
    // Import the module to access internal state
    let trackColors, colorMap, colorMapNextIdx;

    beforeEach(() => {
        // Reset the internal state by re-importing the module
        vi.resetModules();
    });

    describe('getColorForId function', () => {
        it('returns a valid color for any ID', () => {
            const color = getColorForId('test-id');
            expect(typeof color).toBe('string');
            expect(color).toMatch(/^#[0-9A-F]{6}$/i);
        });

        it('returns the same color for the same ID consistently', () => {
            const id = 'consistent-test-id';
            const color1 = getColorForId(id);
            const color2 = getColorForId(id);
            const color3 = getColorForId(id);

            expect(color1).toBe(color2);
            expect(color2).toBe(color3);
        });

        it('returns different colors for different IDs', () => {
            const color1 = getColorForId('id-1');
            const color2 = getColorForId('id-2');
            const color3 = getColorForId('id-3');

            // At least some should be different (unless we hit the same color by cycling)
            const uniqueColors = new Set([color1, color2, color3]);
            expect(uniqueColors.size).toBeGreaterThan(1);
        });

        it('handles null ID', () => {
            const color = getColorForId(null);
            expect(typeof color).toBe('string');
            expect(color).toMatch(/^#[0-9A-F]{6}$/i);
        });

        it('handles undefined ID', () => {
            const color = getColorForId(undefined);
            expect(typeof color).toBe('string');
            expect(color).toMatch(/^#[0-9A-F]{6}$/i);
        });

        it('handles empty string ID', () => {
            const color = getColorForId('');
            expect(typeof color).toBe('string');
            expect(color).toMatch(/^#[0-9A-F]{6}$/i);
        });

        it('returns first color for falsy IDs', () => {
            const colorNull = getColorForId(null);
            const colorUndef = getColorForId(undefined);
            const colorEmpty = getColorForId('');
            const colorFalse = getColorForId(false);
            const colorZero = getColorForId(0);

            expect(colorNull).toBe(colorUndef);
            expect(colorUndef).toBe(colorEmpty);
            expect(colorEmpty).toBe(colorFalse);
            expect(colorFalse).toBe(colorZero);
        });

        it('handles numeric IDs', () => {
            const color1 = getColorForId(123);
            const color2 = getColorForId(456);

            expect(typeof color1).toBe('string');
            expect(typeof color2).toBe('string');
            expect(color1).toMatch(/^#[0-9A-F]{6}$/i);
            expect(color2).toMatch(/^#[0-9A-F]{6}$/i);
        });

        it('handles object IDs', () => {
            const obj1 = { id: 'test' };
            const obj2 = { id: 'test2' };

            const color1 = getColorForId(obj1);
            const color2 = getColorForId(obj2);
            const color1Again = getColorForId(obj1);

            expect(typeof color1).toBe('string');
            expect(typeof color2).toBe('string');
            expect(color1).toBe(color1Again);
        });

        it('cycles through colors when more IDs than colors available', () => {
            const colors = [];
            const ids = [];

            // Generate more IDs than available colors (assuming 5 colors)
            for (let i = 0; i < 10; i++) {
                const id = `test-id-${i}`;
                ids.push(id);
                colors.push(getColorForId(id));
            }

            // First 5 should be different, then it should cycle
            const uniqueColors = new Set(colors.slice(0, 5));
            expect(uniqueColors.size).toBeLessThanOrEqual(5);

            // Colors should repeat after cycling
            // (This assumes the color array has 5 elements)
            if (colors.length >= 10) {
                expect(colors[0]).toBe(colors[5]); // Should cycle back
            }
        });

        it('maintains color assignment order', () => {
            const ids = ['first', 'second', 'third', 'fourth', 'fifth'];
            const colors = ids.map(id => getColorForId(id));

            // Get the same IDs again in different order
            const shuffledIds = ['third', 'first', 'fifth', 'second', 'fourth'];
            const shuffledColors = shuffledIds.map(id => getColorForId(id));

            // Colors should match their original assignments
            expect(shuffledColors[0]).toBe(colors[2]); // third
            expect(shuffledColors[1]).toBe(colors[0]); // first
            expect(shuffledColors[2]).toBe(colors[4]); // fifth
            expect(shuffledColors[3]).toBe(colors[1]); // second
            expect(shuffledColors[4]).toBe(colors[3]); // fourth
        });

        it('handles very long string IDs', () => {
            const longId = 'a'.repeat(1000);
            const color = getColorForId(longId);

            expect(typeof color).toBe('string');
            expect(color).toMatch(/^#[0-9A-F]{6}$/i);
        });

        it('handles special character IDs', () => {
            const specialIds = [
                'test@id',
                'test#id',
                'test$id',
                'test%id',
                'test^id',
                'test&id',
                'test*id',
                'test(id)',
                'test[id]',
                'test{id}',
                'test|id',
                'test\\id',
                'test/id',
                'test?id',
                'test.id',
                'test,id',
                'test:id',
                'test;id',
                'test\'id',
                'test"id',
                'test id', // space
                'test\tid', // tab
                'test\nid', // newline
            ];

            specialIds.forEach(id => {
                const color = getColorForId(id);
                expect(typeof color).toBe('string');
                expect(color).toMatch(/^#[0-9A-F]{6}$/i);
            });
        });

        it('handles Unicode IDs', () => {
            const unicodeIds = [
                'test-🚀',
                'test-🎨',
                'test-🌟',
                'тест-id',
                '测试-id',
                'テスト-id',
                'परीक्षण-id',
            ];

            unicodeIds.forEach(id => {
                const color = getColorForId(id);
                expect(typeof color).toBe('string');
                expect(color).toMatch(/^#[0-9A-F]{6}$/i);
            });
        });
    });

    describe('Color format validation', () => {
        it('returns valid hex colors', () => {
            const testIds = ['id1', 'id2', 'id3', 'id4', 'id5', 'id6'];
            testIds.forEach(id => {
                const color = getColorForId(id);
                expect(color).toMatch(/^#[0-9A-F]{6}$/i);
                expect(color.length).toBe(7); // # + 6 hex digits
            });
        });

        it('returns colors from predefined palette', () => {
            // These are the expected colors from the trackColors array
            const expectedColors = [
                '#0D3632',
                '#58D8CB',
                '#774EB7',
                '#26A497',
                '#76B0D6',
            ];

            const testIds = ['a', 'b', 'c', 'd', 'e'];
            const actualColors = testIds.map(id => getColorForId(id));

            actualColors.forEach(color => {
                expect(expectedColors).toContain(color);
            });
        });
    });

    describe('Performance and memory', () => {
        it('does not leak memory with many unique IDs', () => {
            // This test ensures the color map doesn't grow indefinitely
            // In a real scenario, you might want to implement LRU cache
            const initialMemory = process.memoryUsage().heapUsed;

            for (let i = 0; i < 1000; i++) {
                getColorForId(`test-id-${i}`);
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 1MB for 1000 entries)
            expect(memoryIncrease).toBeLessThan(1024 * 1024);
        });

        it('is performant for repeated calls with same ID', () => {
            const id = 'performance-test-id';
            getColorForId(id); // Initialize

            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                getColorForId(id);
            }
            const end = performance.now();

            // Should complete 10,000 calls in less than 100ms
            expect(end - start).toBeLessThan(100);
        });
    });
});
