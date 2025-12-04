<template>
  <!-- This component manages Leaflet polyline decorator programmatically -->
  <!-- No visible DOM elements needed - uses Leaflet's layer system -->
  <div class="track-direction-layer" style="display: none;"></div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, inject, computed } from 'vue';
import { getArrowRepeatInterval } from '../utils/trackGeometry.js';

const props = defineProps({
  latlngs: {
    type: Array,
    required: true,
    default: () => []
  },
  color: {
    type: String,
    default: '#3498db'
  },
  zoom: {
    type: Number,
    required: true
  }
});

// Try to get map instance from parent
const leafletMap = inject('leafletMap', null);

// Store decorator reference for cleanup
const decorator = ref(null);
const polyline = ref(null);

// Compute arrow interval based on zoom
const arrowInterval = computed(() => getArrowRepeatInterval(props.zoom));

// Check if we should show arrows
const shouldShow = computed(() => arrowInterval.value > 0 && props.latlngs.length >= 2);

// Create or update the decorator
async function updateDecorator() {
  // Clean up existing decorator
  removeDecorator();
  
  if (!shouldShow.value) {
    return;
  }

  // Get the map instance
  let map = null;
  if (leafletMap?.value) {
    map = leafletMap.value.leafletObject || leafletMap.value.mapObject;
  }
  
  if (!map) {
    // Try to find map from parent component
    // This is a fallback if inject doesn't work
    console.warn('[TrackDirectionLayer] Map instance not available via inject');
    return;
  }

  try {
    // Dynamically import leaflet and polyline decorator
    const L = await import('leaflet');
    
    // Try to import polyline decorator, fallback gracefully if not available
    let PolylineDecorator;
    try {
      await import('leaflet-polylinedecorator');
      PolylineDecorator = L.default?.polylineDecorator || L.polylineDecorator;
    } catch (e) {
      console.warn('[TrackDirectionLayer] leaflet-polylinedecorator not available, using fallback');
      // Use fallback arrow implementation
      createFallbackArrows(map, L.default || L);
      return;
    }

    if (!PolylineDecorator) {
      console.warn('[TrackDirectionLayer] PolylineDecorator not found');
      createFallbackArrows(map, L.default || L);
      return;
    }

    // Create polyline (invisible, just for decoration)
    const LeafletLib = L.default || L;
    polyline.value = LeafletLib.polyline(props.latlngs, {
      opacity: 0,
      weight: 0
    });

    // Create decorator with directional chevrons
    // Small white arrow heads pointing in direction of movement
    decorator.value = PolylineDecorator(polyline.value, {
      patterns: [
        {
          offset: 30,
          repeat: arrowInterval.value,
          symbol: LeafletLib.Symbol?.arrowHead({
            pixelSize: 8,
            headAngle: 50,
            polygon: false,
            pathOptions: {
              color: '#ffffff',
              weight: 2.5,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round'
            }
          }) || createArrowSymbol(LeafletLib)
        }
      ]
    }).addTo(map);

  } catch (error) {
    console.error('[TrackDirectionLayer] Error creating decorator:', error);
  }
}

// Fallback arrow implementation using simple markers
function createFallbackArrows(map, L) {
  if (!map || !props.latlngs || props.latlngs.length < 2) return;
  
  // Calculate chevron positions along the track
  const totalPoints = props.latlngs.length;
  const chevronCount = Math.min(Math.floor(totalPoints / 8), 80);
  
  if (chevronCount < 1) return;
  
  const step = Math.floor(totalPoints / chevronCount);
  const chevronGroup = L.layerGroup();
  
  for (let i = step; i < totalPoints - 1; i += step) {
    const current = props.latlngs[i];
    const next = props.latlngs[Math.min(i + 1, totalPoints - 1)];
    
    // Calculate bearing (direction of movement)
    const bearing = calculateBearing(current, next);
    
    // Create chevron marker
    const chevronIcon = L.divIcon({
      className: 'direction-chevron',
      html: createArrowSvg(bearing),
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
    
    const marker = L.marker(current, { icon: chevronIcon, interactive: false });
    chevronGroup.addLayer(marker);
  }
  
  chevronGroup.addTo(map);
  decorator.value = chevronGroup;
}

// Calculate bearing between two points
function calculateBearing(start, end) {
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;
  
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

// Create chevron SVG - white chevron pointing in direction of movement
function createArrowSvg(rotation) {
  // Chevron points right (>), then rotated by bearing
  // rotation is the bearing in degrees (0 = north, 90 = east)
  // SVG starts pointing UP, so we need to adjust
  const adjustedRotation = rotation + 90; // Make it point right first
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" style="transform: rotate(${adjustedRotation}deg); transform-origin: center;">
    <polyline points="3,2 7,5 3,8" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Create arrow symbol for polyline decorator
function createArrowSymbol(L) {
  // Fallback if L.Symbol is not available
  return {
    buildSymbol: function(dirPoint, latLngs, map, index, total) {
      return L.marker(dirPoint.latLng, {
        icon: L.divIcon({
          className: 'direction-chevron',
          html: createArrowSvg(dirPoint.heading),
          iconSize: [10, 10],
          iconAnchor: [5, 5]
        }),
        interactive: false
      });
    }
  };
}

// Remove decorator from map safely
function removeDecorator() {
  if (decorator.value) {
    try {
      // Check if decorator has a valid remove method and map reference
      if (typeof decorator.value.remove === 'function') {
        // For layerGroup, use removeFrom if available
        if (typeof decorator.value.removeFrom === 'function') {
          const map = leafletMap?.value?.leafletObject || leafletMap?.value?.mapObject;
          if (map) {
            decorator.value.removeFrom(map);
          }
        } else {
          decorator.value.remove();
        }
      }
    } catch (e) {
      // Silently ignore cleanup errors - expected when navigating away
      console.debug('[TrackDirectionLayer] Cleanup decorator:', e.message);
    }
    decorator.value = null;
  }
  if (polyline.value) {
    try {
      if (typeof polyline.value.remove === 'function') {
        polyline.value.remove();
      }
    } catch (e) {
      // Silently ignore cleanup errors
      console.debug('[TrackDirectionLayer] Cleanup polyline:', e.message);
    }
    polyline.value = null;
  }
}

// Watch for changes and update decorator
watch(
  () => [props.latlngs, props.zoom, props.color],
  () => {
    updateDecorator();
  },
  { deep: true }
);

// Setup and cleanup
onMounted(() => {
  // Delay to ensure map is ready
  setTimeout(() => {
    updateDecorator();
  }, 100);
});

onUnmounted(() => {
  removeDecorator();
});
</script>

<style>
/* Direction arrow styles */
.direction-arrow {
  z-index: 450 !important;
  pointer-events: none;
}

.direction-arrow svg {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}
</style>
