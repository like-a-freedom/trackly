<template>
  <!-- This component renders POI markers inside a MarkerClusterGroup for client-side clustering -->
  <!-- Present a minimal, hidden root element because Leaflet manages DOM layers externally. -->
  <div class="poi-cluster-root" aria-hidden="true" style="display:none"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, inject } from 'vue';
import { capitalize } from '../utils/string';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { MapAdapter, MapLayer } from '../map/MapAdapter';

interface PoiItem {
  poi?: { geom?: { type: string; coordinates: number[] }; name?: string; category?: string; elevation?: number };
  geom?: { type: string; coordinates: number[] };
  name?: string;
  category?: string;
  elevation?: number;
  distance_from_start_m?: number;
}

const props = defineProps({
  pois: {
    type: Array as () => PoiItem[],
    default: () => [],
  },
  // Disable clustering at this zoom level and above
  disableClusteringAtZoom: {
    type: Number,
    default: 15,
  },
  // Max radius of clusters in pixels
  maxClusterRadius: {
    type: Number,
    default: 30,
  },
});

const emit = defineEmits(['poi-click']);

// Inject the map adapter from parent TrackMap component.
// Falls back to legacy 'leafletMap' inject for backward compatibility.
const mapAdapter = inject<MapAdapter | null>('mapAdapter', null);
const leafletMap = inject<{ getZoom?: unknown; mapObject?: L.Map; leafletObject?: L.Map } | null>('leafletMap', null);

// Cluster group reference
const clusterGroup = ref<L.MarkerClusterGroup | null>(null);

