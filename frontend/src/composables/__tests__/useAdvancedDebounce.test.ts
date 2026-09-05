import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAdvancedDebounce, useThrottle } from '../useAdvancedDebounce';

describe('useAdvancedDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('debounces function calls', () => {
        const fn = vi.fn();
        const debounced = useAdvancedDebounce(fn, 100);

        debounced('a');
        debounced('b');
        debounced('c');

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('c');
    });

    it('supports leading edge', () => {
        const fn = vi.fn();
        const debounced = useAdvancedDebounce(fn, 100, { leading: true, trailing: false });

        debounced('a');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');

        debounced('b');
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('cancels pending execution', () => {
        const fn = vi.fn();
        const debounced = useAdvancedDebounce(fn, 100);

        debounced('a');
        debounced.cancel();

        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('flushes pending execution immediately', () => {
        const fn = vi.fn();
        const debounced = useAdvancedDebounce(fn, 100);

        debounced('a');
        debounced.flush();

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('reports pending state', () => {
        const fn = vi.fn();
        const debounced = useAdvancedDebounce(fn, 100);

        expect(debounced.pending()).toBe(false);

        debounced('a');
        expect(debounced.pending()).toBe(true);

        vi.advanceTimersByTime(100);
        expect(debounced.pending()).toBe(false);
    });

    it('supports maxWait option', () => {
        const fn = vi.fn();
        const debounced = useAdvancedDebounce(fn, 100, { maxWait: 200 });

        // Call repeatedly
        for (let i = 0; i < 10; i++) {
            vi.advanceTimersByTime(50);
            debounced(`call-${i}`);
        }

        // Should have been invoked at least once due to maxWait
        expect(fn).toHaveBeenCalled();
    });
});

describe('useThrottle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('throttles function calls', () => {
        const fn = vi.fn();
        const throttled = useThrottle(fn, 100);

        throttled('a');
        throttled('b');
        throttled('c');

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('cancels pending throttled call', () => {
        const fn = vi.fn();
        const throttled = useThrottle(fn, 100);

        throttled('a');
        throttled('b');
        throttled.cancel();

        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
