/**
 * Map performance optimization utilities
 * Configuration for optimizing Leaflet map rendering performance
 */

import type { MapOptions } from 'leaflet';

// Optimized Leaflet map options for smooth rendering
// Note: 'tap' and 'tapTolerance' are not in MapOptions type but are valid Leaflet options
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
} as MapOptions;
