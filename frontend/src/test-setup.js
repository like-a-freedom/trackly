// Test setup file for Vitest
import { config } from '@vue/test-utils'
import { vi } from 'vitest'
import { nextTick } from 'vue'

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
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockAfterEach = vi.fn();
const mockBeforeEach = vi.fn();

vi.mock('vue-router', () => {
    const route = {
        path: '/',
        fullPath: '/',
        name: 'home',
        params: { id: 'test-track-id' },
        query: {},
        hash: '',
        matched: [],
        meta: {}
    };
    return {
        useRoute: () => route,
        useRouter: () => ({
            push: mockPush,
            replace: mockReplace,
            afterEach: mockAfterEach,
            beforeEach: mockBeforeEach,
            currentRoute: { value: route }
        }),
        // Export the mocks so they can be imported in tests
        __mocks: {
            push: mockPush,
            replace: mockReplace,
            afterEach: mockAfterEach,
            beforeEach: mockBeforeEach
        }
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

// Wrap URL constructor so that relative URLs are allowed in tests
if (typeof global.URL === 'function') {
    const NativeURL = global.URL;
    function URLWrapper(url, base) {
        // If only a relative path (no base), default to http://localhost
        return new NativeURL(url, base || 'http://localhost');
    }
    URLWrapper.createObjectURL = NativeURL.createObjectURL;
    URLWrapper.revokeObjectURL = NativeURL.revokeObjectURL;
    URLWrapper.prototype = NativeURL.prototype;
    global.URL = URLWrapper;
    window.URL = URLWrapper;
}

// Mock fetch — always override Node/browser fetch with our test-friendly stub
// Simple fetch mock that handles common API paths used in tests
global.fetch = vi.fn(async (url, opts) => {
    const path = typeof url === 'string' ? url : (url?.url || '');
    // Trim out origin so both absolute and relative URLs match
    const trimmed = (path || '').replace(/^https?:\/\/[^/]+/, '');
    // POIs endpoint
    if (trimmed.endsWith('/pois')) {
        return {
            ok: true,
            json: async () => []
        };
    }
    // Track details endpoint
    if (trimmed.includes('/tracks/') && !trimmed.includes('/pois')) {
        // Extract id and return simplified track object for tests
        const idMatch = trimmed.match(/\/tracks\/(.*?)(\/|$|\?)/);
        const id = idMatch ? idMatch[1] : 'test-track-id';
        return {
            ok: true,
            json: async () => ({
                id,
                latlngs: [[55.7558, 37.6173], [55.7568, 37.6173]],
                time_data: [null, '2024-01-01T10:00:00Z'],
                duration_seconds: 3600,
                recorded_at: '2024-01-01T09:00:00Z'
            })
        };
    }

    // Fallback
    return {
        ok: true,
        json: async () => ({})
    };
});

// Wrap the global Request constructor in tests so that relative URLs (e.g. '/tracks/1')
// don't throw when Request tries to create a URL object in Node's undici implementation.
// This mirrors browser behavior by using http://localhost as base for relative URLs.
if (typeof global.Request !== 'undefined') {
    const OriginalRequest = global.Request;
    global.Request = function (input, init) {
        try {
            if (typeof input === 'string' && input.startsWith('/')) {
                return new OriginalRequest(`http://localhost${input}`, init);
            }
            // If input is a Request-like object (undici passes Request), normalize its url
            if (input && input.url && typeof input.url === 'string' && input.url.startsWith('/')) {
                return new OriginalRequest(`http://localhost${input.url}`, init || input);
            }
        } catch (e) {
            // Fall back to original behavior if anything goes wrong
            // eslint-disable-next-line no-console
            console.warn('[test-setup] Request wrapper fallback:', e.message);
        }
        return new OriginalRequest(input, init);
    };
    // Preserve prototype chain so instanceof checks still work
    Object.setPrototypeOf(global.Request, OriginalRequest);
}

// Mock localStorage for tests
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        // For tests that check the raw store
        __getStore: () => store
    };
})();
// Always assign a reliable localStorage mock for tests (overwrite anything present)
global.localStorage = localStorageMock;
window.localStorage = localStorageMock;

// Global helper to wait for arbitrary conditions without relying on real timers
global.waitFor = async (predicate, { timeout = 1000 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        // Let Vue and microtasks settle
        await nextTick();
        await Promise.resolve();
        try {
            if (predicate()) return;
        } catch (e) {
            // Ignore intermediate errors until the condition stabilizes
        }
    }
    throw new Error('waitFor: condition not met within timeout');
};

// Suppress Vue warnings during tests
config.global.config.warnHandler = () => { };
config.global.config.errorHandler = () => { };

// Suppress Vue warnings in tests
config.global.config = {
    warnHandler: () => { }, // Suppress all Vue warnings
    errorHandler: () => { } // Suppress all Vue errors
};

// Suppress console warnings/errors and info/log to keep test output clean by default.
// You can disable suppression for a run by setting SUPPRESS_TEST_CONSOLE=false in the environment.
// Tests can still spy on console methods using `vi.spyOn(console, 'warn')` / `vi.spyOn(console, 'error')` / `vi.spyOn(console, 'log')`.
const __originalConsoleWarn = console.warn;
const __originalConsoleError = console.error;
const __originalConsoleLog = console.log;
const __originalConsoleInfo = console.info;
if (process.env.SUPPRESS_TEST_CONSOLE !== 'false') {
    console.warn = (..._args) => { /* suppressed during tests */ };
    console.error = (..._args) => { /* suppressed during tests */ };
    console.log = (..._args) => { /* suppressed during tests */ };
    console.info = (..._args) => { /* suppressed during tests */ };
}
// Keep originals available for debugging if needed
global.__originalConsoleWarn = __originalConsoleWarn;
global.__originalConsoleError = __originalConsoleError;
global.__originalConsoleLog = __originalConsoleLog;
global.__originalConsoleInfo = __originalConsoleInfo;
