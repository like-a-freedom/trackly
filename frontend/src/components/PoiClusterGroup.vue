<template>
  <!-- This component renders POI markers inside a MarkerClusterGroup for client-side clustering -->
  <!-- Present a minimal, hidden root element because Leaflet manages DOM layers externally. -->
  <div class="poi-cluster-root" aria-hidden="true" style="display:none"></div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, inject } from 'vue';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

const props = defineProps({
  pois: {
    type: Array,
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

// Inject the map from parent TrackMap component
const leafletMap = inject('leafletMap', null);

// Cluster group reference
const clusterGroup = ref(null);

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
function createClusterIcon(cluster) {
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
function getPoiLatLng(poi) {
  const geom = poi.poi?.geom || poi.geom;
  if (!geom || geom.type !== 'Point' || !geom.coordinates) {
    return null;
  }
  // GeoJSON is [lng, lat], Leaflet needs [lat, lng]
  return [geom.coordinates[1], geom.coordinates[0]];
}

// Create tooltip content for POI
function createTooltipContent(poi) {
  const name = poi.poi?.name || poi.name;
  const category = poi.poi?.category || poi.category;
  const elevation = poi.poi?.elevation || poi.elevation;
  const distance = poi.distance_from_start_m;

  let html = `<div class="poi-tooltip"><strong>${name}</strong>`;
  
  if (category) {
    html += `<br><span class="poi-category">${category}</span>`;
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
function initClusterGroup(map) {
  if (clusterGroup.value) {
    map.removeLayer(clusterGroup.value);
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

  map.addLayer(clusterGroup.value);
  updateMarkers();
}

// Update markers in cluster group
function updateMarkers() {
  if (!clusterGroup.value) return;

  clusterGroup.value.clearLayers();

  const icon = createPoiIcon();

  props.pois.forEach((poi) => {
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

    clusterGroup.value.addLayer(marker);
  });

  console.log(`[PoiClusterGroup] Added ${props.pois.length} POIs to cluster group`);
}

// Helper to get map object
function getMapObject() {
  if (!leafletMap?.value) return null;
  return leafletMap.value.mapObject || leafletMap.value.leafletObject || null;
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

// Watch for map becoming ready
watch(
  leafletMap,
  (newMap) => {
    if (newMap && !clusterGroup.value) {
      const map = getMapObject();
      if (map) {
        initClusterGroup(map);
      }
    }
  },
  { immediate: true }
);

// Setup on mount
let checkMapInterval = null;

onMounted(() => {
  // Try to get map immediately if already available
  const map = getMapObject();
  if (map && !clusterGroup.value) {
    initClusterGroup(map);
    return;
  }
  
  // Fallback: poll for map availability
  checkMapInterval = setInterval(() => {
    const map = getMapObject();
    if (map && !clusterGroup.value) {
      initClusterGroup(map);
      clearInterval(checkMapInterval);
      checkMapInterval = null;
    }
  }, 100);
  
  // Clear interval after 5s to prevent memory leaks
  setTimeout(() => {
    if (checkMapInterval) {
      clearInterval(checkMapInterval);
      checkMapInterval = null;
    }
  }, 5000);
});

// Cleanup on unmount
onUnmounted(() => {
  if (checkMapInterval) {
    clearInterval(checkMapInterval);
    checkMapInterval = null;
  }
  
  const map = getMapObject();
  if (clusterGroup.value && map) {
    map.removeLayer(clusterGroup.value);
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

.poi-cluster-small {
  background-color: rgba(255, 107, 107, 0.9);
  font-size: 10px;
}

.poi-cluster-medium {
  background-color: rgba(255, 80, 80, 0.9);
  font-size: 12px;
}

.poi-cluster-large {
  background-color: rgba(220, 53, 53, 0.9);
  font-size: 14px;
}

.poi-tooltip {
  text-align: center;
  font-size: 12px;
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
