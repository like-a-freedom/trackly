<template>
  <div class="slope-legend" v-if="show">
    <div class="legend-title">Slope Gradient</div>
    <div class="legend-items">
      <div 
        v-for="range in slopeRanges" 
        :key="range.label"
        class="legend-item"
      >
        <div 
          class="legend-color" 
          :style="{ backgroundColor: range.color }"
        ></div>
        <span class="legend-label">{{ formatRange(range) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { getSlopeRanges } from '../utils/slopeColors.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
});

const slopeRanges = computed(() => getSlopeRanges());

function formatRange(range) {
  if (range.min === -Infinity) {
    return `< ${range.max}%`;
  } else if (range.max === Infinity) {
    return `> ${range.min}%`;
  } else if (range.min === range.max) {
    return `${range.min}%`;
  } else {
    return `${range.min}% to ${range.max}%`;
  }
}
</script>

<style scoped>
.slope-legend {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
  font-size: 0.85em;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.legend-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: #1a1a1a;
  font-size: 1em;
}

.legend-items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.legend-label {
  font-size: 0.8em;
  color: #495057;
  white-space: nowrap;
  font-weight: 500;
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .legend-items {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 6px;
  }
  
  .legend-item {
    padding: 4px 6px;
    gap: 6px;
  }
  
  .legend-color {
    width: 14px;
    height: 14px;
  }
  
  .legend-label {
    font-size: 0.75em;
  }
}
</style>
