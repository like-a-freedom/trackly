import { ref, computed, type Ref, type ComputedRef } from 'vue';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { LatLngTuple } from '@/types';

// Default clustering configuration
const DEFAULT_CLUSTER_CONFIG: L.MarkerClusterGroupOptions = {
    // Show individual tracks when zoomed in beyond this level
    disableClusteringAtZoom: 11,
    // Maximum cluster radius in pixels
    maxClusterRadius: 50,
    // Show coverage area when hovering over cluster
    showCoverageOnHover: false,
    // Zoom to show all items in cluster when clicking
    zoomToBoundsOnClick: true,
    // Optimize animations for better performance
    animate: false, // Disable animations to reduce lag
    // Animation duration
    animateAddingMarkers: false, // Disable for smoother zoom
    // Spiderfy clusters on max zoom
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 1.5,
    iconCreateFunction: undefined,
    // Remove clusters with only one item at max zoom
    removeOutsideVisibleBounds: true,
    singleMarkerMode: true,
    // Performance optimizations
    chunkedLoading: true,
    chunkProgress: undefined,
    chunkInterval: 50
};

interface TrackData {
    latlngs: LatLngTuple[];
    color?: string;
    properties?: Record<string, unknown>;
}

/**
 * Composable for track clustering functionality
 * Handles conversion of track polylines to cluster markers and cluster management
 */
