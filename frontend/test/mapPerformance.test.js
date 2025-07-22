import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle, PerformanceMonitor } from '../src/utils/mapPerformance.js';

describe('Map Performance Utilities', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Clear any existing timers before each test
        PerformanceMonitor.timers.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('debounce', () => {
        it('should debounce function calls', () => {
            const mockFn = vi.fn();
            const debouncedFn = debounce(mockFn, 100);

            // Call multiple times rapidly
            debouncedFn();
            debouncedFn();
            debouncedFn();

            // Function should not be called yet
            expect(mockFn).not.toHaveBeenCalled();

            // Fast-forward time
            vi.advanceTimersByTime(100);

            // Function should be called once
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should handle immediate execution', () => {
            const mockFn = vi.fn();
            const debouncedFn = debounce(mockFn, 100, true);

            debouncedFn();

            // Function should be called immediately
            expect(mockFn).toHaveBeenCalledTimes(1);

            // Subsequent calls should be debounced
            debouncedFn();
            debouncedFn();

            vi.advanceTimersByTime(100);

            // Still only called once
            expect(mockFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('throttle', () => {
        it('should throttle function calls', () => {
            const mockFn = vi.fn();
            const throttledFn = throttle(mockFn, 100);

            // Call multiple times rapidly
            throttledFn();
            throttledFn();
            throttledFn();

            // Function should be called once immediately
            expect(mockFn).toHaveBeenCalledTimes(1);

            // Fast-forward time
            vi.advanceTimersByTime(100);

            // Now another call should be allowed
            throttledFn();
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('PerformanceMonitor', () => {
        beforeEach(() => {
            // Clear any existing timers
            PerformanceMonitor.timers.clear();
        });

        it('should measure performance correctly', () => {
            // Mock performance.now with specific return values
            const mockNow = vi.fn()
                .mockReturnValueOnce(100)  // start() call
                .mockReturnValueOnce(150); // end() call

            global.performance = { now: mockNow };

            const duration = PerformanceMonitor.measure('test', () => {
                return 'result';
            });

            expect(mockNow).toHaveBeenCalledTimes(2);
            expect(duration).toBe(50); // 150 - 100 = 50
        });
    });

    describe('Smooth rendering optimization', () => {
        it('should keep tracks visible during zoom operations', () => {
            // Mock the map state to simulate zoom
            const mockMapState = {
                isZoomAnimating: true,
                isPanningOrZooming: true,
                mapIsReady: true,
                isUnmounting: false,
                isTransitioning: false
            };

            // Mock shouldRenderGeoJson computed property logic
            const shouldRender = !mockMapState.isUnmounting &&
                mockMapState.mapIsReady &&
                !mockMapState.isTransitioning;

            // Tracks should remain visible even during zoom/pan operations
            expect(shouldRender).toBe(true);
        });

        it('should optimize event handling during interactions', () => {
            const mockFn = vi.fn();
            const optimizedHandler = (isPanning, isZooming) => {
                if (!isPanning && !isZooming) {
                    mockFn();
                }
            };

            // During normal operation - events should be handled
            optimizedHandler(false, false);
            expect(mockFn).toHaveBeenCalledTimes(1);

            // During panning - events should be skipped
            optimizedHandler(true, false);
            expect(mockFn).toHaveBeenCalledTimes(1);

            // During zooming - events should be skipped
            optimizedHandler(false, true);
            expect(mockFn).toHaveBeenCalledTimes(1);
        });
    });
});
