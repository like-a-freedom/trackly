<template>
  <div class="virtual-track-points" ref="containerRef" @scroll="handleScroll">
    <div class="virtual-scrollbar" :style="{ height: totalHeight + 'px' }">
      <div 
        v-for="item in visibleItems" 
        :key="item.index"
        class="track-point-item"
        :style="{ transform: `translateY(${item.top}px)` }"
      >
        <div class="point-info">
          <span class="point-index">#{{ item.index + 1 }}</span>
          <div class="point-coords">
            <span class="lat">{{ item.lat?.toFixed(6) || 'N/A' }}</span>
            <span class="lon">{{ item.lon?.toFixed(6) || 'N/A' }}</span>
          </div>
          <div class="point-elevation" v-if="item.ele !== undefined && item.ele !== null">
            {{ item.ele.toFixed(1) }}m
          </div>
          <div class="point-time" v-if="item.time">
            {{ formatTime(item.time) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatDateTime } from '../utils/format';
import { useVirtualizedList } from '../composables/useVirtualizedList';

const props = defineProps({
  points: {
    type: Array,
    default: () => []
  },
  itemHeight: {
    type: Number,
    default: 80
  },
  containerHeight: {
    type: Number,
    default: 400
  }
});

// Transform points for virtualization
const virtualizedPoints = computed(() => props.points);

const {
  containerRef,
  visibleItems,
  totalHeight,
  scrollTop
} = useVirtualizedList(virtualizedPoints, props.itemHeight, props.containerHeight);

function handleScroll(event) {
  // Handled by composable
}

function formatTime(timeString) {
  if (!timeString) return '';
  // Use shared formatDateTime util to keep consistent format
  return formatDateTime(timeString);
}
</script>

<style scoped>
.virtual-track-points {
  height: 100%;
  overflow-y: auto;
  position: relative;
}

.virtual-scrollbar {
  position: relative;
  width: 100%;
}

.track-point-item {
  position: absolute;
  left: 0;
  right: 0;
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  background: #fff;
  will-change: transform;
}

.track-point-item:hover {
  background: #f8f9fa;
}

.point-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.9em;
}

.point-index {
  font-weight: 600;
  color: #666;
  min-width: 40px;
}

.point-coords {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.lat, .lon {
  font-family: monospace;
  font-size: 0.85em;
  color: #333;
}

.point-elevation {
  color: #2196f3;
  font-weight: 500;
  min-width: 50px;
  text-align: right;
}

.point-time {
  color: #666;
  font-size: 0.8em;
  min-width: 80px;
  text-align: right;
}

/* Custom scrollbar */
.virtual-track-points::-webkit-scrollbar {
  width: 6px;
}

.virtual-track-points::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.virtual-track-points::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.virtual-track-points::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}
</style>
