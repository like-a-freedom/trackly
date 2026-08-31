<template>
  <section
    class="sidebar-section"
    data-testid="elevation-section"
  >
    <div class="section-header">
      <h3 class="section-title">
        Elevation profile
      </h3>
    </div>
    <div
      v-if="elevationLoading"
      class="elevation-status"
    >
      Loading profile...
    </div>
    <div
      v-else-if="elevationError"
      class="elevation-status error"
    >
      {{ elevationError }}
    </div>
    <ElevationChart
      v-else
      :elevation-data="elevationProfile"
      :elevation-stats="elevationStats"
      :total-distance="totalDistanceKm"
      :coordinate-data="coordinateData"
      chart-mode="elevation"
      @chart-point-hover="$emit('chart-point-hover', $event)"
      @chart-point-leave="$emit('chart-point-leave', $event)"
      @chart-point-click="$emit('chart-point-click', $event)"
    />
  </section>
</template>

<script setup>
import ElevationChart from "../ElevationChart.vue";

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
.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px;
}

.elevation-status {
  font-size: 12px;
  color: #555;
  padding: 6px 0;
}

.elevation-status.error {
  color: #c62828;
}
</style>
