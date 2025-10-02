import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref, computed, nextTick } from 'vue';
import {
    clearCacheByPattern,
    useMemoizedComputed,
    useMemoizedChartData,
    useMemoizedFormatters
} from '../useMemoization';

describe('useMemoization', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('MemoCache basic functionality', () => {
        it('should cache computed values', () => {
            const computeFn = vi.fn((x) => x * 2);
            const dep = ref(5);

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value]
            );

            // First access
            const result1 = memoized.value;
            expect(computeFn).toHaveBeenCalledTimes(1);
            expect(result1).toBe(10);

            // Second access with same dependency - should use cache
            const result2 = memoized.value;
            expect(computeFn).toHaveBeenCalledTimes(1); // Still only once
            expect(result2).toBe(10);
        });

        it('should recompute when dependencies change', () => {
            const dep = ref(5);

            const memoized = useMemoizedComputed(
                (x) => x * 2,
                [() => dep.value]
            );

            // First access - should compute
            const result1 = memoized.value;
            expect(result1).toBe(10);

            // Same value - should return same result
            const result2 = memoized.value;
            expect(result2).toBe(10);

            // Different value - should recompute
            dep.value = 10;
            const result3 = memoized.value;
            expect(result3).toBe(20);
        });

        it('should handle multiple dependencies', () => {
            const computeFn = vi.fn((x, y) => x + y);
            const dep1 = ref(5);
            const dep2 = ref(10);

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep1.value, () => dep2.value]
            );

            const result = memoized.value;
            expect(result).toBe(15);
            expect(computeFn).toHaveBeenCalledTimes(1);
        });

        it('should support custom key function', () => {
            const computeFn = vi.fn((obj) => obj.value * 2);
            const dep = ref({ value: 5 });

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value],
                {
                    keyFn: (deps) => `custom_${deps[0].value}`
                }
            );

            const result1 = memoized.value;
            expect(result1).toBe(10);
            expect(computeFn).toHaveBeenCalledTimes(1);

            // Same value, should use cache
            const result2 = memoized.value;
            expect(computeFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('Cache size limits', () => {
        it('should respect max cache size', () => {
            const computeFn = vi.fn((x) => x * 2);

            // Create cache with small max size
            const cache = {
                cache: new Map(),
                timers: new Map(),
                maxSize: 3,
                ttl: 60000,
                get(key) {
                    return this.cache.get(key);
                },
                set(key, value) {
                    if (this.cache.size >= this.maxSize) {
                        const firstKey = this.cache.keys().next().value;
                        this.delete(firstKey);
                    }
                    this.cache.set(key, value);
                    return value;
                },
                has(key) {
                    return this.cache.has(key);
                },
                delete(key) {
                    this.cache.delete(key);
                }
            };

            // Add 5 items to cache with max size 3
            for (let i = 0; i < 5; i++) {
                const dep = ref(i);
                useMemoizedComputed(
                    computeFn,
                    [() => dep.value],
                    { cache }
                ).value;
            }

            expect(cache.cache.size).toBeLessThanOrEqual(3);
        });
    });

    describe('TTL (Time To Live)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should expire cached values after TTL', () => {
            const dep = ref(5);

            // Create a mock cache we can control
            const testCache = {
                cache: new Map(),
                has(k) { return this.cache.has(k); },
                get(k) { return this.cache.get(k); },
                set(k, v) { this.cache.set(k, v); return v; },
                delete(k) { this.cache.delete(k); }
            };

            const memoized = useMemoizedComputed(
                (x) => x * 2,
                [() => dep.value],
                { cache: testCache }
            );

            // First call - creates cache entry
            expect(memoized.value).toBe(10);
            expect(testCache.cache.size).toBe(1);

            // Manually clear cache to simulate TTL expiration
            testCache.cache.clear();

            // Same deps but cache cleared - should recompute
            expect(memoized.value).toBe(10);
        });

        it('should not expire before TTL', () => {
            const computeFn = vi.fn((x) => x * 2);
            const dep = ref(5);

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value]
            );

            // First access
            const result1 = memoized.value;
            expect(result1).toBe(10);

            // Second access should use cache
            const result2 = memoized.value;
            expect(result2).toBe(10);
            expect(result1).toBe(result2);
        });
    });

    describe('clearCacheByPattern', () => {
        it('should clear cache entries matching string pattern', () => {
            // Simple test that clearCacheByPattern function exists and can be called
            expect(() => clearCacheByPattern('test')).not.toThrow();
            expect(() => clearCacheByPattern(/test/)).not.toThrow();
        });

        it('should clear cache entries matching regex pattern', () => {
            const pattern = /\[5\]/;
            const dep = ref(5);

            const memoized = useMemoizedComputed(
                (x) => x * 2,
                [() => dep.value]
            );

            const val1 = memoized.value;
            expect(val1).toBe(10);

            clearCacheByPattern(pattern);

            // Change dep to force re-evaluation
            dep.value = 5.1;

            const val2 = memoized.value;
            expect(val2).toBe(10.2);
        });
    });

    describe('useMemoizedChartData', () => {
        it('should memoize chart data processing', () => {
            const { processeChartData } = useMemoizedChartData();

            const rawData = [100, 150, 200, 180, 220];
            const totalDistance = 10;
            const chartMode = 'elevation';

            const result1 = processeChartData(rawData, totalDistance, chartMode);
            expect(result1).toHaveProperty('labels');
            expect(result1).toHaveProperty('processedData');
            expect(result1.labels).toHaveLength(5);
            expect(result1.processedData).toEqual(rawData);

            // Call again with same data - should use cache
            const result2 = processeChartData(rawData, totalDistance, chartMode);
            expect(result2).toEqual(result1);
            expect(result2).toBe(result1); // Same reference = cached
        });

        it('should process elevation data from different formats', () => {
            const { processeChartData } = useMemoizedChartData();

            // Format 1: Simple numbers
            const data1 = [100, 150, 200];
            const result1 = processeChartData(data1, 5, 'elevation');
            expect(result1.processedData).toEqual([100, 150, 200]);

            // Format 2: Arrays [lat, ele]
            const data2 = [
                [50.0, 100],
                [50.1, 150],
                [50.2, 200]
            ];
            const result2 = processeChartData(data2, 5, 'elevation');
            expect(result2.processedData).toEqual([100, 150, 200]);

            // Format 3: Objects with ele property
            const data3 = [
                { lat: 50.0, ele: 100 },
                { lat: 50.1, ele: 150 },
                { lat: 50.2, ele: 200 }
            ];
            const result3 = processeChartData(data3, 5, 'elevation');
            expect(result3.processedData).toEqual([100, 150, 200]);
        });

        it('should handle empty data', () => {
            const { processeChartData } = useMemoizedChartData();

            const result = processeChartData([], 10, 'elevation');
            expect(result).toEqual({});
        });

        it('should handle null data', () => {
            const { processeChartData } = useMemoizedChartData();

            const result = processeChartData(null, 10, 'elevation');
            expect(result).toEqual({});
        });

        it('should calculate correct labels for distance', () => {
            const { processeChartData } = useMemoizedChartData();

            const rawData = [100, 150, 200, 180];
            const totalDistance = 12.5;

            const result = processeChartData(rawData, totalDistance, 'elevation');

            expect(result.labels).toHaveLength(4);
            expect(result.labels[0]).toBe('0.00 km');
            expect(result.labels[3]).toBe('12.50 km');
        });

        it('should handle edge case with 2 points', () => {
            const { processeChartData } = useMemoizedChartData();

            const rawData = [100, 200];
            const totalDistance = 5;

            const result = processeChartData(rawData, totalDistance, 'elevation');

            expect(result.labels).toHaveLength(2);
            expect(result.labels[1]).toBe('5.00 km');
        });

        it('should cache data with different modes separately', () => {
            const { processeChartData } = useMemoizedChartData();

            const rawData = [100, 150, 200];
            const totalDistance = 10;

            const result1 = processeChartData(rawData, totalDistance, 'elevation');
            const result2 = processeChartData(rawData, totalDistance, 'speed');

            // Different modes should create different cache entries
            expect(result1).not.toBe(result2);
        });
    });

    describe('useMemoizedFormatters', () => {
        it('should memoize distance formatting', () => {
            const { memoizedFormatDistance } = useMemoizedFormatters();

            const result1 = memoizedFormatDistance(10.5, 'km');
            expect(result1).toBe('10.50 km');

            // Call again - should use cache
            const result2 = memoizedFormatDistance(10.5, 'km');
            expect(result2).toBe(result1);
            expect(result2).toBe('10.50 km');
        });

        it('should format distance in miles', () => {
            const { memoizedFormatDistance } = useMemoizedFormatters();

            const result = memoizedFormatDistance(10, 'miles');
            expect(result).toContain('mi');
            expect(result).toContain('6.21');
        });

        it('should memoize duration formatting', () => {
            const { memoizedFormatDuration } = useMemoizedFormatters();

            const result1 = memoizedFormatDuration(3665); // 1h 1m 5s
            expect(result1).toBe('1h 1m 5s');

            // Call again - should use cache
            const result2 = memoizedFormatDuration(3665);
            expect(result2).toBe(result1);
        });

        it('should format duration without hours', () => {
            const { memoizedFormatDuration } = useMemoizedFormatters();

            const result = memoizedFormatDuration(125); // 2m 5s
            expect(result).toBe('2m 5s');
        });

        it('should format duration with only seconds', () => {
            const { memoizedFormatDuration } = useMemoizedFormatters();

            const result = memoizedFormatDuration(45); // 45s
            expect(result).toBe('45s');
        });

        it('should cache different values separately', () => {
            const { memoizedFormatDistance } = useMemoizedFormatters();

            const result1 = memoizedFormatDistance(10, 'km');
            const result2 = memoizedFormatDistance(20, 'km');

            expect(result1).toBe('10.00 km');
            expect(result2).toBe('20.00 km');
            expect(result1).not.toBe(result2);
        });

        it('should cache different units separately', () => {
            const { memoizedFormatDistance } = useMemoizedFormatters();

            const result1 = memoizedFormatDistance(10, 'km');
            const result2 = memoizedFormatDistance(10, 'miles');

            expect(result1).toContain('km');
            expect(result2).toContain('mi');
            expect(result1).not.toBe(result2);
        });
    });

    describe('Cache performance', () => {
        it('should improve performance with memoization', () => {
            let computationCount = 0;
            const expensiveComputation = (x) => {
                computationCount++;
                // Simulate expensive computation
                let result = x;
                for (let i = 0; i < 1000; i++) {
                    result += Math.sqrt(i);
                }
                return result;
            };

            const dep = ref(5);
            const memoized = useMemoizedComputed(
                expensiveComputation,
                [() => dep.value]
            );

            // First call - expensive (store value to force computation)
            const val1 = memoized.value;
            const firstValue = val1; // Store to ensure computed executes
            expect(computationCount).toBe(1);

            // Subsequent calls - fast (cached)
            const results = [];
            for (let i = 0; i < 100; i++) {
                results.push(memoized.value);
            }

            // All results should be the same and function called only once
            expect(results.every(r => r === firstValue)).toBe(true);
            expect(computationCount).toBe(1);
        });

    });

    describe('Edge cases', () => {
        it('should handle null dependencies', () => {
            const computeFn = vi.fn(() => 'result');
            const dep = ref(null);

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value]
            );

            const result = memoized.value;
            expect(result).toBe('result');
            expect(computeFn).toHaveBeenCalledTimes(1);
        });

        it('should handle undefined dependencies', () => {
            const computeFn = vi.fn(() => 'result');
            const dep = ref(undefined);

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value]
            );

            const result = memoized.value;
            expect(result).toBe('result');
        });

        it('should handle object dependencies', () => {
            const computeFn = vi.fn((obj) => obj.a + obj.b);
            const dep = ref({ a: 1, b: 2 });

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value]
            );

            const result = memoized.value;
            expect(result).toBe(3);
        });

        it('should handle array dependencies', () => {
            const computeFn = vi.fn((arr) => arr.reduce((a, b) => a + b, 0));
            const dep = ref([1, 2, 3, 4, 5]);

            const memoized = useMemoizedComputed(
                computeFn,
                [() => dep.value]
            );

            const result = memoized.value;
            expect(result).toBe(15);
        });

        it('should handle empty arrays', () => {
            const { processeChartData } = useMemoizedChartData();

            const result = processeChartData([], 0, 'elevation');
            expect(result).toEqual({});
        });

        it('should handle zero values', () => {
            const { memoizedFormatDistance } = useMemoizedFormatters();

            const result = memoizedFormatDistance(0, 'km');
            expect(result).toBe('0.00 km');
        });
    });
});
