import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import {
    useAdvancedDebounce,
    useReactiveDebounce,
    useMapDebounce,
    useThrottle
} from '../useAdvancedDebounce';

describe('useAdvancedDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Basic debouncing', () => {
        it('should debounce function calls', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            debounced('call2');
            debounced('call3');

            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);

            expect(func).toHaveBeenCalledTimes(1);
            expect(func).toHaveBeenCalledWith('call3');
        });

        it('should call function after delay', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 200);

            debounced('test');
            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(200);
            expect(func).toHaveBeenCalledWith('test');
        });

        it('should reset timer on subsequent calls', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            vi.advanceTimersByTime(50);

            debounced('call2');
            vi.advanceTimersByTime(50);

            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(50);
            expect(func).toHaveBeenCalledTimes(1);
            expect(func).toHaveBeenCalledWith('call2');
        });

        it('should handle multiple arguments', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('arg1', 'arg2', 'arg3');
            vi.advanceTimersByTime(100);

            expect(func).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
        });

        it('should preserve context (this)', () => {
            const context = { value: 42 };
            const func = vi.fn(function () {
                return this.value;
            });
            const debounced = useAdvancedDebounce(func, 100);

            debounced.call(context);
            vi.advanceTimersByTime(100);

            expect(func).toHaveBeenCalled();
        });
    });

    describe('Leading edge option', () => {
        it('should invoke immediately with leading: true', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100, { leading: true });

            debounced('call1');
            expect(func).toHaveBeenCalledTimes(1);
            expect(func).toHaveBeenCalledWith('call1');
        });

        it('should not invoke immediately with leading: false', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100, { leading: false });

            debounced('call1');
            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should invoke on both edges with leading and trailing', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100, { leading: true, trailing: true });

            debounced();
            expect(func).toHaveBeenCalledTimes(1); // Leading edge

            vi.advanceTimersByTime(100);
            // With both leading and trailing, and only one call, trailing won't fire
            // because the function was already invoked on the leading edge
            expect(func).toHaveBeenCalledTimes(1);
        });
    });

    describe('Trailing edge option', () => {
        it('should invoke on trailing edge by default', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledWith('call1');
        });

        it('should not invoke on trailing edge with trailing: false', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100, {
                leading: true,
                trailing: false
            });

            debounced('call1');
            expect(func).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1); // Still only once
        });
    });

    describe('MaxWait option', () => {
        it('should invoke after maxWait time even with continuous calls', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100, { maxWait: 300 });

            debounced('call1');
            vi.advanceTimersByTime(80);

            debounced('call2');
            vi.advanceTimersByTime(80);

            debounced('call3');
            vi.advanceTimersByTime(80);

            debounced('call4');

            // Total time: 240ms, but maxWait is 300ms
            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(60); // Total: 300ms

            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should enforce maxWait limit', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 1000, { maxWait: 200 });

            for (let i = 0; i < 10; i++) {
                debounced(`call${i}`);
                vi.advanceTimersByTime(50);
            }

            // After 500ms of continuous calls with maxWait=200
            // Should have invoked at least once
            expect(func).toHaveBeenCalled();
        });
    });

    describe('Cancel method', () => {
        it('should cancel pending invocation', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            expect(func).not.toHaveBeenCalled();

            debounced.cancel();
            vi.advanceTimersByTime(100);

            expect(func).not.toHaveBeenCalled();
        });

        it('should reset internal state on cancel', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            debounced.cancel();

            debounced('call2');
            vi.advanceTimersByTime(100);

            expect(func).toHaveBeenCalledTimes(1);
            expect(func).toHaveBeenCalledWith('call2');
        });
    });

    describe('Flush method', () => {
        it('should immediately invoke pending function', () => {
            const func = vi.fn(() => 'result');
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            expect(func).not.toHaveBeenCalled();

            const result = debounced.flush();

            expect(func).toHaveBeenCalledWith('call1');
            expect(result).toBe('result');
        });

        it('should return result when no pending invocation', () => {
            const func = vi.fn(() => 'result');
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            vi.advanceTimersByTime(100);

            const result = debounced.flush();
            expect(result).toBe('result');
        });
    });

    describe('Pending method', () => {
        it('should return true when invocation is pending', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            expect(debounced.pending()).toBe(false);

            debounced('call1');
            expect(debounced.pending()).toBe(true);

            vi.advanceTimersByTime(100);
            expect(debounced.pending()).toBe(false);
        });

        it('should return false after cancel', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            debounced('call1');
            expect(debounced.pending()).toBe(true);

            debounced.cancel();
            expect(debounced.pending()).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle zero delay', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 0);

            debounced('call1');
            vi.advanceTimersByTime(0);

            expect(func).toHaveBeenCalledWith('call1');
        });

        it('should handle very long delay', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 10000);

            debounced('call1');
            vi.advanceTimersByTime(5000);
            expect(func).not.toHaveBeenCalled();

            vi.advanceTimersByTime(5000);
            expect(func).toHaveBeenCalledWith('call1');
        });

        it('should handle rapid successive calls', () => {
            const func = vi.fn();
            const debounced = useAdvancedDebounce(func, 100);

            for (let i = 0; i < 100; i++) {
                debounced(`call${i}`);
            }

            vi.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1);
            expect(func).toHaveBeenCalledWith('call99');
        });
    });
});

