// Mock for Leaflet that handles asset imports properly
import { vi } from 'vitest'

// Mock the icon image imports by overriding Leaflet's Icon.Default
const mockIcon = {
    iconUrl: 'data:image/png;base64,mock-icon',
    iconRetinaUrl: 'data:image/png;base64,mock-icon-2x',
    shadowUrl: 'data:image/png;base64,mock-shadow',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
}

const leafletMock = {
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
        Default: vi.fn().mockImplementation(() => mockIcon),
        mergeOptions: vi.fn()
    },
    MarkerClusterGroup: vi.fn(() => ({
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        clearLayers: vi.fn(),
        addTo: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
    }))
}

// Override the Icon.Default with our mock
leafletMock.Icon.Default.prototype = mockIcon
leafletMock.Icon.Default.mergeOptions = vi.fn()

export default leafletMock
