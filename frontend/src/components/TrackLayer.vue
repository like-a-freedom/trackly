<template>
  <l-geo-json
    :geojson="track"
    :options="{
      style: {
        color: trackColor,
        weight: 4,
        opacity: 0.85
      },
      interactive: false,
      pane: 'overlayPane'
    }"
    :update-when-zooming="true"
    :update-when-idle="false"
  />
</template>

<script setup>
import { LGeoJson } from "@vue-leaflet/vue-leaflet";
import { computed } from 'vue';

const props = defineProps({
  track: {
    type: Object,
    required: true
  },
  colorIndex: {
    type: Number,
    required: true
  }
});

const colors = [
  '#1976d2',
  '#388e3c',
  '#8d6e63',
  '#6d4c41',
  '#00838f',
  '#5d4037',
  '#455a64',
  '#7b1fa2',
  '#546e7a',
];

const trackColor = computed(() => colors[props.colorIndex % colors.length]);
</script>
