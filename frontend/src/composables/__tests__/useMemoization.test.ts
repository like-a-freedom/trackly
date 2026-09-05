import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMemoCache, clearCacheByPattern } from '../useMemoization';

describe('useMemoization', () => {
    beforeEach(() => {
        resetMemoCache();
    });

    describe('resetMemoCache', () => {
        it('resets the cache', () => {
            resetMemoCache();
            // Should not throw
        });
    });

    describe('clearCacheByPattern', () => {
        it('clears cache entries matching string pattern', () => {
            clearCacheByPattern('test');
            // Should not throw
        });

        it('clears cache entries matching regex pattern', () => {
            clearCacheByPattern(/test-\d+/);
            // Should not throw
        });
    });
});