export function useTrackClustering() {
    const clusterGroup: Ref<L.MarkerClusterGroup | null> = ref(null);
    const isClusteringEnabled: Ref<boolean> = ref(true);
    const currentZoomLevel: Ref<number> = ref(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterConfig: Ref<any> = ref({ ...DEFAULT_CLUSTER_CONFIG });

    /**
     * Calculate the center point of a track polyline
     */
    function calculateTrackCenter(latlngs: LatLngTuple[]): LatLngTuple {
        if (!latlngs || latlngs.length === 0) return [0, 0];

        if (latlngs.length === 1) return latlngs[0] ?? [0, 0];

        // Calculate centroid
        const sumLat = latlngs.reduce((sum, point) => sum + point[0], 0);
        const sumLng = latlngs.reduce((sum, point) => sum + point[1], 0);

        return [sumLat / latlngs.length, sumLng / latlngs.length];
    }

    /**
     * Calculate the starting point of a track
     */
    function calculateTrackStart(latlngs: LatLngTuple[]): LatLngTuple {
        if (!latlngs || latlngs.length === 0) return [0, 0];
        return latlngs[0] ?? [0, 0];
    }

    /**
     * Create a marker for a track cluster representation
     */
    function createTrackMarker(track: TrackData, strategy: 'center' | 'start' = 'center'): L.Marker | null {
        if (!track || !track.latlngs || track.latlngs.length === 0) {
            console.warn('[useTrackClustering] Invalid track data for marker creation:', track);
            return null;
        }

        const position: LatLngTuple = strategy === 'center'
            ? calculateTrackCenter(track.latlngs)
            : calculateTrackStart(track.latlngs);

        // Validate position coordinates
        if (!position || position.length !== 2 ||
            typeof position[0] !== 'number' || typeof position[1] !== 'number' ||
            isNaN(position[0]) || isNaN(position[1])) {
            console.warn('[useTrackClustering] Invalid position for marker:', position, track.properties?.id);
            return null;
        }

        // Create custom icon for track markers
        const icon = L.divIcon({
            html: `<div style="
        background-color: ${track.color || '#3388ff'};
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      "></div>`,
            className: 'track-cluster-marker',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        try {
            // Create marker with optimizations for performance
            const marker = L.marker(position, {
                icon,
                // Optimize for frequent updates
                interactive: true,
                riseOnHover: false // Disable for better performance
            });

            // Store track data for event handling
            (marker as unknown as { trackData: TrackData }).trackData = track;

            // Override _animateZoom to prevent errors during removal
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (marker as any)._animateZoom = function (this: any) {
                try {
                    if (!this._map || !this._icon) return;
                    // Skip animation for better performance during zoom
                    return;
                } catch (err: unknown) {
                    // Silently ignore zoom animation errors for cluster markers
                    if (window.DEBUG_LEAFLET_ERRORS) {
                        console.warn('[CLUSTER MARKER ZOOM ERROR]', err instanceof Error ? err.message : String(err));
                    }
                }
            };

            return marker;
        } catch (error) {
            console.error('[useTrackClustering] Error creating marker:', error, { position, track: track.properties?.id });
            return null;
        }
    }

    /**
     * Create custom cluster icon
     */
    function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
        const count = cluster.getChildCount();
        let className = 'track-cluster-small';

        if (count >= 100) {
            className = 'track-cluster-large';
        } else if (count >= 10) {
            className = 'track-cluster-medium';
        }

        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `track-cluster ${className}`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
    }

    /**
     * Initialize cluster group with configuration and performance optimizations
     */
    function initializeClusterGroup(config: Partial<L.MarkerClusterGroupOptions> = {}): L.MarkerClusterGroup {
        const finalConfig = { ...clusterConfig.value, ...config };

        const group = L.markerClusterGroup({
            disableClusteringAtZoom: finalConfig.disableClusteringAtZoom,
            maxClusterRadius: finalConfig.maxClusterRadius,
            showCoverageOnHover: finalConfig.showCoverageOnHover,
            zoomToBoundsOnClick: finalConfig.zoomToBoundsOnClick,
            animate: finalConfig.animate,
            animateAddingMarkers: finalConfig.animateAddingMarkers,
            iconCreateFunction: createClusterIcon,

            // Performance optimizations
            chunkedLoading: finalConfig.chunkedLoading,
            chunkProgress: finalConfig.chunkProgress,
            chunkInterval: finalConfig.chunkInterval,

            // Disable problematic features for smoother performance
            spiderfyOnMaxZoom: false, // Disable spiderfy for performance
            removeOutsideVisibleBounds: true, // Keep for memory efficiency

            // Add polygon removal for better performance
            polygonOptions: {
                fillColor: '#3388ff',
                color: '#3388ff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.1
            }
        });

        clusterGroup.value = group;
        return group;
    }

    /**
     * Convert tracks to markers and add to cluster group with performance optimizations
     */
    function addTracksToCluster(
        tracks: TrackData[],
        cluster: L.MarkerClusterGroup,
        filterFn: ((track: TrackData) => boolean) | null = null,
        strategy: 'center' | 'start' = 'center'
    ): void {
        if (!tracks || !cluster) return;

        try {
            // Clear existing markers safely
            if (cluster.getLayers && cluster.getLayers().length > 0) {
                cluster.clearLayers();
            }

            // Filter tracks if filter function provided
            const filteredTracks = filterFn ? tracks.filter(filterFn) : tracks;

            // Performance optimization: batch marker creation
            const batchSize = 50;
            const batches: TrackData[][] = [];

            for (let i = 0; i < filteredTracks.length; i += batchSize) {
                batches.push(filteredTracks.slice(i, i + batchSize));
            }

            // Process batches with requestAnimationFrame for smooth rendering
            function processBatch(batchIndex: number): void {
                if (batchIndex >= batches.length) return;

                const batch = batches[batchIndex];
                if (!batch) return;
                const markers = batch
                    .map(track => {
                        try {
                            return createTrackMarker(track, strategy);
                        } catch (error) {
                            console.warn('[useTrackClustering] Error creating marker for track:', track?.properties?.id, error);
                            return null;
                        }
                    })
                    .filter((marker): marker is L.Marker => marker !== null);

                // Add markers to cluster group safely
                if (markers.length > 0) {
                    cluster.addLayers(markers);
                }

                // Process next batch
                if (batchIndex + 1 < batches.length) {
                    requestAnimationFrame(() => processBatch(batchIndex + 1));
                }
            }

            // Start processing batches
            if (batches.length > 0) {
                processBatch(0);
            }
        } catch (error) {
            console.error('[useTrackClustering] Error in addTracksToCluster:', error);
        }
    }

    /**
     * Determine if clustering should be active based on zoom level
     */
    const shouldCluster: ComputedRef<boolean> = computed(() => {
        return isClusteringEnabled.value &&
            currentZoomLevel.value < (clusterConfig.value.disableClusteringAtZoom ?? 11);
    });

    /**
     * Update clustering configuration
     */
    function updateClusterConfig(newConfig: Partial<L.MarkerClusterGroupOptions>): void {
        clusterConfig.value = { ...clusterConfig.value, ...newConfig };
    }

    /**
     * Enable or disable clustering
     */
    function setClusteringEnabled(enabled: boolean): void {
        isClusteringEnabled.value = enabled;
    }

    /**
     * Update current zoom level
     */
    function updateZoomLevel(zoom: number): void {
        currentZoomLevel.value = zoom;
    }

    /**
     * Clean up cluster group
     */
    function cleanup(): void {
        try {
            if (clusterGroup.value) {
                // Remove all zoom animation event listeners first
                if ((clusterGroup.value as unknown as { _map?: L.Map })._map) {
                    (clusterGroup.value as unknown as { _map?: L.Map })._map?.off('zoomanim zoomend zoomstart', undefined, clusterGroup.value);
                }

                // Clear markers with proper event cleanup
                if (clusterGroup.value.getLayers && clusterGroup.value.getLayers().length > 0) {
                    const layers = clusterGroup.value.getLayers();
                    layers.forEach(layer => {
                        try {
                            // Remove zoom animation listeners from individual markers
                            if ((layer as unknown as { _map?: L.Map })._map) {
                                (layer as unknown as { _map?: L.Map })._map?.off('zoomanim', (layer as unknown as { _animateZoom?: () => void })._animateZoom, layer);
                                (layer as unknown as { _map?: L.Map | null })._map = null;
                            }
                        } catch (err) {
                            console.warn('[useTrackClustering] Error cleaning up layer:', err);
                        }
                    });
                    clusterGroup.value.clearLayers();
                }

                // Remove all event listeners from cluster group
                if (clusterGroup.value.off) {
                    clusterGroup.value.off();
                }

                clusterGroup.value = null;
            }
        } catch (error) {
            console.error('[useTrackClustering] Error in cleanup:', error);
            // Force cleanup even on error
            clusterGroup.value = null;
        }
    }

    return {
        // State
        clusterGroup,
        isClusteringEnabled,
        currentZoomLevel,
        clusterConfig,

        // Computed
        shouldCluster,

        // Methods
        initializeClusterGroup,
        addTracksToCluster,
        createTrackMarker,
        calculateTrackCenter,
        calculateTrackStart,
        updateClusterConfig,
        setClusteringEnabled,
        updateZoomLevel,
        cleanup
    };
}
