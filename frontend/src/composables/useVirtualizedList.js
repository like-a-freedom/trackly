/**
 * Composable for implementing virtual scrolling for large lists
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useVirtualizedList(items, itemHeight = 50, containerHeight = 400) {
    const scrollTop = ref(0);
    const containerRef = ref(null);

    // Calculate visible range
    const visibleRange = computed(() => {
        // Clamp scrollTop to non-negative values
        const clampedScrollTop = Math.max(0, scrollTop.value);
        const start = Math.floor(clampedScrollTop / itemHeight);
        const visibleCount = Math.ceil(containerHeight / itemHeight) + 2; // Buffer
        const end = Math.min(start + visibleCount, items.value?.length || 0);

        return { start, end };
    });

    // Get visible items with virtual positioning
    const visibleItems = computed(() => {
        if (!items.value) return [];

        const { start, end } = visibleRange.value;
        return items.value.slice(start, end).map((item, index) => ({
            ...item,
            index: start + index,
            top: (start + index) * itemHeight
        }));
    });

    // Total height for scrollbar
    const totalHeight = computed(() => (items.value?.length || 0) * itemHeight);

    // Scroll handler
    const handleScroll = (event) => {
        scrollTop.value = event.target.scrollTop;
    };

    // Setup scroll listener
    onMounted(() => {
        if (containerRef.value) {
            containerRef.value.addEventListener('scroll', handleScroll);
        }
    });

    onUnmounted(() => {
        if (containerRef.value) {
            containerRef.value.removeEventListener('scroll', handleScroll);
        }
    });

    return {
        containerRef,
        visibleItems,
        totalHeight,
        scrollTop
    };
}
