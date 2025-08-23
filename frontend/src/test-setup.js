// Test setup file for Vitest
import { config } from '@vue/test-utils'
import { vi } from 'vitest'

// Prevent Leaflet from trying to load any assets
vi.mock('leaflet/dist/leaflet.css', () => ({}))

// Mock static assets (PNG, SVG, etc.) to prevent import errors
vi.mock('*.png', () => ({ default: 'data:image/png;base64,mock' }))
vi.mock('*.svg', () => ({ default: 'data:image/svg+xml;base64,mock' }))
vi.mock('*.jpg', () => ({ default: 'data:image/jpeg;base64,mock' }))
vi.mock('*.jpeg', () => ({ default: 'data:image/jpeg;base64,mock' }))
vi.mock('*.gif', () => ({ default: 'data:image/gif;base64,mock' }))

// Mock specific Leaflet assets that cause issues
vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: 'data:image/png;base64,mock' }))
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: 'data:image/png;base64,mock' }))
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: 'data:image/png;base64,mock' }))
vi.mock('leaflet/dist/images/layers.png', () => ({ default: 'data:image/png;base64,mock' }))
vi.mock('leaflet/dist/images/layers-2x.png', () => ({ default: 'data:image/png;base64,mock' }))

// Mock Leaflet completely to prevent any asset imports
vi.mock('leaflet', () => {
    const mockMap = {
        setView: vi.fn(() => mockMap),
        on: vi.fn(() => mockMap),
        off: vi.fn(() => mockMap),
        remove: vi.fn(),
        getBounds: vi.fn(() => ({
            getNorthEast: vi.fn(() => ({ lat: 1, lng: 1 })),
            getSouthWest: vi.fn(() => ({ lat: 0, lng: 0 }))
        })),
        addLayer: vi.fn(() => mockMap),
        removeLayer: vi.fn(() => mockMap),
        fitBounds: vi.fn(() => mockMap),
        invalidateSize: vi.fn(() => mockMap),
        getContainer: vi.fn(() => document.createElement('div'))
    }

    const mockGeoJSON = {
        addTo: vi.fn(() => mockGeoJSON),
        on: vi.fn(() => mockGeoJSON),
        off: vi.fn(() => mockGeoJSON),
        remove: vi.fn(),
        setStyle: vi.fn(() => mockGeoJSON),
        eachLayer: vi.fn()
    }

    const mockTileLayer = {
        addTo: vi.fn(() => mockTileLayer),
        remove: vi.fn()
    }

    const mockMarkerClusterGroup = {
        addLayer: vi.fn(() => mockMarkerClusterGroup),
        removeLayer: vi.fn(() => mockMarkerClusterGroup),
        clearLayers: vi.fn(() => mockMarkerClusterGroup),
        addTo: vi.fn(() => mockMarkerClusterGroup),
        on: vi.fn(() => mockMarkerClusterGroup),
        off: vi.fn(() => mockMarkerClusterGroup),
        remove: vi.fn()
    }

    return {
        default: {
            map: vi.fn(() => mockMap),
            tileLayer: vi.fn(() => mockTileLayer),
            geoJSON: vi.fn(() => mockGeoJSON),
            Icon: {
                Default: {
                    mergeOptions: vi.fn(),
                    prototype: {
                        _getIconUrl: vi.fn(() => 'data:image/png;base64,mock'),
                        options: {
                            iconUrl: 'data:image/png;base64,mock',
                            iconRetinaUrl: 'data:image/png;base64,mock',
                            shadowUrl: 'data:image/png;base64,mock'
                        }
                    }
                }
            },
            MarkerClusterGroup: vi.fn(() => mockMarkerClusterGroup)
        }
    }
})

// Global test configuration
config.global.stubs = {
    // Stub out router-link if you're using Vue Router
    'router-link': true,
    'router-view': true,
    // Stub TrackMap component to prevent Leaflet mounting issues
    'TrackMap': {
        template: '<div class="track-map-stub"></div>',
        props: ['polylines', 'zoom', 'center', 'bounds'],
        emits: ['centerUpdate', 'zoomUpdate', 'boundsUpdate', 'trackClick', 'mapReady']
    }
}

// Mock leaflet.markercluster
vi.mock('leaflet.markercluster', () => ({}));

// Create global L variable for plugins that expect it
global.L = {
    map: vi.fn(() => ({
        setView: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        remove: vi.fn(),
        getBounds: vi.fn(() => ({
            getNorthEast: vi.fn(() => ({ lat: 1, lng: 1 })),
            getSouthWest: vi.fn(() => ({ lat: 0, lng: 0 }))
        })),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        fitBounds: vi.fn(),
        invalidateSize: vi.fn()
    })),
    tileLayer: vi.fn(() => ({
        addTo: vi.fn()
    })),
    geoJSON: vi.fn(() => ({
        addTo: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        remove: vi.fn(),
        setStyle: vi.fn(),
        eachLayer: vi.fn()
    })),
    Icon: {
        Default: {
            mergeOptions: vi.fn()
        }
    },
    MarkerClusterGroup: vi.fn(() => ({
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        clearLayers: vi.fn(),
        addTo: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
    }))
};

// Mock ResizeObserver for Leaflet
global.ResizeObserver = class ResizeObserver {
    constructor(cb) {
        this.cb = cb;
    }
    observe() {
        this.cb([{ borderBoxSize: { inlineSize: 0, blockSize: 0 } }], this);
    }
    unobserve() { }
    disconnect() { }
};

// Mock vue-router composables (useRoute, useRouter) to avoid needing a real router in unit tests
vi.mock('vue-router', () => {
    const route = {
        path: '/',
        fullPath: '/',
        name: 'home',
        params: {},
        query: {},
        hash: '',
        matched: [],
        meta: {}
    };
    return {
        useRoute: () => route,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: { value: route }
        })
    };
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Ensure document.body exists and has proper DOM methods
if (!document.body) {
    document.body = document.createElement('body');
}

// Add necessary DOM methods
document.body.appendChild = document.body.appendChild || vi.fn();
document.body.removeChild = document.body.removeChild || vi.fn();

// Mock createElement and ensure it returns objects with necessary methods
const originalCreateElement = document.createElement;
document.createElement = vi.fn((tagName) => {
    const element = originalCreateElement.call(document, tagName);
    if (tagName === 'a') {
        element.click = vi.fn();
        element.download = '';
        element.href = '';
        element.style = {};
    }
    return element;
});

// Mock URL for blob creation
if (!global.URL) {
    global.URL = {};
}
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Also ensure window.URL is properly mocked
if (!window.URL) {
    window.URL = {};
}
window.URL.createObjectURL = vi.fn(() => 'mock-url');
window.URL.revokeObjectURL = vi.fn();

// Mock fetch if not already mocked
global.fetch = global.fetch || vi.fn();

// Suppress Vue warnings during tests
config.global.config.warnHandler = () => { };
config.global.config.errorHandler = () => { };

// Suppress Vue warnings in tests
config.global.config = {
    warnHandler: () => { }, // Suppress all Vue warnings
    errorHandler: () => { } // Suppress all Vue errors
};
