/**
 * Enhanced debouncing utilities for interactive operations
 */

interface DebounceOptions {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number | null;
}

interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
    flush: () => ReturnType<T> | undefined;
    pending: () => boolean;
}

// Advanced debounce with leading and trailing edge control
export function useAdvancedDebounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    delay: number,
    options: DebounceOptions = {}
): DebouncedFunction<T> {
    const {
        leading = false,
        trailing = true,
        maxWait = null
    } = options;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastCallTime = 0;
    let lastInvokeTime = 0;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: unknown = null;
    let result: ReturnType<T> | undefined = undefined;

    const invokeFunc = (time: number): ReturnType<T> | undefined => {
        const args = lastArgs;
        const thisArg = lastThis;

        lastArgs = null;
        lastThis = null;
        lastInvokeTime = time;
        result = func.apply(thisArg, args as Parameters<T>) as ReturnType<T>;
        return result;
    };

    const leadingEdge = (time: number): ReturnType<T> | undefined => {
        lastInvokeTime = time;
        timeoutId = setTimeout(timerExpired, delay);
        return leading ? invokeFunc(time) : result;
    };

    const remainingWait = (time: number): number => {
        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;
        const timeWaiting = delay - timeSinceLastCall;

        return maxWait !== null
            ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
            : timeWaiting;
    };

    const shouldInvoke = (time: number): boolean => {
        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;

        return (lastCallTime === 0 ||
            timeSinceLastCall >= delay ||
            timeSinceLastCall < 0 ||
            (maxWait !== null && timeSinceLastInvoke >= maxWait));
    };

    const timerExpired = (): void => {
        const time = Date.now();
        if (shouldInvoke(time)) {
            trailingEdge(time);
            return;
        }
        if (timeoutId !== null) {
            timeoutId = setTimeout(timerExpired, remainingWait(time));
        }
    };

    const trailingEdge = (time: number): ReturnType<T> | undefined => {
        timeoutId = null;

        if (trailing && lastArgs) {
            return invokeFunc(time);
        }
        lastArgs = null;
        lastThis = null;
        return result;
    };

    const debounced = function (this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
        const time = Date.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking) {
            if (timeoutId === null) {
                return leadingEdge(lastCallTime);
            }
            if (maxWait !== null) {
                if (timeoutId !== null) clearTimeout(timeoutId);
                timeoutId = setTimeout(timerExpired, delay);
                return invokeFunc(lastCallTime);
            }
        }
        if (timeoutId === null) {
            timeoutId = setTimeout(timerExpired, delay);
        }
        return result;
    };

    debounced.cancel = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        if (maxTimeoutId !== null) {
            clearTimeout(maxTimeoutId);
        }
        lastInvokeTime = 0;
        lastArgs = null;
        lastCallTime = 0;
        lastThis = null;
        timeoutId = null;
        maxTimeoutId = null;
    };

    debounced.flush = (): ReturnType<T> | undefined => {
        return timeoutId === null ? result : trailingEdge(Date.now());
    };

    debounced.pending = (): boolean => {
        return timeoutId !== null;
    };

    return debounced;
}

interface ThrottledFunction<T extends (...args: unknown[]) => unknown> {
    (this: unknown, ...args: Parameters<T>): void;
    cancel: () => void;
}

// Throttle for high-frequency events (mouse move, scroll)
export function useThrottle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number
): ThrottledFunction<T> {
    let inThrottle = false;
    let lastFunc: ReturnType<typeof setTimeout> | null = null;
    let lastRan: number | null = null;

    const throttled = function (this: unknown, ...args: Parameters<T>): void {
        if (!inThrottle) {
            func.apply(this, args);
            lastRan = Date.now();
            inThrottle = true;
        } else {
            if (lastFunc) clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if (lastRan !== null && (Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - (lastRan ?? 0)));
        }
    };

    throttled.cancel = (): void => {
        if (lastFunc) {
            clearTimeout(lastFunc);
            lastFunc = null;
        }
        inThrottle = false;
    };

    return throttled;
}
