<template>
  <section
    class="track-editor-chart-card"
    data-testid="track-editor-chart-card"
  >
    <TrackEditorInspectorElevation
      :elevation-profile="elevationProfile"
      :elevation-stats="elevationStats"
      :total-distance-km="totalDistanceKm"
      :coordinate-data="coordinateData"
      :elevation-loading="elevationLoading"
      :elevation-error="elevationError"
      @chart-point-hover="$emit('chart-point-hover', $event)"
      @chart-point-leave="$emit('chart-point-leave', $event)"
      @chart-point-click="$emit('chart-point-click', $event)"
    />
  </section>
</template>

<script setup>
import TrackEditorInspectorElevation from "./TrackEditorInspectorElevation.vue";

defineProps({
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  totalDistanceKm: { type: Number, default: 0 },
  coordinateData: { type: Array, default: () => [] },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
});

defineEmits(["chart-point-hover", "chart-point-leave", "chart-point-click"]);
</script>

<style scoped>
.track-editor-chart-card {
  min-width: 0;
}
</style>
