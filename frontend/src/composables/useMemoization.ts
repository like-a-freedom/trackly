/**
 * Composable for memoizing expensive computations
 */
import { computed, type ComputedRef } from 'vue';

// Simple cache with TTL support
class MemoCache<T = unknown> {
    private cache: Map<string, T> = new Map();
    private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private maxSize: number;
    private ttl: number;

    constructor(maxSize: number = 50, ttl: number = 60000) { // 1 minute default TTL
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    get(key: string): T | undefined {
        return this.cache.get(key);
    }

    set(key: string, value: T): T {
        // Clear existing timer for this key
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key)!);
        }

        // Remove oldest entries if at max size
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.delete(firstKey);
            }
        }

        // Set new value with TTL
        this.cache.set(key, value);
        const timer = setTimeout(() => {
            this.delete(key);
        }, this.ttl);
        this.timers.set(key, timer);

        return value;
    }

    has(key: string): boolean {
        return this.cache.has(key);
    }

    delete(key: string): void {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key)!);
            this.timers.delete(key);
        }
        this.cache.delete(key);
    }

    clear(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.cache.clear();
        this.timers.clear();
    }
}

// Module-level cache instance (shared across consumers)
let globalCache: MemoCache<unknown> = new MemoCache();

// Reset function for test isolation
export function resetMemoCache(): void {
    globalCache.clear();
    globalCache = new MemoCache();
}

// Function to clear cache for specific patterns
export function clearCacheByPattern(pattern: string | RegExp): void {
    const keys = Array.from((globalCache as unknown as { cache: Map<string, unknown> }).cache.keys());
    const matchingKeys = keys.filter(key =>
        typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)
    );

    matchingKeys.forEach(key => globalCache.delete(key));
    console.log(`[useMemoization] Cleared ${matchingKeys.length} cache entries matching pattern:`, pattern);
}

interface MemoizeOptions {
    cache?: MemoCache<unknown>;
    keyFn?: (deps: unknown[]) => string;
}

export function useMemoizedComputed<T>(
    computeFn: (...deps: unknown[]) => T,
    dependencies: unknown[] | (() => unknown),
    options: MemoizeOptions = {}
): ComputedRef<T> {
    const {
        cache = globalCache as unknown as MemoCache<T>,
        keyFn = (deps: unknown[]) => JSON.stringify(deps)
    } = options;

    return computed<T>(() => {
        const deps = Array.isArray(dependencies)
            ? dependencies.map(dep => typeof dep === 'function' ? dep() : dep)
            : [typeof dependencies === 'function' ? dependencies() : dependencies];

        const key = keyFn(deps);

        if (cache.has(key)) {
            return cache.get(key) as T;
        }

        const result = computeFn(...deps);
        cache.set(key, result);
        return result;
    });
}
