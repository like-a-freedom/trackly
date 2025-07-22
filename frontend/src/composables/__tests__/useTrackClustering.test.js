import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a shared mock object that can be accessed in tests
const mockMarkerClusterGroup = {
    clearLayers: vi.fn(),
    addLayers: vi.fn(),
    getLayers: vi.fn(() => []),
    on: vi.fn(),
    off: vi.fn()
};

// Mock Leaflet before importing the composable
vi.mock('leaflet', () => {
    return {
        default: {
            marker: vi.fn(() => ({ trackData: null })),
            divIcon: vi.fn(() => ({})),
            markerClusterGroup: vi.fn(() => mockMarkerClusterGroup)
        }
    };
});

vi.mock('leaflet.markercluster', () => ({}));

import { useTrackClustering } from '../useTrackClustering.js';

describe('useTrackClustering', () => {
    let clustering;
    let mockL;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset all mock functions
        mockMarkerClusterGroup.clearLayers.mockClear();
        mockMarkerClusterGroup.addLayers.mockClear();
        mockMarkerClusterGroup.getLayers.mockClear();
        mockMarkerClusterGroup.on.mockClear();
        mockMarkerClusterGroup.off.mockClear();

        // Reset getLayers to return empty array by default
        mockMarkerClusterGroup.getLayers.mockReturnValue([]);

        // Get the mocked Leaflet module
        const leafletModule = await import('leaflet');
        mockL = leafletModule.default;
        clustering = useTrackClustering();
    });

    describe('calculateTrackCenter', () => {
        it('should return [0, 0] for empty coordinates', () => {
            const result = clustering.calculateTrackCenter([]);
            expect(result).toEqual([0, 0]);
        });

        it('should return the single point for single coordinate', () => {
            const coords = [[50.1, 14.4]];
            const result = clustering.calculateTrackCenter(coords);
            expect(result).toEqual([50.1, 14.4]);
        });

        it('should calculate center point correctly', () => {
            const coords = [[50.0, 14.0], [51.0, 15.0]];
            const result = clustering.calculateTrackCenter(coords);
            expect(result).toEqual([50.5, 14.5]);
        });
    });

    describe('calculateTrackStart', () => {
        it('should return [0, 0] for empty coordinates', () => {
            const result = clustering.calculateTrackStart([]);
            expect(result).toEqual([0, 0]);
        });

        it('should return first coordinate', () => {
            const coords = [[50.1, 14.4], [51.2, 15.5]];
            const result = clustering.calculateTrackStart(coords);
            expect(result).toEqual([50.1, 14.4]);
        });
    });

    describe('createTrackMarker', () => {
        it('should return null for invalid track data', () => {
            const result = clustering.createTrackMarker(null);
            expect(result).toBeNull();
        });

        it('should return null for track without coordinates', () => {
            const track = { properties: { id: 'test' } };
            const result = clustering.createTrackMarker(track);
            expect(result).toBeNull();
        });

        it('should create marker for valid track', () => {
            const track = {
                latlngs: [[50.0, 14.0], [51.0, 15.0]],
                properties: { id: 'test' },
                color: '#ff0000'
            };

            const result = clustering.createTrackMarker(track);

            expect(mockL.marker).toHaveBeenCalled();
            expect(mockL.divIcon).toHaveBeenCalled();
            expect(result).toBeTruthy();
            expect(result.trackData).toBe(track);
        });
    });

    describe('initializeClusterGroup', () => {
        it('should create cluster group with default config', () => {
            const result = clustering.initializeClusterGroup();

            expect(mockL.markerClusterGroup).toHaveBeenCalledWith(
                expect.objectContaining({
                    disableClusteringAtZoom: 11,
                    maxClusterRadius: 50,
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true,
                    animate: false, // Updated to match current implementation
                    animateAddingMarkers: false, // Updated to match current implementation
                    chunkedLoading: true,
                    chunkInterval: 50,
                    spiderfyOnMaxZoom: false,
                    removeOutsideVisibleBounds: true
                })
            );
            expect(result).toBe(mockMarkerClusterGroup);
        });

        it('should merge custom config with defaults', () => {
            const customConfig = { maxClusterRadius: 100 };
            clustering.initializeClusterGroup(customConfig);

            expect(mockL.markerClusterGroup).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxClusterRadius: 100,
                    disableClusteringAtZoom: 11 // Still uses default
                })
            );
        });
    });

    describe('addTracksToCluster', () => {
        beforeEach(() => {
            clustering.initializeClusterGroup();
            // Set up mock to have existing layers to test clearLayers behavior
            mockMarkerClusterGroup.getLayers.mockReturnValue([{ id: 'existing' }]);
        });

        it('should handle empty tracks array', () => {
            clustering.addTracksToCluster([], mockMarkerClusterGroup);

            expect(mockMarkerClusterGroup.clearLayers).toHaveBeenCalled();
            expect(mockMarkerClusterGroup.addLayers).not.toHaveBeenCalled();
        });

        it('should create markers and add to cluster', () => {
            const tracks = [
                {
                    latlngs: [[50.0, 14.0]],
                    properties: { id: 'track1' },
                    color: '#ff0000'
                },
                {
                    latlngs: [[51.0, 15.0]],
                    properties: { id: 'track2' },
                    color: '#00ff00'
                }
            ];

            clustering.addTracksToCluster(tracks, mockMarkerClusterGroup);

            expect(mockMarkerClusterGroup.clearLayers).toHaveBeenCalled();
            expect(mockL.marker).toHaveBeenCalledTimes(2);
            expect(mockMarkerClusterGroup.addLayers).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ trackData: expect.any(Object) }),
                    expect.objectContaining({ trackData: expect.any(Object) })
                ])
            );
        });

        it('should filter out invalid tracks', () => {
            const tracks = [
                {
                    latlngs: [[50.0, 14.0]],
                    properties: { id: 'valid' },
                    color: '#ff0000'
                },
                null, // Invalid track
                {
                    properties: { id: 'invalid' } // No coordinates
                }
            ];

            clustering.addTracksToCluster(tracks, mockMarkerClusterGroup);

            expect(mockMarkerClusterGroup.addLayers).toHaveBeenCalledWith([
                expect.objectContaining({ trackData: expect.any(Object) })
            ]);
        });
    });

    describe('shouldCluster computed', () => {
        it('should return true when clustering enabled and zoom below threshold', () => {
            clustering.setClusteringEnabled(true);
            clustering.updateZoomLevel(10);

            expect(clustering.shouldCluster.value).toBe(true);
        });

        it('should return false when clustering disabled', () => {
            clustering.setClusteringEnabled(false);
            clustering.updateZoomLevel(10);

            expect(clustering.shouldCluster.value).toBe(false);
        });

        it('should return false when zoom above threshold', () => {
            clustering.setClusteringEnabled(true);
            clustering.updateZoomLevel(12); // Above default threshold of 11

            expect(clustering.shouldCluster.value).toBe(false);
        });
    });

    describe('cleanup', () => {
        it('should clean up cluster group safely', () => {
            clustering.initializeClusterGroup();
            // Set up mock to have existing layers to test clearLayers behavior
            mockMarkerClusterGroup.getLayers.mockReturnValue([{ id: 'existing' }]);

            clustering.cleanup();

            expect(mockMarkerClusterGroup.clearLayers).toHaveBeenCalled();
            expect(mockMarkerClusterGroup.off).toHaveBeenCalled();
            expect(clustering.clusterGroup.value).toBeNull();
        });

        it('should handle cleanup when no cluster group exists', () => {
            expect(() => clustering.cleanup()).not.toThrow();
        });
    });
});