describe('useReactiveDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should debounce reactive value changes', async () => {
        const source = ref('initial');
        const { debouncedValue, isDebouncing } = useReactiveDebounce(source, 100);

        expect(debouncedValue.value).toBe('initial');
        expect(isDebouncing.value).toBe(false);

        source.value = 'changed';
        await nextTick();

        expect(isDebouncing.value).toBe(true);
        expect(debouncedValue.value).toBe('initial'); // Not changed yet

        vi.advanceTimersByTime(100);
        await nextTick();

        expect(debouncedValue.value).toBe('changed');
        expect(isDebouncing.value).toBe(false);
    });

    it('should handle multiple rapid changes', async () => {
        const source = ref(0);
        const { debouncedValue } = useReactiveDebounce(source, 100);

        source.value = 1;
        await nextTick();
        source.value = 2;
        await nextTick();
        source.value = 3;
        await nextTick();

        expect(debouncedValue.value).toBe(0);

        vi.advanceTimersByTime(100);
        await nextTick();

        expect(debouncedValue.value).toBe(3);
    });

    it('should support cancel', async () => {
        const source = ref('initial');
        const { debouncedValue, cancel } = useReactiveDebounce(source, 100);

        source.value = 'changed';
        await nextTick();

        cancel();
        vi.advanceTimersByTime(100);
        await nextTick();

        expect(debouncedValue.value).toBe('initial');
    });

    it('should support flush', async () => {
        const source = ref('initial');
        const { debouncedValue, flush } = useReactiveDebounce(source, 100);

        source.value = 'changed';
        await nextTick();

        flush();
        await nextTick();

        expect(debouncedValue.value).toBe('changed');
    });
});

describe('useMapDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should provide specialized debounce functions for map operations', () => {
        const { zoomDebounce, boundsDebounce, searchDebounce } = useMapDebounce();

        expect(zoomDebounce).toBeDefined();
        expect(boundsDebounce).toBeDefined();
        expect(searchDebounce).toBeDefined();
    });

    it('should debounce zoom operations', () => {
        const callback = vi.fn();
        const { zoomDebounce } = useMapDebounce();

        zoomDebounce(10, callback);
        zoomDebounce(11, callback);
        zoomDebounce(12, callback);

        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(300);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(12);
    });

    it('should debounce bounds operations with maxWait', () => {
        const callback = vi.fn();
        const { boundsDebounce } = useMapDebounce();

        const bounds = { sw: [0, 0], ne: [1, 1] };

        for (let i = 0; i < 10; i++) {
            boundsDebounce(bounds, callback);
            vi.advanceTimersByTime(100);
        }

        // Should have invoked due to maxWait: 500
        expect(callback).toHaveBeenCalled();
    });

    it('should debounce search operations', () => {
        const callback = vi.fn();
        const { searchDebounce } = useMapDebounce();

        searchDebounce('q', callback);
        searchDebounce('qu', callback);
        searchDebounce('que', callback);
        searchDebounce('quer', callback);
        searchDebounce('query', callback);

        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(400);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith('query');
    });
});

describe('useThrottle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should throttle function calls', () => {
        const func = vi.fn();
        const throttled = useThrottle(func, 100);

        throttled('call1');
        expect(func).toHaveBeenCalledTimes(1);
        expect(func).toHaveBeenCalledWith('call1');

        throttled('call2');
        throttled('call3');
        expect(func).toHaveBeenCalledTimes(1); // Still only once

        vi.advanceTimersByTime(100);
        expect(func).toHaveBeenCalledTimes(2);
    });

    it('should invoke immediately on first call', () => {
        const func = vi.fn();
        const throttled = useThrottle(func, 100);

        throttled('call1');
        expect(func).toHaveBeenCalledWith('call1');
    });

    it('should respect throttle limit', () => {
        const func = vi.fn();
        const throttled = useThrottle(func, 200);

        throttled('call1');
        expect(func).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        throttled('call2');
        expect(func).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        expect(func).toHaveBeenCalledTimes(2);
    });

    it('should handle cancel', () => {
        const func = vi.fn();
        const throttled = useThrottle(func, 100);

        throttled('call1');
        expect(func).toHaveBeenCalledTimes(1);

        throttled('call2');
        throttled.cancel();

        vi.advanceTimersByTime(100);
        expect(func).toHaveBeenCalledTimes(1); // Should not call again
    });

    it('should handle high-frequency calls', () => {
        const func = vi.fn();
        const throttled = useThrottle(func, 100);

        for (let i = 0; i < 50; i++) {
            throttled(`call${i}`);
            vi.advanceTimersByTime(10);
        }

        // After 500ms with throttle of 100ms, should have called ~5-6 times
        expect(func.mock.calls.length).toBeGreaterThanOrEqual(5);
        expect(func.mock.calls.length).toBeLessThanOrEqual(7);
    });

    it('should preserve context', () => {
        const context = { value: 42 };
        const func = vi.fn(function () {
            return this.value;
        });
        const throttled = useThrottle(func, 100);

        throttled.call(context, 'arg1');
        expect(func).toHaveBeenCalled();
    });
});
