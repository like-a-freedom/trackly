<template>
  <div>
    <h2>Track E2E Test Route</h2>
    <TrackMap
      :polylines="polylines"
      :bounds="trackBounds"
      :zoom="12"
      :center="center"
      :markerLatLng="markerLatLng"
      :autoPanOnChartHover="true"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import TrackMap from '../components/TrackMap.vue';

// Minimal fixture track with known latlngs
const track = {
  id: 'e2e-track-1',
  name: 'E2E Test Track',
  latlngs: [
    [37.7749, -122.4194], // San Francisco
    [37.7750, -122.4180],
    [37.7755, -122.4170]
  ]
};

const polylines = computed(() => [{ latlngs: track.latlngs, color: '#e74c3c', properties: { id: track.id } }]);
const markerLatLng = ref(null);
const center = ref(track.latlngs[0]);
const trackBounds = computed(() => ({
  _southWest: { lat: Math.min(...track.latlngs.map(p => p[0])), lng: Math.min(...track.latlngs.map(p => p[1])) },
  _northEast: { lat: Math.max(...track.latlngs.map(p => p[0])), lng: Math.max(...track.latlngs.map(p => p[1])) }
}));

// Expose test hooks
if (import.meta.env.MODE !== 'production') {
  // Simulate chart hover by index
  window.__e2e = window.__e2e || {};
  window.__e2e.hoverAtIndex = (index) => {
    const latlng = track.latlngs[index];
    markerLatLng.value = { latlng, segmentIndex: 0, index };
  };
  window.__e2e.setMarker = (payload) => { markerLatLng.value = payload; };
  window.__e2e.clearMarker = () => { markerLatLng.value = null; };
}
</script>
