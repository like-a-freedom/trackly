<template>
  <section
    class="sidebar-section"
    data-testid="optimizer-section"
  >
    <div class="section-header">
      <h3 class="section-title">
        Track optimizer
      </h3>
    </div>
    <p class="optimizer-meta">
      Keep {{ optimizerPercent }}% of points
    </p>
    <input
      type="range"
      aria-label="Optimization target ratio"
      min="1"
      max="100"
      step="1"
      class="optimizer-range"
      :value="optimizerPercent"
      :disabled="totalPoints < 2"
      @input="handleOptimizerRatioInput"
    >
    <div
      v-if="optimizerStats"
      class="optimizer-stats"
    >
      <span>
        Points: {{ optimizerStats.originalPoints }} →
        {{ optimizerStats.simplifiedPoints }}
      </span>
      <span>
        {{ Math.round((optimizerStats.compressionRatio || 0) * 100) }}%
      </span>
      <span>
        Tolerance: {{ optimizerStats.toleranceUsed?.toFixed(1) || 0 }} m
      </span>
    </div>
    <div
      v-if="optimizerLoading"
      class="optimizer-status"
    >
      Building preview...
    </div>
    <div
      v-else-if="optimizerError"
      class="optimizer-status error"
    >
      {{ optimizerError }}
    </div>
    <div class="optimizer-actions">
      <button
        class="btn-secondary btn-sm"
        :disabled="optimizerLoading || totalPoints < 2"
        data-testid="optimizer-preview-btn"
        @click="$emit('previewOptimization')"
      >
        Preview
      </button>
      <button
        class="btn-secondary btn-sm"
        :disabled="!hasOptimizerPreview"
        data-testid="optimizer-apply-btn"
        @click="$emit('applyOptimization')"
      >
        Apply
      </button>
      <button
        class="btn-secondary btn-sm"
        :disabled="!hasOptimizerPreview"
        data-testid="optimizer-clear-btn"
        @click="$emit('clearOptimization')"
      >
        Cancel
      </button>
      <button
        class="btn-secondary btn-sm"
        :disabled="!hasOptimizerPreview"
        data-testid="optimizer-download-btn"
        @click="$emit('downloadOptimization')"
      >
        Download GeoJSON
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  optimizerTargetRatio: { type: Number, default: 0.1 },
  optimizerPreview: { type: Object, default: null },
  optimizerStats: { type: Object, default: null },
  optimizerLoading: { type: Boolean, default: false },
  optimizerError: { type: String, default: null },
  totalPoints: { type: Number, default: 0 },
});

const emit = defineEmits([
  "update:optimizerTargetRatio",
  "previewOptimization",
  "applyOptimization",
  "clearOptimization",
  "downloadOptimization",
]);

const optimizerPercent = computed(() => {
  const ratio = props.optimizerTargetRatio ?? 0.1;
  return Math.round(ratio * 100);
});

const hasOptimizerPreview = computed(() => {
  return !!(props.optimizerPreview && props.optimizerPreview.segments?.length);
});

function handleOptimizerRatioInput(event) {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) return;
  emit("update:optimizerTargetRatio", value / 100);
}
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

.optimizer-meta {
  font-size: 12px;
  color: #555;
  margin: 4px 0 8px;
}

.optimizer-range {
  width: 100%;
  margin-bottom: 8px;
}

.optimizer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.optimizer-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #555;
  margin: 6px 0;
}

.optimizer-status {
  font-size: 12px;
  color: #555;
}

.optimizer-status.error {
  color: #c62828;
}

.btn-secondary {
  background: #eee;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-sm {
  padding: 4px 10px;
}
</style>
