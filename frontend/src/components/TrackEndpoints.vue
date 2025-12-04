<template>
  <!-- Combined Start/Finish marker for loop tracks -->
  <LMarker
    v-if="isLoop"
    :lat-lng="startPosition"
    @click="handleLoopClick"
    @touchstart.stop
    @touchmove.stop
  >
    <LIcon
      :icon-url="loopIconUrl"
      :icon-size="iconSize"
      :icon-anchor="iconAnchor"
      :class-name="'endpoint-marker endpoint-marker--loop'"
    />
    <LTooltip>
      <div class="track-marker-tooltip">
        <div class="track-marker-tooltip__title">Старт/Финиш</div>
        <div v-if="startTime" class="track-marker-tooltip__subtitle">
          {{ formatTime(startTime) }}
        </div>
      </div>
    </LTooltip>
  </LMarker>
  
  <!-- Start marker (non-loop) -->
  <LMarker
    v-if="!isLoop"
    :lat-lng="startPosition"
    @click="handleStartClick"
    @touchstart.stop
    @touchmove.stop
  >
    <LIcon
      :icon-url="startIconUrl"
      :icon-size="iconSize"
      :icon-anchor="iconAnchor"
      :class-name="'endpoint-marker endpoint-marker--start'"
    />
    <LTooltip>
      <div class="track-marker-tooltip">
        <div class="track-marker-tooltip__title">Старт</div>
        <div v-if="startTime" class="track-marker-tooltip__subtitle">
          {{ formatTime(startTime) }}
        </div>
      </div>
    </LTooltip>
  </LMarker>
  
  <!-- Finish marker (non-loop) -->
  <LMarker
    v-if="!isLoop"
    :lat-lng="endPosition"
    @click="handleFinishClick"
    @touchstart.stop
    @touchmove.stop
  >
    <LIcon
      :icon-url="finishIconUrl"
      :icon-size="iconSize"
      :icon-anchor="iconAnchor"
      :class-name="'endpoint-marker endpoint-marker--finish'"
    />
    <LTooltip>
      <div class="track-marker-tooltip">
        <div class="track-marker-tooltip__title">Финиш</div>
        <div v-if="endTime" class="track-marker-tooltip__subtitle">
          {{ formatTime(endTime) }}
        </div>
      </div>
    </LTooltip>
  </LMarker>
</template>

<script setup>
import { computed } from 'vue';
import { LMarker, LIcon, LTooltip } from '@vue-leaflet/vue-leaflet';

const props = defineProps({
  startPosition: {
    type: Array,
    required: true,
    validator: (val) => Array.isArray(val) && val.length === 2
  },
  endPosition: {
    type: Array,
    required: true,
    validator: (val) => Array.isArray(val) && val.length === 2
  },
  isLoop: {
    type: Boolean,
    default: false
  },
  startTime: {
    type: String,
    default: null
  },
  endTime: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['marker-click']);

// Responsive icon size
const isMobile = computed(() => window.innerWidth <= 640);
const iconSize = computed(() => isMobile.value ? [28, 28] : [32, 32]);
const iconAnchor = computed(() => {
  const size = isMobile.value ? 14 : 16;
  return [size, size];
});

// SVG Icons as data URLs - минималистичный дизайн
const startIconUrl = computed(() => {
  // Зелёный круг с треугольником "play"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="13" fill="#10B981" stroke="#fff" stroke-width="2"/>
    <polygon points="13,10 13,22 23,16" fill="#fff"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
});

const finishIconUrl = computed(() => {
  // Красный круг с квадратом "stop"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="13" fill="#EF4444" stroke="#fff" stroke-width="2"/>
    <rect x="10" y="10" width="12" height="12" rx="2" fill="#fff"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
});

const loopIconUrl = computed(() => {
  // Бирюзовый круг с символом loop (стрелка по кругу)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="13" fill="#14B8A6" stroke="#fff" stroke-width="2"/>
    <path d="M16 8 A8 8 0 1 1 8 16" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <polygon points="16,6 19,10 13,10" fill="#fff"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
});

// Format time for tooltip
function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

// Event handlers
function handleStartClick() {
  emit('marker-click', {
    type: 'start',
    position: props.startPosition
  });
}

function handleFinishClick() {
  emit('marker-click', {
    type: 'finish',
    position: props.endPosition
  });
}

function handleLoopClick() {
  emit('marker-click', {
    type: 'loop',
    position: props.startPosition
  });
}
</script>

<style scoped>
/* Import shared styles */
@import '../styles/track-overlays.css';
</style>
