/**
 * Composable for memoizing expensive computations
 */
import { ref, computed, watchEffect } from 'vue';

// Simple cache with TTL support
class MemoCache {
    constructor(maxSize = 50, ttl = 60000) { // 1 minute default TTL
        this.cache = new Map();
        this.timers = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value) {
        // Clear existing timer for this key
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        // Remove oldest entries if at max size
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.delete(firstKey);
        }

        // Set new value with TTL
        this.cache.set(key, value);
        const timer = setTimeout(() => {
            this.delete(key);
        }, this.ttl);
        this.timers.set(key, timer);

        return value;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        this.cache.delete(key);
    }

    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.cache.clear();
        this.timers.clear();
    }
}

const globalCache = new MemoCache();

export function useMemoizedComputed(computeFn, dependencies, options = {}) {
    const {
        cache = globalCache,
        keyFn = (deps) => JSON.stringify(deps)
    } = options;

    return computed(() => {
        const deps = Array.isArray(dependencies)
            ? dependencies.map(dep => typeof dep === 'function' ? dep() : dep)
            : [typeof dependencies === 'function' ? dependencies() : dependencies];

        const key = keyFn(deps);

        if (cache.has(key)) {
            return cache.get(key);
        }

        const result = computeFn(...deps);
        return cache.set(key, result);
    });
}

// Specialized memoization for chart data processing
export function useMemoizedChartData() {
    const chartCache = new MemoCache(20, 5 * 60 * 1000); // 5 minutes for chart data

    const processeChartData = (rawData, totalDistance, chartMode) => {
        const key = `chart_${JSON.stringify(rawData?.slice(0, 10))}_${totalDistance}_${chartMode}_${rawData?.length}`;

        if (chartCache.has(key)) {
            return chartCache.get(key);
        }

        // Process chart data (implementation from original component)
        const pointCount = rawData?.length || 0;
        if (pointCount === 0) return chartCache.set(key, {});

        const step = pointCount === 2 ? totalDistance : totalDistance / (pointCount - 1);
        const labels = Array.from({ length: pointCount }, (_, i) => (
            i === pointCount - 1 ? totalDistance : i * step
        ).toFixed(2) + ' km');

        // Extract data based on mode
        let processedData = [];
        if (chartMode === 'elevation' && rawData) {
            if (rawData.every(p => typeof p === 'number' || p === null)) {
                processedData = rawData;
            } else if (rawData.every(p => Array.isArray(p) && p.length === 2)) {
                processedData = rawData.map(p => p[1]);
            } else if (rawData.every(p => typeof p === 'object' && p !== null && 'ele' in p)) {
                processedData = rawData.map(p => p.ele);
            }
        }

        const result = { labels, processedData };
        return chartCache.set(key, result);
    };

    return { processeChartData };
}

// Memoized formatter functions
export function useMemoizedFormatters() {
    const formatterCache = new MemoCache(100, 10 * 60 * 1000); // 10 minutes

    const memoizedFormatDistance = (distance, unit) => {
        const key = `dist_${distance}_${unit}`;
        if (formatterCache.has(key)) {
            return formatterCache.get(key);
        }

        // Implementation would use your existing formatDistance function
        let result;
        if (unit === 'miles') {
            const miles = distance * 0.621371;
            result = `${miles.toFixed(2)} mi`;
        } else {
            result = `${distance.toFixed(2)} km`;
        }

        return formatterCache.set(key, result);
    };

    const memoizedFormatDuration = (seconds) => {
        const key = `duration_${seconds}`;
        if (formatterCache.has(key)) {
            return formatterCache.get(key);
        }

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        let result;
        if (hours > 0) {
            result = `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            result = `${minutes}m ${secs}s`;
        } else {
            result = `${secs}s`;
        }

        return formatterCache.set(key, result);
    };

    return {
        memoizedFormatDistance,
        memoizedFormatDuration
    };
}