// Create POI icon
function createPoiIcon() {
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
      <circle cx="12" cy="12" r="8" fill="#ff6b6b" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="3" fill="#fff"/>
    </svg>
  `;
  
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

// Create cluster icon with count
function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  
  // Size and color based on count
  let size, className;
  if (count < 10) {
    size = 28;
    className = 'poi-cluster-small';
  } else if (count < 50) {
    size = 36;
    className = 'poi-cluster-medium';
  } else {
    size = 44;
    className = 'poi-cluster-large';
  }

  return L.divIcon({
    html: `<div class="poi-cluster-inner">${count}</div>`,
    className: `poi-cluster ${className}`,
    iconSize: L.point(size, size),
  });
}

// Extract coordinates from POI GeoJSON geometry
function getPoiLatLng(poi: PoiItem): L.LatLngExpression | null {
  const geom = poi.poi?.geom || poi.geom;
  if (!geom || geom.type !== 'Point' || !geom.coordinates) {
    return null;
  }
  // GeoJSON is [lng, lat], Leaflet needs [lat, lng]
  return [geom.coordinates[1], geom.coordinates[0]];
}

// Create tooltip content for POI
function createTooltipContent(poi: PoiItem): string {
  const name = poi.poi?.name || poi.name;
  const category = poi.poi?.category || poi.category;
  const elevation = poi.poi?.elevation || poi.elevation;
  const distance = poi.distance_from_start_m;

  let html = `<div class="poi-tooltip"><strong>${name}</strong>`;
  
  if (category) {
    html += `<br><span class="poi-category">${capitalize(category)}</span>`;
  }
  if (elevation) {
    html += `<br><span class="poi-elevation">${Math.round(elevation)}m</span>`;
  }
  if (distance !== undefined && distance !== null) {
    const distStr = distance < 1000 
      ? `${Math.round(distance)}m` 
      : `${(distance / 1000).toFixed(1)}km`;
    html += `<br><span class="poi-distance">${distStr} from start</span>`;
  }
  
  html += '</div>';
  return html;
}

// Initialize cluster group
function initClusterGroup(map: L.Map) {
  if (clusterGroup.value) {
    if (mapAdapter) {
      mapAdapter.removeLayer(clusterGroup.value as unknown as MapLayer);
    } else {
      map.removeLayer(clusterGroup.value as unknown as L.Layer);
    }
  }

  clusterGroup.value = L.markerClusterGroup({
    disableClusteringAtZoom: props.disableClusteringAtZoom,
    maxClusterRadius: props.maxClusterRadius,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    animate: true,
    iconCreateFunction: createClusterIcon,
  });

  if (mapAdapter) {
    mapAdapter.addLayer(clusterGroup.value as unknown as MapLayer);
  } else {
    map.addLayer(clusterGroup.value as unknown as L.Layer);
  }
  updateMarkers();
}

// Update markers in cluster group
function updateMarkers() {
  if (!clusterGroup.value) return;

  clusterGroup.value.clearLayers();

  const icon = createPoiIcon();
  const group = clusterGroup.value;
  if (!group) return;

  props.pois.forEach((poi: PoiItem) => {
    const latLng = getPoiLatLng(poi);
    if (!latLng) return;

    const marker = L.marker(latLng, { icon });

    // Add tooltip
    marker.bindTooltip(createTooltipContent(poi), {
      direction: 'top',
      offset: [0, -20],
    });

    // Handle click
    marker.on('click', () => {
      emit('poi-click', poi);
    });

    group.addLayer(marker);
  });

  console.log(`[PoiClusterGroup] Added ${props.pois.length} POIs to cluster group`);
}

// Helper to get map object — prefer the adapter seam, fall back to legacy inject
function getMapObject(): L.Map | null {
  if (mapAdapter) {
    const m = mapAdapter.getMap();
    if (m) return m as L.Map;
  }
  if (!leafletMap) return null;
  // Accept either a Vue Leaflet wrapper (has .mapObject / .leafletObject) or
  // a real L.Map directly (has .getZoom). The real L.Map is the post-Stage-0.5b
  // contract; the wrapper path is preserved for backward compatibility with
  // any test or component that still injects the wrapper.
  if (typeof leafletMap.getZoom === 'function') return leafletMap as unknown as L.Map;
  return leafletMap.mapObject || leafletMap.leafletObject || null;
}

// Watch for POI changes
watch(
  () => props.pois,
  () => {
    if (clusterGroup.value) {
      updateMarkers();
    }
  },
  { deep: true }
);

// Watch for map becoming ready (handles async injection after mount).
// The onMounted block below handles the initial-value case; the watch handles
// any later updates from the parent.
watch(
  () => leafletMap,
  (newMap) => {
    if (newMap && !clusterGroup.value) {
      const map = getMapObject();
      if (map) {
        try {
          initClusterGroup(map);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[PoiClusterGroup] init failed:', e instanceof Error ? e.message : String(e));
        }
      }
    }
  }
);

// Setup on mount: the parent (TrackMap.vue) provides the resolved L.Map via
// shallowRef in the @ready handler. No polling fallback is needed.
onMounted(() => {
  const map = getMapObject();
  if (map && !clusterGroup.value) {
    initClusterGroup(map);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  if (clusterGroup.value) {
    if (mapAdapter) {
      mapAdapter.removeLayer(clusterGroup.value as unknown as MapLayer);
    } else {
      const map = getMapObject();
      if (map) {
        map.removeLayer(clusterGroup.value as unknown as L.Layer);
      }
    }
    clusterGroup.value = null;
  }
});
</script>

<style>
/* POI Cluster Styles */
.poi-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: bold;
  color: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.poi-cluster-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

/* Cluster counts are read against each other across the map, so the digits
   must be tabular — proportional figures make 8 and 11 different widths and
   the column of counts stops scanning. */
.poi-cluster-small {
  background-color: rgba(255, 107, 107, 0.9);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.poi-cluster-medium {
  background-color: rgba(255, 80, 80, 0.9);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.poi-cluster-large {
  background-color: rgba(220, 53, 53, 0.9);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.poi-tooltip {
  text-align: center;
  font-size: var(--text-xs);
}

.poi-tooltip .poi-category {
  color: #666;
  font-style: italic;
}

.poi-tooltip .poi-elevation,
.poi-tooltip .poi-distance {
  color: #888;
  font-size: 11px;
}
</style>
