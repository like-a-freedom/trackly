import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useVirtualizedList } from '../useVirtualizedList';

describe('useVirtualizedList', () => {
    let mockItems;

    beforeEach(() => {
        // Create mock items
        mockItems = ref(
            Array.from({ length: 100 }, (_, i) => ({
                id: i,
                name: `Item ${i}`,
                value: i * 10
            }))
        );
    });

    describe('Basic functionality', () => {
        it('should initialize with correct default values', () => {
            const { scrollTop, visibleItems, totalHeight } = useVirtualizedList(
                mockItems
            );

            expect(scrollTop.value).toBe(0);
            expect(visibleItems.value).toBeDefined();
            expect(visibleItems.value.length).toBeGreaterThan(0);
            expect(totalHeight.value).toBe(100 * 50); // 100 items * 50px default height
        });

        it('should use custom item height', () => {
            const customHeight = 80;
            const { totalHeight } = useVirtualizedList(
                mockItems,
                customHeight
            );

            expect(totalHeight.value).toBe(100 * customHeight);
        });

        it('should use custom container height', () => {
            const customContainerHeight = 600;
            const { visibleItems } = useVirtualizedList(
                mockItems,
                50,
                customContainerHeight
            );

            // With 600px container and 50px items, should show ~12-14 items (with buffer)
            expect(visibleItems.value.length).toBeGreaterThanOrEqual(12);
            expect(visibleItems.value.length).toBeLessThanOrEqual(14);
        });

        it('should handle empty items array', () => {
            const emptyItems = ref([]);
            const { visibleItems, totalHeight } = useVirtualizedList(emptyItems);

            expect(visibleItems.value).toEqual([]);
            expect(totalHeight.value).toBe(0);
        });

        it('should handle null/undefined items', () => {
            const nullItems = ref(null);
            const { visibleItems, totalHeight } = useVirtualizedList(nullItems);

            expect(visibleItems.value).toEqual([]);
            expect(totalHeight.value).toBe(0);
        });
    });

    describe('Visible range calculation', () => {
        it('should calculate correct visible range at scroll position 0', () => {
            const { visibleItems } = useVirtualizedList(mockItems, 50, 400);

            // At scroll 0, should show first items
            expect(visibleItems.value[0].index).toBe(0);
            expect(visibleItems.value[0].top).toBe(0);
        });

        it('should calculate correct visible range after scrolling', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            // Simulate scroll to position 500
            scrollTop.value = 500;
            await nextTick();

            // At scroll 500 with 50px items, should start around item 10
            expect(visibleItems.value[0].index).toBe(10);
            expect(visibleItems.value[0].top).toBe(10 * 50);
        });

        it('should not exceed items array length', async () => {
            const smallItems = ref(
                Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Item ${i}` }))
            );
            const { visibleItems, scrollTop } = useVirtualizedList(
                smallItems,
                50,
                400
            );

            // Try to scroll beyond available items
            scrollTop.value = 1000;
            await nextTick();

            // Should not show more items than available
            expect(visibleItems.value.length).toBeLessThanOrEqual(5);
            if (visibleItems.value.length > 0) {
                const lastVisibleItem = visibleItems.value[visibleItems.value.length - 1];
                expect(lastVisibleItem.index).toBeLessThan(5);
            }
        });

        it('should include buffer items for smooth scrolling', () => {
            const { visibleItems } = useVirtualizedList(mockItems, 50, 400);

            // Container height 400 / item height 50 = 8 visible items
            // But with buffer (+2), should have 10 items
            expect(visibleItems.value.length).toBeGreaterThanOrEqual(10);
        });
    });

    describe('Virtual positioning', () => {
        it('should add correct virtual position (top) to each visible item', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            scrollTop.value = 250; // Scroll to middle
            await nextTick();

            visibleItems.value.forEach((item) => {
                expect(item.top).toBe(item.index * 50);
            });
        });

        it('should preserve original item properties', async () => {
            const { visibleItems } = useVirtualizedList(mockItems, 50, 400);

            await nextTick();

            visibleItems.value.forEach((item) => {
                expect(item).toHaveProperty('id');
                expect(item).toHaveProperty('name');
                expect(item).toHaveProperty('value');
                expect(item).toHaveProperty('index');
                expect(item).toHaveProperty('top');
            });
        });

        it('should update positioning when scrolling', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            const firstScroll = visibleItems.value[0].top;

            scrollTop.value = 500;
            await nextTick();

            const secondScroll = visibleItems.value[0].top;

            expect(secondScroll).toBeGreaterThan(firstScroll);
        });
    });

    describe('Reactive updates', () => {
        it('should react to items changes', async () => {
            const reactiveItems = ref([
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' }
            ]);

            const { visibleItems, totalHeight } = useVirtualizedList(
                reactiveItems,
                50,
                400
            );

            expect(totalHeight.value).toBe(2 * 50);
            expect(visibleItems.value.length).toBe(2);

            // Add more items
            reactiveItems.value = [
                ...reactiveItems.value,
                { id: 3, name: 'Item 3' },
                { id: 4, name: 'Item 4' }
            ];

            await nextTick();

            expect(totalHeight.value).toBe(4 * 50);
            expect(visibleItems.value.length).toBe(4);
        });

        it('should react to scroll position changes', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            const initialFirstIndex = visibleItems.value[0].index;

            scrollTop.value = 1000;
            await nextTick();

            const scrolledFirstIndex = visibleItems.value[0].index;

            expect(scrolledFirstIndex).toBeGreaterThan(initialFirstIndex);
        });

        it('should handle items being removed', async () => {
            const dynamicItems = ref(
                Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Item ${i}` }))
            );

            const { visibleItems, totalHeight } = useVirtualizedList(
                dynamicItems,
                50,
                400
            );

            expect(totalHeight.value).toBe(20 * 50);

            // Remove half of items
            dynamicItems.value = dynamicItems.value.slice(0, 10);
            await nextTick();

            expect(totalHeight.value).toBe(10 * 50);
            expect(visibleItems.value.length).toBeLessThanOrEqual(10);
        });

        it('should handle all items being cleared', async () => {
            const dynamicItems = ref(
                Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Item ${i}` }))
            );

            const { visibleItems, totalHeight } = useVirtualizedList(
                dynamicItems,
                50,
                400
            );

            dynamicItems.value = [];
            await nextTick();

            expect(totalHeight.value).toBe(0);
            expect(visibleItems.value).toEqual([]);
        });
    });

    describe('Scroll event handling', () => {
        it('should expose containerRef for mounting', () => {
            const { containerRef } = useVirtualizedList(mockItems);

            expect(containerRef.value).toBeNull(); // Not mounted yet
        });

        it('should handle scroll event correctly', async () => {
            const { scrollTop } = useVirtualizedList(mockItems, 50, 400);

            // Simulate scroll event
            const mockEvent = { target: { scrollTop: 300 } };
            scrollTop.value = mockEvent.target.scrollTop;

            await nextTick();

            expect(scrollTop.value).toBe(300);
        });

        it('should update visible items on scroll', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            const initialItems = [...visibleItems.value];

            scrollTop.value = 500;
            await nextTick();

            const scrolledItems = [...visibleItems.value];

            expect(scrolledItems[0].index).not.toBe(initialItems[0].index);
        });
    });

    describe('Edge cases', () => {
        it('should handle very large item lists', () => {
            const largeItems = ref(
                Array.from({ length: 10000 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`
                }))
            );

            const { visibleItems, totalHeight } = useVirtualizedList(
                largeItems,
                50,
                400
            );

            expect(totalHeight.value).toBe(10000 * 50);
            // Should only render visible items, not all 10000
            expect(visibleItems.value.length).toBeLessThan(20);
        });

        it('should handle very small item height', () => {
            const smallHeight = 10;
            const { visibleItems, totalHeight } = useVirtualizedList(
                mockItems,
                smallHeight,
                400
            );

            expect(totalHeight.value).toBe(100 * smallHeight);
            // More items should be visible with smaller height
            expect(visibleItems.value.length).toBeGreaterThan(40);
        });

        it('should handle very large item height', () => {
            const largeHeight = 200;
            const { visibleItems, totalHeight } = useVirtualizedList(
                mockItems,
                largeHeight,
                400
            );

            expect(totalHeight.value).toBe(100 * largeHeight);
            // Fewer items should be visible with larger height
            expect(visibleItems.value.length).toBeLessThan(10);
        });

        it('should handle scroll to bottom', async () => {
            const { visibleItems, scrollTop, totalHeight } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            // Scroll to bottom
            scrollTop.value = totalHeight.value - 400;
            await nextTick();

            // Should show last items
            const lastVisibleItem = visibleItems.value[visibleItems.value.length - 1];
            expect(lastVisibleItem.index).toBeGreaterThan(90);
        });

        it('should handle negative scroll position', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            // First ensure we have items initially
            await nextTick();
            expect(visibleItems.value.length).toBeGreaterThan(0);

            // Set negative scroll position
            scrollTop.value = -100;
            await nextTick();

            // Should clamp to 0 and still show items from start
            expect(visibleItems.value.length).toBeGreaterThan(0);
            expect(visibleItems.value[0].index).toBe(0);
        });

        it('should handle zero container height', () => {
            const { visibleItems } = useVirtualizedList(mockItems, 50, 0);

            // Should still return items (at least buffer)
            expect(visibleItems.value.length).toBeGreaterThan(0);
        });

        it('should handle zero item height', () => {
            const { totalHeight } = useVirtualizedList(mockItems, 0, 400);

            expect(totalHeight.value).toBe(0);
        });
    });

    describe('Performance', () => {
        it('should only render visible items, not all items', () => {
            const largeItems = ref(
                Array.from({ length: 1000 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`
                }))
            );

            const { visibleItems } = useVirtualizedList(largeItems, 50, 400);

            // Should only render ~10 items visible in 400px container
            // Plus buffer items
            expect(visibleItems.value.length).toBeLessThan(20);
            expect(visibleItems.value.length).toBeLessThan(largeItems.value.length);
        });

        it('should efficiently update when scrolling', async () => {
            const { visibleItems, scrollTop } = useVirtualizedList(
                mockItems,
                50,
                400
            );

            const initialLength = visibleItems.value.length;

            // Scroll multiple times
            for (let i = 0; i < 10; i++) {
                scrollTop.value = i * 100;
                await nextTick();
            }

            // Length should remain relatively constant
            expect(visibleItems.value.length).toBeCloseTo(initialLength, 2);
        });
    });
});
