/**
 * Enhanced debouncing utilities for interactive operations
 */
import { ref, watch, onUnmounted } from 'vue';

// Advanced debounce with leading and trailing edge control
export function useAdvancedDebounce(func, delay, options = {}) {
    const {
        leading = false,
        trailing = true,
        maxWait = null
    } = options;

    let timeoutId = null;
    let maxTimeoutId = null;
    let lastCallTime = 0;
    let lastInvokeTime = 0;
    let lastArgs = null;
    let lastThis = null;
    let result = null;

    const invokeFunc = (time) => {
        const args = lastArgs;
        const thisArg = lastThis;

        lastArgs = null;
        lastThis = null;
        lastInvokeTime = time;
        result = func.apply(thisArg, args);
        return result;
    };

    const leadingEdge = (time) => {
        lastInvokeTime = time;
        timeoutId = setTimeout(timerExpired, delay);
        return leading ? invokeFunc(time) : result;
    };

    const remainingWait = (time) => {
        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;
        const timeWaiting = delay - timeSinceLastCall;

        return maxWait !== null
            ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
            : timeWaiting;
    };

    const shouldInvoke = (time) => {
        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;

        return (lastCallTime === 0 ||
            timeSinceLastCall >= delay ||
            timeSinceLastCall < 0 ||
            (maxWait !== null && timeSinceLastInvoke >= maxWait));
    };

    const timerExpired = () => {
        const time = Date.now();
        if (shouldInvoke(time)) {
            return trailingEdge(time);
        }
        timeoutId = setTimeout(timerExpired, remainingWait(time));
    };

    const trailingEdge = (time) => {
        timeoutId = null;

        if (trailing && lastArgs) {
            return invokeFunc(time);
        }
        lastArgs = null;
        lastThis = null;
        return result;
    };

    const debounced = function (...args) {
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
                timeoutId = setTimeout(timerExpired, delay);
                return invokeFunc(lastCallTime);
            }
        }
        if (timeoutId === null) {
            timeoutId = setTimeout(timerExpired, delay);
        }
        return result;
    };

    debounced.cancel = () => {
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

    debounced.flush = () => {
        return timeoutId === null ? result : trailingEdge(Date.now());
    };

    debounced.pending = () => {
        return timeoutId !== null;
    };

    return debounced;
}

// Reactive debounce for Vue refs
export function useReactiveDebounce(source, delay, options = {}) {
    const debouncedValue = ref(source.value);
    const isDebouncing = ref(false);

    const debounced = useAdvancedDebounce((value) => {
        debouncedValue.value = value;
        isDebouncing.value = false;
    }, delay, options);

    const stopWatcher = watch(source, (newValue) => {
        isDebouncing.value = true;
        debounced(newValue);
    }, { immediate: false });

    onUnmounted(() => {
        debounced.cancel();
        stopWatcher();
    });

    return {
        debouncedValue,
        isDebouncing,
        cancel: debounced.cancel,
        flush: debounced.flush
    };
}

// Specialized debounce for map operations
export function useMapDebounce() {
    const zoomDebounce = useAdvancedDebounce((zoomLevel, callback) => {
        callback(zoomLevel);
    }, 300, { leading: false, trailing: true });

    const boundsDebounce = useAdvancedDebounce((bounds, callback) => {
        callback(bounds);
    }, 150, { leading: false, trailing: true, maxWait: 500 });

    const searchDebounce = useAdvancedDebounce((query, callback) => {
        callback(query);
    }, 400, { leading: false, trailing: true });

    onUnmounted(() => {
        zoomDebounce.cancel();
        boundsDebounce.cancel();
        searchDebounce.cancel();
    });

    return {
        zoomDebounce,
        boundsDebounce,
        searchDebounce
    };
}

// Throttle for high-frequency events (mouse move, scroll)
export function useThrottle(func, limit) {
    let inThrottle = false;
    let lastFunc = null;
    let lastRan = null;

    const throttled = function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            lastRan = Date.now();
            inThrottle = true;
        } else {
            if (lastFunc) clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };

    throttled.cancel = () => {
        if (lastFunc) {
            clearTimeout(lastFunc);
            lastFunc = null;
        }
        inThrottle = false;
    };

    return throttled;
}
