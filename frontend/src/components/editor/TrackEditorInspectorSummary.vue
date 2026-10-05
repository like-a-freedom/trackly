<template>
  <section
    class="sidebar-section summary-section"
    data-testid="track-summary"
  >
    <div class="summary-row">
      <span>Distance</span>
      <strong>{{ distanceDisplay }}</strong>
    </div>
    <div class="summary-row">
      <span>Time (estimate)</span>
      <strong>{{ timeDisplay }}</strong>
    </div>
    <div class="summary-row">
      <span>Points</span>
      <strong>{{ totalPoints }}</strong>
    </div>
    <div class="summary-row">
      <span>Segments</span>
      <strong>{{ segmentCount }}</strong>
    </div>
    <div
      v-if="poiCount > 0"
      class="summary-row"
    >
      <span>POI</span>
      <strong>{{ poiCount }}</strong>
    </div>
    <div class="summary-row">
      <span>Loop</span>
      <button
        class="btn-secondary btn-sm ui-secondary"
        data-testid="loop-btn"
        title="Connect last point to first (straight)"
        @click="$emit('closeLoop')"
      >
        Close loop
      </button>
    </div>
    <div class="summary-row">
      <span />
      <button
        class="btn-secondary btn-sm ui-secondary"
        data-testid="loop-same-way-btn"
        title="Return the same way (duplicate in reverse)"
        @click="$emit('closeLoopSameWay')"
      >
        Same way back
      </button>
    </div>
    <div class="summary-row">
      <span />
      <button
        class="btn-secondary btn-sm ui-secondary"
        data-testid="loop-different-route-btn"
        title="Return via different route (auto-route)"
        @click="$emit('closeLoopDifferentRoute')"
      >
        Different route
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  totalDistanceKm: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  segmentCount: { type: Number, default: 0 },
  poiCount: { type: Number, default: 0 },
});

defineEmits(["closeLoop", "closeLoopSameWay", "closeLoopDifferentRoute"]);

const distanceDisplay = computed(() => {
  if (props.totalDistanceKm < 1) {
    return `${Math.round(props.totalDistanceKm * 1000)} m`;
  }

  return `${props.totalDistanceKm.toFixed(2)} km`;
});

const timeDisplay = computed(() => {
  const mins = props.estimatedTimeMinutes;
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = Math.floor(mins / 60);
  const rest = Math.round(mins % 60);
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
});
</script>

<style scoped>
.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.summary-section {
  background: #fafafa;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  color: var(--color-muted);
}

.summary-row strong {
  color: var(--color-ink);
}

.btn-sm {
  padding: 4px 10px;
}
</style>
