/**
 * Composable for memoizing expensive computations
 */
import { computed } from 'vue';

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

// Module-level cache instance (shared across consumers)
let globalCache = new MemoCache();

// Reset function for test isolation
export function resetMemoCache() {
    globalCache.clear();
    globalCache = new MemoCache();
}

// Function to clear cache for specific patterns
export function clearCacheByPattern(pattern) {
    const keys = Array.from(globalCache.cache.keys());
    const matchingKeys = keys.filter(key =>
        typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)
    );

    matchingKeys.forEach(key => globalCache.delete(key));
    console.log(`[useMemoization] Cleared ${matchingKeys.length} cache entries matching pattern:`, pattern);
}

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
