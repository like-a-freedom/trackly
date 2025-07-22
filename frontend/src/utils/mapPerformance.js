/**
 * Map performance optimization utilities
 * Contains configuration and helper functions for optimizing Leaflet map performance
 */

// Optimized Leaflet map options for smooth rendering
export const OPTIMIZED_MAP_OPTIONS = {
    // Use Canvas for better performance with many features
    preferCanvas: true,

    // Disable zoom control to reduce DOM manipulation
    zoomControl: false,

    // Optimize zoom animations
    zoomAnimation: true,
    zoomAnimationThreshold: 4,

    // Optimize fade animations
    fadeAnimation: true,

    // Optimize marker zoom animation
    markerZoomAnimation: true,

    // Optimize for touch devices
    tap: true,
    tapTolerance: 15,

    // Optimize wheel zoom
    wheelDebounceTime: 60,
    wheelPxPerZoomLevel: 60,

    // Performance settings
    maxZoom: 18,
    minZoom: 2,

    // Optimize tile loading
    keepBuffer: 2,

    // Optimize interactions
    doubleClickZoom: true,
    closePopupOnClick: true
};

// Performance optimized GeoJSON options factory
export const createOptimizedGeoJsonOptions = (L) => ({
    // Use SVG for better quality but optimize for performance
    renderer: L ? L.svg({ padding: 0.1 }) : null,

    // Optimize coordinate precision
    coordsToLatLng: function (coords) {
        if (L) {
            return new L.LatLng(
                Math.round(coords[1] * 1000000) / 1000000, // 6 decimal places
                Math.round(coords[0] * 1000000) / 1000000
            );
        }
        return [
            Math.round(coords[1] * 1000000) / 1000000,
            Math.round(coords[0] * 1000000) / 1000000
        ];
    },

    // Optimize for large datasets
    simplify: true,
    smoothFactor: 1.0
});

// Debounce utility for performance optimization
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

// Throttle utility for performance optimization
export function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// RequestAnimationFrame-based utility for smooth updates
export function requestIdleCallback(callback, options = {}) {
    const { timeout = 5000 } = options;

    if (window.requestIdleCallback) {
        return window.requestIdleCallback(callback, { timeout });
    }

    // Fallback for browsers without requestIdleCallback
    return setTimeout(() => {
        const start = Date.now();
        callback({
            didTimeout: false,
            timeRemaining() {
                return Math.max(0, 50 - (Date.now() - start));
            }
        });
    }, 1);
}

// Performance monitoring utilities
export const PerformanceMonitor = {
    timers: new Map(),

    start(label) {
        this.timers.set(label, performance.now());
    },

    end(label, logToConsole = false) {
        const startTime = this.timers.get(label);
        if (startTime) {
            const duration = performance.now() - startTime;
            this.timers.delete(label);

            if (logToConsole) {
                console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
            }

            return duration;
        }
        return 0;
    },

    measure(label, fn) {
        this.start(label);
        const result = fn();
        const duration = this.end(label, false); // Don't log to console during measure
        return duration;
    }
};
