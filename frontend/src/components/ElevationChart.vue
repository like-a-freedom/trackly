<template>
  <div class="elevation-chart-container" tabindex="0" ref="chartContainer" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" @keydown="onKeyDown">
    <Line v-if="chartData.datasets && chartData.datasets.length > 0" 
          :key="`chart-${props.chartMode}`"
          :data="chartData" 
          :options="chartOptions" />
    <div v-else-if="elevationStats.gain !== undefined || elevationStats.loss !== undefined" class="elevation-stats-display">
      <div class="stat-item">
        <span class="stat-label">Elevation Gain</span>
        <span class="stat-value">{{ (elevationStats.gain || 0).toFixed(0) }} m</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Elevation Loss</span>
        <span class="stat-value">{{ Math.abs(elevationStats.loss || 0).toFixed(0) }} m</span>
      </div>
      <div class="stat-item" v-if="elevationStats.min !== undefined">
        <span class="stat-label">Min Elevation</span>
        <span class="stat-value">{{ elevationStats.min.toFixed(0) }} m</span>
      </div>
      <div class="stat-item" v-if="elevationStats.max !== undefined">
        <span class="stat-label">Max Elevation</span>
        <span class="stat-value">{{ elevationStats.max.toFixed(0) }} m</span>
      </div>
      <div class="stat-item" v-if="elevationStats.dataset">
        <span class="stat-label">Data Source</span>
        <span class="stat-value">{{ formatDataset(elevationStats.dataset) }}</span>
      </div>
    </div>
    <p v-else>No elevation, pulse, or temperature data available for this track.</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, shallowRef, onUnmounted, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Filler
} from 'chart.js';
import { useMemoizedComputed } from '../composables/useMemoization';
import { getSlopeColor, getSlopeCategory } from '../utils/slopeColors.js';

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Filler
);

const props = defineProps({
  elevationData: {
    type: Array,
    default: () => []
  },
  heartRateData: {
    type: Array,
    default: undefined // Optional
  },
  temperatureData: {
    type: Array,
    default: undefined // Optional
  },
  slopeData: {
    type: Array,
    default: () => []
  },
  trackName: {
    type: String,
    default: 'Elevation Profile'
  },
  totalDistance: {
    type: Number,
    required: true
  },
  chartMode: {
    type: String,
    default: 'elevation'
  },
  elevationStats: {
    type: Object,
    default: () => ({})
  },
  distanceUnit: {
    type: String,
    default: 'km'
  },
  timeData: {
    type: Array,
    default: () => []
  },
  speedData: {
    type: Array,
    default: () => []
  },
  paceData: {
    type: Array,
    default: () => []
  },
  coordinateData: {
    type: Array,
    default: () => []
  },
  avgSpeed: {
    type: Number,
    default: undefined
  },
  movingAvgSpeed: {
    type: Number,
    default: undefined
  }
});

// Define emits for chart interaction
const emit = defineEmits(['chart-point-hover', 'chart-point-leave', 'chart-point-click']);

// Router for detecting route changes
const router = useRouter();

// State for hover/click interactions
const isChartPointFixed = ref(false);
const lastEmittedPoint = ref(null);
let hoverRafId = null;

// Determine if we should use reduced FPS for performance
const shouldReduceFPS = computed(() => {
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const trackLength = props.coordinateData?.length || 0;
  return hardwareConcurrency < 4 || trackLength > 5000 || !window.requestAnimationFrame;
});

// Utility function to emit chart-point-hover with RAF throttling
function emitChartPointHover(payload) {
  // Skip if point is fixed
  if (isChartPointFixed.value) return;
  
  // Skip if same point (avoid duplicate emissions)
  const payloadKey = `${payload.index}_${payload.distanceKm}`;
  if (lastEmittedPoint.value === payloadKey) return;
  lastEmittedPoint.value = payloadKey;
  
  // Use RAF for throttling in production, immediate in test mode
  if (import.meta.env.MODE === 'test') {
    emit('chart-point-hover', payload);
    return;
  }
  
  // Cancel previous RAF if exists
  if (hoverRafId) {
    cancelAnimationFrame(hoverRafId);
  }
  
  // Use RAF or fallback throttle based on performance criteria
  if (window.requestAnimationFrame && !shouldReduceFPS.value) {
    hoverRafId = requestAnimationFrame(() => {
      emit('chart-point-hover', payload);
      hoverRafId = null;
    });
  } else {
    // Reduced FPS mode - throttle to 33ms (~30 FPS)
    setTimeout(() => {
      emit('chart-point-hover', payload);
      hoverRafId = null;
    }, 33);
  }
}

// Helpers for touch/keyboard support
const chartContainer = ref(null);
const lastTouchInfo = ref({ time: 0, x: 0, y: 0, moved: false });
const lastTouchedIndex = ref(null);
const activeKeyboardIndex = ref(null);

function parseDistanceLabel(label) {
  const distanceMatch = String(label).match(/([\d.]+)\s*(km|mi)/);
  return distanceMatch ? parseFloat(distanceMatch[1]) : 0;
}

function buildPayloadForIndex(index, isFixed = false) {
  const labels = chartData.value.labels || [];
  const datasets = chartData.value.datasets || [];
  const pointIndex = Math.max(0, Math.min(index, labels.length - 1));
  const xLabel = labels[pointIndex] || '0 km';
  const distanceKm = parseDistanceLabel(xLabel);

  // Elevation from elevation dataset
  let elevation = null;
  let slope = null;
  datasets.forEach(ds => {
    if (ds.yAxisID === 'y-elevation' && ds.data && ds.data[pointIndex] !== undefined) {
      const raw = ds.data[pointIndex];
      elevation = (raw && raw.y !== undefined) ? raw.y : raw;
      if (raw && raw.slope !== undefined) slope = raw.slope;
    }
  });

  // Map chart index to underlying coordinate/time arrays proportionally when lengths differ
  const totalDistanceKm = props.totalDistance || 0;
  const mapToDataIndex = (length) => {
    if (!length || length <= 0) return null;
    if (labels.length <= 1) return 0;

    const ratio = pointIndex / (labels.length - 1);
    const distanceRatio = totalDistanceKm > 0 ? Math.min(1, Math.max(0, distanceKm / totalDistanceKm)) : null;

    // Snap aggressively to the final coordinate when hovering near the right edge
    if (ratio >= 0.97 || (distanceRatio !== null && distanceRatio >= 0.97)) {
      return length - 1;
    }

    const baseRatio = distanceRatio !== null ? Math.max(ratio, distanceRatio) : ratio;
    return Math.min(length - 1, Math.max(0, Math.round(baseRatio * (length - 1))));
  };

  const coordinateIndex = mapToDataIndex(props.coordinateData?.length || 0);
  const timeIndex = mapToDataIndex(props.timeData?.length || 0);

  let latlng = null;
  let time = null;
  if (coordinateIndex !== null && props.coordinateData && props.coordinateData[coordinateIndex]) {
    latlng = props.coordinateData[coordinateIndex];
  }
  if (timeIndex !== null && props.timeData && props.timeData[timeIndex]) {
    time = props.timeData[timeIndex];
  }

  const payload = {
    index: pointIndex,
    coordinateIndex,
    distanceKm,
    elevation,
    latlng,
    isFixed: isFixed
  };
  if (slope !== null) payload.slope = slope;
  if (time !== null) payload.time = time;
  return payload;
}

function getIndexFromClientX(clientX) {
  if (!chartContainer.value) return 0;
  const rect = chartContainer.value.getBoundingClientRect ? chartContainer.value.getBoundingClientRect() : { left: 0, width: 0 };
  const labels = chartData.value.labels || [];
  const width = rect.width || 1;
  const x = clientX - (rect.left || 0);
  const ratio = Math.max(0, Math.min(1, x / width));
  const idx = Math.round(ratio * ((labels.length || 1) - 1));
  return idx;
}

function processTouchPoint(clientX, clientY) {
  const idx = getIndexFromClientX(clientX);
  lastTouchedIndex.value = idx;
  const payload = buildPayloadForIndex(idx, false);
  emitChartPointHover(payload);
}

function onTouchStart(event) {
  try {
    const t = (event.touches && event.touches[0]) || event;
    lastTouchInfo.value = { time: Date.now(), x: t.clientX || 0, y: t.clientY || 0, moved: false };
    processTouchPoint(t.clientX || 0, t.clientY || 0);
  } catch (e) {
    console.warn('[ElevationChart] touchstart error', e);
  }
}

function onTouchMove(event) {
  try {
    const t = (event.touches && event.touches[0]) || event;
    const dx = Math.abs(t.clientX - lastTouchInfo.value.x);
    const dy = Math.abs(t.clientY - lastTouchInfo.value.y);
    if (dx > 5 || dy > 5) lastTouchInfo.value.moved = true;
    processTouchPoint(t.clientX || 0, t.clientY || 0);
  } catch (e) {
    console.warn('[ElevationChart] touchmove error', e);
  }
}

function onTouchEnd(event) {
  try {
    const duration = Date.now() - lastTouchInfo.value.time;
    // Treat as tap if short and not moved
    if (!lastTouchInfo.value.moved && duration < 300 && lastTouchedIndex.value !== null) {
      // Toggle fixed state
      isChartPointFixed.value = !isChartPointFixed.value;
      const payload = buildPayloadForIndex(lastTouchedIndex.value, isChartPointFixed.value);
      emit('chart-point-click', payload);
    } else {
      emitChartPointLeave(false);
    }
  } catch (e) {
    console.warn('[ElevationChart] touchend error', e);
  }
}

function onKeyDown(event) {
  try {
    const labels = chartData.value.labels || [];
    if (!labels || labels.length === 0) return;

    if (event.key === 'ArrowRight') {
      if (activeKeyboardIndex.value === null) {
        activeKeyboardIndex.value = 0;
      } else {
        activeKeyboardIndex.value = Math.min((labels.length - 1), (activeKeyboardIndex.value + 1));
      }
      const payload = buildPayloadForIndex(activeKeyboardIndex.value, false);
      emitChartPointHover(payload);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      if (activeKeyboardIndex.value === null) {
        activeKeyboardIndex.value = labels.length - 1;
      } else {
        activeKeyboardIndex.value = Math.max(0, (activeKeyboardIndex.value - 1));
      }
      const payload = buildPayloadForIndex(activeKeyboardIndex.value, false);
      emitChartPointHover(payload);
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      // Toggle fixed on Enter/Space
      if (activeKeyboardIndex.value === null) activeKeyboardIndex.value = 0;
      isChartPointFixed.value = !isChartPointFixed.value;
      const payload = buildPayloadForIndex(activeKeyboardIndex.value, isChartPointFixed.value);
      emit('chart-point-click', payload);
      event.preventDefault();
    }
  } catch (e) {
    console.warn('[ElevationChart] keydown handler error', e);
  }
}

// Utility function to emit chart-point-leave
function emitChartPointLeave(clearFixed = false) {
  // Clear last emitted point tracking
  lastEmittedPoint.value = null;
  
  // Cancel any pending RAF
  if (hoverRafId) {
    cancelAnimationFrame(hoverRafId);
    hoverRafId = null;
  }
  
  // If clearing fixed state, reset it
  if (clearFixed) {
    isChartPointFixed.value = false;
  }
  
  emit('chart-point-leave', { clearFixed });
}

// Utility function to clean up tooltip
function cleanupTooltip() {
  const tooltipEl = document.getElementById('elevation-chart-tooltip');
  if (tooltipEl) {
    tooltipEl.style.opacity = '0';
    tooltipEl.style.transform = 'translateY(-10px)';
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.pointerEvents = 'none';
    // Remove after animation
    setTimeout(() => {
      if (tooltipEl && tooltipEl.parentNode) {
        tooltipEl.remove();
      }
    }, 200);
  }
}

const hasPace = useMemoizedComputed(
  (speedData, paceData, avgSpeed, movingAvgSpeed) => {
    console.log('[ElevationChart] Checking pace data:', {
      paceData: paceData ? (Array.isArray(paceData) ? paceData.length : 'non-array') : 'missing',
      speedData: speedData ? (Array.isArray(speedData) ? speedData.length : 'non-array') : 'missing',
      avgSpeed,
      movingAvgSpeed
    });
    
    // Check if we have backend-calculated pace data
    if (Array.isArray(paceData) && paceData.length > 0) {
      const hasValidPace = paceData.some(value => value !== null && value !== undefined && typeof value === 'number' && value > 0);
      if (hasValidPace) {
        console.log('[ElevationChart] Found backend-calculated pace data');
        return true;
      }
    }
    
    // Check if we have speed data that we can convert to pace
    if (Array.isArray(speedData) && speedData.length > 0) {
      const hasValidSpeed = speedData.some(value => value !== null && value !== undefined && typeof value === 'number' && value > 0);
      if (hasValidSpeed) {
        console.log('[ElevationChart] Found speed data for pace conversion');
        return true;
      }
    }
    
    // Check if we have aggregate speed data for fallback pace estimation
    if ((avgSpeed && avgSpeed > 0) || (movingAvgSpeed && movingAvgSpeed > 0)) {
      console.log('[ElevationChart] Found aggregate speed data for pace estimation');
      return true;
    }
    
    console.log('[ElevationChart] No suitable pace data found');
    return false;
  },
  [() => props.speedData, () => props.paceData, () => props.avgSpeed, () => props.movingAvgSpeed],
  {
    keyFn: (deps) => {
      const [speedData, paceData, avgSpeed, movingAvgSpeed] = deps;
      const speedHash = speedData ? `${speedData.length}_${JSON.stringify(speedData.slice(0, 2))}` : 'null';
      const paceHash = paceData ? `${paceData.length}_${JSON.stringify(paceData.slice(0, 2))}` : 'null';
      return `pace_${speedHash}_${paceHash}_${avgSpeed}_${movingAvgSpeed}`;
    }
  }
);

const hasPulse = useMemoizedComputed(
  (heartRateData) => {
    if (!Array.isArray(heartRateData) || heartRateData.length === 0) return false;
    
    // Check for numbers
    if (heartRateData.some(value => value !== null && value !== undefined && typeof value === 'number' && value > 0)) {
      return true;
    }
    
    // Check for coordinate pairs [x, y]
    if (heartRateData.every(p => Array.isArray(p) && p.length >= 2)) {
      return heartRateData.some(p => typeof p[1] === 'number' && p[1] > 0);
    }
    
    // Check for objects with hr or pulse property
    if (heartRateData.every(p => typeof p === 'object' && p !== null && ('hr' in p || 'pulse' in p))) {
      return heartRateData.some(p => {
        const value = p.hr ?? p.pulse;
        return typeof value === 'number' && value > 0;
      });
    }
    
    return false;
  },
  [() => props.heartRateData],
  {
    keyFn: (deps) => {
      const data = deps[0];
      if (!data) return 'pulse_null';
      const dataHash = `${data.length}_${JSON.stringify(data.slice(0, 2))}_${JSON.stringify(data.slice(-2))}`;
      return `pulse_${dataHash}`;
    }
  }
);

const hasTemperature = useMemoizedComputed(
  (temperatureData) => {
    if (!Array.isArray(temperatureData) || temperatureData.length === 0) return false;
    
    // Check for numbers
    if (temperatureData.some(value => value !== null && value !== undefined && typeof value === 'number')) {
      return true;
    }
    
    // Check for coordinate pairs [x, y]
    if (temperatureData.every(p => Array.isArray(p) && p.length >= 2)) {
      return temperatureData.some(p => typeof p[1] === 'number');
    }
    
    // Check for objects with temp or temperature property
    if (temperatureData.every(p => typeof p === 'object' && p !== null && ('temp' in p || 'temperature' in p))) {
      return temperatureData.some(p => {
        const value = p.temp ?? p.temperature;
        return typeof value === 'number';
      });
    }
    
    return false;
  },
  [() => props.temperatureData],
  {
    keyFn: (deps) => {
      const data = deps[0];
      if (!data) return 'temp_null';
      const dataHash = `${data.length}_${JSON.stringify(data.slice(0, 2))}_${JSON.stringify(data.slice(-2))}`;
      return `temp_${dataHash}`;
    }
  }
);

const chartData = useMemoizedComputed(
  (elevationData, heartRateData, temperatureData, slopeData, speedData, paceData, coordinateData, timeData, avgSpeed, movingAvgSpeed, hasPulseValue, hasTemperatureValue, hasPaceValue, totalDistance, chartMode, elevationStats, distanceUnit) => {
    if ((!elevationData || elevationData.length === 0) && (!hasPulseValue) && (!hasTemperatureValue) && (!hasPaceValue) && (!elevationStats.gain && !elevationStats.loss)) {
      return {};
    }
    
    // Elevation extraction (optimized with memoization)
    let elevation = [];
    let elevationPointCount = 0;
    if (elevationData && elevationData.length > 0) {
      if (elevationData.every(p => typeof p === 'number' || p === null)) {
        elevation = elevationData;
      } else if (elevationData.every(p => Array.isArray(p) && p.length === 2)) {
        elevation = elevationData.map(p => p[1]);
      } else if (elevationData.every(p => typeof p === 'object' && p !== null && 'dist' in p && 'ele' in p)) {
        elevation = elevationData.map(p => p.ele);
      }
      elevationPointCount = elevation.length;
    } else if ((elevationStats.gain || elevationStats.loss) && (hasPulseValue || hasTemperatureValue)) {
      // Generate synthetic elevation data from stats ONLY when we have other data for chart
      // Use the same point count as the most detailed data available, or default to reasonable count
      elevationPointCount = Math.max(
        hasPulseValue ? heartRateData.length : 0,
        hasTemperatureValue ? temperatureData.length : 0,
        50 // minimum reasonable number of points for smooth synthetic curve
      );
      
      const baseElevation = elevationStats.min || 0;
      const totalGain = elevationStats.gain || 0;
      const totalLoss = Math.abs(elevationStats.loss || 0);
      
      // Simple linear interpolation from min to max
      const maxElevation = baseElevation + totalGain;
      elevation = Array.from({ length: elevationPointCount }, (_, i) => {
        const progress = i / (elevationPointCount - 1);
        return baseElevation + (maxElevation - baseElevation) * progress;
      });
    }
    
    // Pulse extraction
    let pulse = [];
    let pulsePointCount = 0;
    if (hasPulseValue) {
      if (heartRateData.every(p => typeof p === 'number' || p === null)) {
        pulse = heartRateData;
      } else if (heartRateData.every(p => Array.isArray(p) && p.length >= 2)) {
        pulse = heartRateData.map(p => p[1]);
      } else if (heartRateData.every(p => typeof p === 'object' && p !== null && ('hr' in p || 'pulse' in p))) {
        pulse = heartRateData.map(p => p.hr ?? p.pulse);
      }
      pulsePointCount = pulse.length;
    }
    
    // Slope extraction - only process if needed for elevation-with-slope mode
    let slope = [];
    let slopePointCount = 0;
    
    if (chartMode === 'elevation-with-slope' && slopeData && slopeData.length > 0) {
      if (slopeData.every(p => typeof p === 'number' || p === null)) {
        slope = slopeData;
      } else if (slopeData.every(p => Array.isArray(p) && p.length === 2)) {
        slope = slopeData.map(p => p[1]);
      } else if (slopeData.every(p => typeof p === 'object' && p !== null && 'dist' in p && 'slope' in p)) {
        slope = slopeData.map(p => p.slope);
      } else if (slopeData.every(p => typeof p === 'object' && p !== null && 'distance_m' in p && 'slope_percent' in p)) {
        // Handle slope_segments format from our API
        slope = slopeData.map(p => p.slope_percent);
      }
      
      // Apply adaptive granularity for slope data to prevent overly detailed charts
      // Cap slope points at a reasonable maximum for readability
      const MAX_SLOPE_POINTS = 300; // Golden mean between detail and readability
      if (slope.length > MAX_SLOPE_POINTS) {
        // Downsample slope data using averaging to preserve overall trends
        const downsampledSlope = [];
        const factor = slope.length / MAX_SLOPE_POINTS;
        
        for (let i = 0; i < MAX_SLOPE_POINTS; i++) {
          const startIdx = Math.floor(i * factor);
          const endIdx = Math.min(Math.floor((i + 1) * factor), slope.length);
          
          // Average the slope values in this segment
          let sum = 0;
          let count = 0;
          for (let j = startIdx; j < endIdx; j++) {
            if (slope[j] !== null && slope[j] !== undefined) {
              sum += slope[j];
              count++;
            }
          }
          
          downsampledSlope.push(count > 0 ? sum / count : null);
        }
        
        slope = downsampledSlope;
      }
      
      slopePointCount = slope.length;
    }
    
    // Temperature extraction
    let temperature = [];
    let temperaturePointCount = 0;
    if (hasTemperatureValue) {
      if (temperatureData.every(p => typeof p === 'number' || p === null)) {
        temperature = temperatureData;
      } else if (temperatureData.every(p => Array.isArray(p) && p.length >= 2)) {
        temperature = temperatureData.map(p => p[1]);
      } else if (temperatureData.every(p => typeof p === 'object' && p !== null && ('temp' in p || 'temperature' in p))) {
        temperature = temperatureData.map(p => p.temp ?? p.temperature);
      }
      temperaturePointCount = temperature.length;
    }
    
    // Pace extraction - simplified to use backend-calculated data
    let pace = [];
    let pacePointCount = 0;
    if (hasPaceValue) {
      // Try to use backend-calculated pace data first
      if (paceData && paceData.length > 0) {
        if (paceData.every(p => typeof p === 'number' || p === null)) {
          pace = paceData.slice(); // Use backend-calculated pace directly
          pacePointCount = pace.length;
          console.log('[ElevationChart] Using backend-calculated pace data:', pacePointCount, 'points');
        }
      }
      // Fallback: convert speed data to pace if no backend pace data
      else if (speedData && speedData.length > 0) {
        if (speedData.every(p => typeof p === 'number' || p === null)) {
          // Convert speed (km/h) to pace (min/km)
          pace = speedData.map(speed => {
            if (speed === null || speed === undefined || speed <= 0) return null;
            return 60 / speed; // min/km
          });
          pacePointCount = pace.length;
          console.log('[ElevationChart] Converted speed data to pace:', pacePointCount, 'points');
        }
      }
      // Last resort: use aggregate speed data to generate synthetic pace line
      else if ((props.avgSpeed && props.avgSpeed > 0) || (props.movingAvgSpeed && props.movingAvgSpeed > 0)) {
        console.log('[ElevationChart] Using aggregate speed for synthetic pace line');
        
        // Use the better speed metric available
        const useSpeed = props.movingAvgSpeed || props.avgSpeed;
        const basePace = 60 / useSpeed; // min/km
        
        // Generate pace data with the same granularity as other datasets
        const targetPoints = Math.max(
          elevationPointCount,
          pulsePointCount,
          temperaturePointCount,
          50 // minimum reasonable number of points
        );
        
        // Create a synthetic pace line with slight variation to make it more realistic
        pace = Array.from({ length: targetPoints }, (_, i) => {
          // Add small random variation (±10%) to make the pace line more realistic
          const variation = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1
          return basePace * variation;
        });
        
        pacePointCount = pace.length;
        console.log('[ElevationChart] Generated synthetic pace data:', { basePace, points: pacePointCount });
      }
    }
    
    // Use the maximum point count for labels, but exclude slope from driving the granularity
    // since slope now has its own adaptive granularity control
    let targetPointCount = Math.max(
      elevationPointCount,
      pulsePointCount,
      temperaturePointCount,
      pacePointCount,
      2 // minimum for stats display
    );
    
    // In elevation-with-slope mode, use slope's controlled granularity as the target
    if (chartMode === 'elevation-with-slope' && slopePointCount > 0) {
      targetPointCount = slopePointCount;
    }
    
    if (targetPointCount === 0) return {};

    // Convert distance to appropriate unit
    const distanceInTargetUnit = distanceUnit === 'mi' ? totalDistance * 0.621371 : totalDistance;
    const unitLabel = distanceUnit === 'mi' ? ' mi' : ' km';

    const step = targetPointCount === 2 ? distanceInTargetUnit : distanceInTargetUnit / (targetPointCount - 1);
    const labels = Array.from({ length: targetPointCount }, (_, i) => ((i === targetPointCount - 1
      ? distanceInTargetUnit
      : i * step) || 0
    ).toFixed(2) + unitLabel);

    // Interpolate data arrays to match label count for consistent X-axis
    const interpolateToLabelCount = (dataArray, targetCount) => {
      if (!dataArray || dataArray.length === 0) return Array(targetCount).fill(null);
      if (dataArray.length === targetCount) return dataArray;
      
      const result = [];
      for (let i = 0; i < targetCount; i++) {
        const sourceIndex = (i / (targetCount - 1)) * (dataArray.length - 1);
        const lowerIndex = Math.floor(sourceIndex);
        const upperIndex = Math.ceil(sourceIndex);
        
        if (lowerIndex === upperIndex || dataArray[lowerIndex] === null || dataArray[upperIndex] === null) {
          result.push(dataArray[lowerIndex]);
        } else {
          // Linear interpolation
          const fraction = sourceIndex - lowerIndex;
          const interpolated = dataArray[lowerIndex] + (dataArray[upperIndex] - dataArray[lowerIndex]) * fraction;
          result.push(interpolated);
        }
      }
      return result;
    };
    
    // Interpolate all data to match label count
    const interpolatedElevation = interpolateToLabelCount(elevation, targetPointCount);
    const interpolatedPulse = interpolateToLabelCount(pulse, targetPointCount);
    const interpolatedTemperature = interpolateToLabelCount(temperature, targetPointCount);
    const interpolatedPace = interpolateToLabelCount(pace, targetPointCount);
    // For slope data, use it directly since it already has controlled granularity
    const interpolatedSlope = chartMode === 'elevation-with-slope' && slope.length > 0 ? slope : [];

    // Function for slope-based segment coloring (similar to gpx.studio)
    // Only define this if we're in elevation-with-slope mode and have slope data
    const slopeFillCallback = chartMode === 'elevation-with-slope' && slopePointCount > 0 ? 
      (context) => {
        // Get slope data for this segment
        const pointIndex = context.p0DataIndex;
        const slopeValue = interpolatedSlope[pointIndex];
        return getSlopeColor(slopeValue);
      } : 
      null;

    // Debug logging for data dimensions (only in development)
    if (import.meta.env.DEV) {
      console.log(`[ElevationChart] Mode: ${chartMode}, Slope processing:`, {
        elevationPoints: elevationPointCount,
        slopePoints: slopePointCount,
        willProcessSlope: chartMode === 'elevation-with-slope' && slopePointCount > 0,
        hasSlopeFillCallback: !!slopeFillCallback,
        exactChartMode: JSON.stringify(chartMode),
        isElevationWithSlope: chartMode === 'elevation-with-slope',
        isElevation: chartMode === 'elevation',
        datasetCount: 0 // will be updated below
      });
    }    const datasets = [];
    
    if (chartMode === 'elevation' || chartMode === 'both' || chartMode === 'elevation-with-slope') {
      if (elevationPointCount > 0) {
        // Create a completely new dataset object for each mode to ensure Chart.js updates
        let elevationDataset;
        
        if (chartMode === 'elevation-with-slope' && slopePointCount > 0 && slopeFillCallback) {
          // Elevation + Slope mode
          elevationDataset = {
            label: 'Elevation (m)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            yAxisID: 'y-elevation',
            data: interpolatedElevation.map((elev, index) => ({
              x: labels[index],
              y: elev,
              slope: interpolatedSlope[index] || 0, // Include slope data for tooltips
              slopeCategory: getSlopeCategory(interpolatedSlope[index] || 0)
            })),
            segment: {
              backgroundColor: slopeFillCallback,
              // Keep solid border color for the line on top
              borderColor: 'rgba(75, 192, 192, 1)',
            }
          };
        } else {
          // Regular elevation mode
          elevationDataset = {
            label: 'Elevation (m)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            yAxisID: 'y-elevation',
            data: interpolatedElevation.map((elev, index) => ({
              x: labels[index],
              y: elev
            }))
            // No segment property for regular mode
          };
        }
        
        datasets.push(elevationDataset);
      }
      // Note: elevation stats are shown in template only when no chart data exists
    }
    if ((chartMode === 'pulse' || chartMode === 'both') && hasPulseValue) {
      datasets.push({
        label: 'Pulse (bpm)',
        backgroundColor: 'rgba(255, 99, 132, 0.13)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        data: interpolatedPulse,
        yAxisID: 'y-pulse',
      });
    }
    if ((chartMode === 'temperature' || chartMode === 'both') && hasTemperatureValue) {
      datasets.push({
        label: 'Temperature (°C)',
        backgroundColor: 'rgba(255, 165, 0, 0.13)',
        borderColor: 'rgba(255, 165, 0, 1)',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        data: interpolatedTemperature,
        yAxisID: 'y-temperature',
      });
    }
    if ((chartMode === 'pace' || chartMode === 'both') && hasPaceValue) {
      datasets.push({
        label: 'Pace (min/km)',
        backgroundColor: 'rgba(156, 39, 176, 0.13)',
        borderColor: 'rgba(156, 39, 176, 1)',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        data: interpolatedPace,
        yAxisID: 'y-pace',
      });
    }
    
    // Update debug info with final dataset count
    if (import.meta.env.DEV && datasets.length > 0) {
      console.log(`[ElevationChart] Final datasets:`, {
        count: datasets.length,
        elevationDataset: datasets.find(d => d.yAxisID === 'y-elevation'),
        chartMode: chartMode
      });
    }
    
    return { labels, datasets };
  },
  [
    () => props.elevationData,
    () => props.heartRateData,
    () => props.temperatureData,
    () => props.slopeData,
    () => props.speedData,
    () => props.paceData,
    () => props.coordinateData,
    () => props.timeData,
    () => props.avgSpeed,
    () => props.movingAvgSpeed,
    () => hasPulse.value,
    () => hasTemperature.value,
    () => hasPace.value,
    () => props.totalDistance,
    () => props.chartMode,
    () => props.elevationStats,
    () => props.distanceUnit
  ],
  {
    keyFn: (deps) => {
      const [elevData, hrData, tempData, slopeData, speedData, paceData, coordData, timeData, avgSpeed, movingAvgSpeed, hasPulseVal, hasTempVal, hasPaceVal, totalDist, mode, elevStats, distUnit] = deps;
      
      // Create more precise hash for elevation data
      const elevHash = elevData ? `${elevData.length}_${JSON.stringify(elevData.slice(0, 3))}_${JSON.stringify(elevData.slice(-3))}` : 'null';
      const hrHash = hrData ? `${hrData.length}_${JSON.stringify(hrData.slice(0, 3))}` : 'null';
      const tempHash = tempData ? `${tempData.length}_${JSON.stringify(tempData.slice(0, 3))}` : 'null';
      const slopeHash = slopeData ? `${slopeData.length}_${JSON.stringify(slopeData.slice(0, 3))}` : 'null';
      const speedHash = speedData ? `${speedData.length}_${JSON.stringify(speedData.slice(0, 3))}` : 'null';
      const paceHash = paceData ? `${paceData.length}_${JSON.stringify(paceData.slice(0, 3))}` : 'null';
      const coordHash = coordData ? `${coordData.length}_${JSON.stringify(coordData.slice(0, 3))}` : 'null';
      const timeHash = timeData ? `${timeData.length}_${JSON.stringify(timeData.slice(0, 3))}` : 'null';
      const statsHash = elevStats ? `${elevStats.gain}_${elevStats.loss}_${elevStats.dataset}_${elevStats.enriched}_${elevStats.enriched_at}_${elevStats._lastUpdated || '0'}` : 'null';
      
      return `chartdata_${elevHash}_${hrHash}_${tempHash}_${slopeHash}_${speedHash}_${paceHash}_${coordHash}_${timeHash}_${avgSpeed}_${movingAvgSpeed}_${hasPulseVal}_${hasTempVal}_${hasPaceVal}_${totalDist}_${mode}_${statsHash}_${distUnit}`;
    }
  }
);

// Use shallowRef for chart options to avoid deep reactivity
const chartOptions = shallowRef({});

// Update chart options when dependencies change
watch([
  () => props.chartMode,
  () => hasPulse.value,
  () => hasTemperature.value,
  () => hasPace.value,
  () => props.slopeData,
  () => props.trackName,
  () => props.distanceUnit,
  () => props.timeData
], () => {
  const showElevation = props.chartMode === 'elevation' || props.chartMode === 'both' || props.chartMode === 'elevation-with-slope';
  const showPulse = (props.chartMode === 'pulse' || props.chartMode === 'both') && hasPulse.value;
  const showTemperature = (props.chartMode === 'temperature' || props.chartMode === 'both') && hasTemperature.value;
  const showPace = (props.chartMode === 'pace' || props.chartMode === 'both') && hasPace.value;
  
  const distanceLabel = props.distanceUnit === 'mi' ? 'Distance (mi)' : 'Distance (km)';
  
  // Custom external tooltip function with access to Vue context
  const externalTooltipHandler = function(context) {
    // Use custom HTML tooltip instead of default Canvas tooltip
    let tooltipEl = document.getElementById('elevation-chart-tooltip');
    
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'elevation-chart-tooltip';
      tooltipEl.className = 'elevation-tooltip';
      document.body.appendChild(tooltipEl);
    }
    
    const tooltipModel = context.tooltip;
    
    if (tooltipModel.opacity === 0) {
      tooltipEl.style.opacity = '0';
      tooltipEl.style.transform = 'translateY(-5px)';
      tooltipEl.style.pointerEvents = 'none';
      // Hide tooltip after fade out animation and ensure complete cleanup
      setTimeout(() => {
        if (tooltipEl && tooltipEl.style.opacity === '0') {
          tooltipEl.style.visibility = 'hidden';
        }
      }, 200);
      
      // Emit chart-point-leave when tooltip is hidden
      emitChartPointLeave(false);
      return;
    }
    
    // Build tooltip content
    if (tooltipModel.body) {
      const titleLines = tooltipModel.title || [];
      const bodyLines = tooltipModel.body.map(b => b.lines);
      const dataPoints = tooltipModel.dataPoints || [];
      
      let innerHtml = '<div class="tooltip-header">';
      
      // Prepare payload for chart-point-hover event
      let hoverPayload = null;
      
      // Distance information
      if (dataPoints.length > 0) {
        const xValue = dataPoints[0].label;
        innerHtml += `<div class="tooltip-distance">📍 ${xValue}</div>`;
        
        const pointIndex = dataPoints[0].dataIndex;
        hoverPayload = buildPayloadForIndex(pointIndex, isChartPointFixed.value);
        
        // Emit hover event with RAF throttling
        emitChartPointHover(hoverPayload);
        
        // Add time information if available (prefer mapped time from payload)
        if (hoverPayload && hoverPayload.time !== undefined && hoverPayload.time !== null) {
          const timeFormatted = formatTime(hoverPayload.time);
          innerHtml += `<div class="tooltip-time">⏱️ ${timeFormatted}</div>`;
        }
      }
      
      innerHtml += '</div><div class="tooltip-body">';
      
      // Process each data point
      dataPoints.forEach((dataPoint, index) => {
        const dataset = dataPoint.dataset;
        const rawData = dataPoint.raw;
        const value = dataPoint.parsed.y;
        
        if (dataset.yAxisID === 'y-elevation') {
          innerHtml += `<div class="tooltip-row elevation">`;
          innerHtml += `<span class="tooltip-icon">⛰️</span>`;
          innerHtml += `<span class="tooltip-label">Elevation:</span>`;
          innerHtml += `<span class="tooltip-value">${value.toFixed(0)} m</span>`;
          innerHtml += `</div>`;
          
          // Add slope information if available
          if (rawData && typeof rawData === 'object' && rawData.slope !== undefined && props.chartMode === 'elevation-with-slope') {
            const slopeValue = rawData.slope;
            const slopeCategory = rawData.slopeCategory || getSlopeCategory(slopeValue);
            const slopeColor = getSlopeColor(slopeValue);
            
            innerHtml += `<div class="tooltip-row slope">`;
            innerHtml += `<span class="tooltip-icon">📐</span>`;
            innerHtml += `<span class="tooltip-label">Slope:</span>`;
            innerHtml += `<span class="tooltip-value slope-value" style="color: ${slopeColor}">${slopeValue.toFixed(1)}%</span>`;
            innerHtml += `</div>`;
            innerHtml += `<div class="tooltip-slope-category" style="background: linear-gradient(90deg, ${slopeColor}15 0%, ${slopeColor}08 100%); border-left: 3px solid ${slopeColor}; color: ${slopeColor};">`;
            innerHtml += `${slopeCategory}`;
            innerHtml += `</div>`;
          }
        } else if (dataset.yAxisID === 'y-pulse') {
          innerHtml += `<div class="tooltip-row pulse">`;
          innerHtml += `<span class="tooltip-icon">💗</span>`;
          innerHtml += `<span class="tooltip-label">Heart Rate:</span>`;
          innerHtml += `<span class="tooltip-value">${value.toFixed(0)} bpm</span>`;
          innerHtml += `</div>`;
        } else if (dataset.yAxisID === 'y-temperature') {
          innerHtml += `<div class="tooltip-row temperature">`;
          innerHtml += `<span class="tooltip-icon">🌡️</span>`;
          innerHtml += `<span class="tooltip-label">Temperature:</span>`;
          innerHtml += `<span class="tooltip-value">${value.toFixed(1)} °C</span>`;
          innerHtml += `</div>`;
        } else if (dataset.yAxisID === 'y-pace') {
          innerHtml += `<div class="tooltip-row pace">`;
          innerHtml += `<span class="tooltip-icon">⏱️</span>`;
          innerHtml += `<span class="tooltip-label">Pace:</span>`;
          const minutes = Math.floor(value);
          const seconds = Math.round((value - minutes) * 60);
          innerHtml += `<span class="tooltip-value">${minutes}:${seconds.toString().padStart(2, '0')} min/km</span>`;
          innerHtml += `</div>`;
        }
      });
      
      innerHtml += '</div>';
      tooltipEl.innerHTML = innerHtml;
    }
    
    // Position tooltip
    const position = context.chart.canvas.getBoundingClientRect();
    
    // Show and animate tooltip
    tooltipEl.style.visibility = 'visible';
    tooltipEl.style.opacity = '1';
    tooltipEl.style.transform = 'translateY(0)';
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
    tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.zIndex = '9999';
    
    // Adjust position if tooltip would go off screen
    const tooltipRect = tooltipEl.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX - tooltipRect.width - 10 + 'px';
    }
    if (tooltipRect.bottom > window.innerHeight) {
      tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY - tooltipRect.height - 10 + 'px';
    }
  };
  
  chartOptions.value = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    onClick: (event, elements, chart) => {
      // Handle click on chart to toggle fixed state
      if (elements.length > 0) {
        const element = elements[0];
        const pointIndex = element.index;
        const willBeFixed = !isChartPointFixed.value;
        isChartPointFixed.value = willBeFixed;
        
        const clickPayload = buildPayloadForIndex(pointIndex, willBeFixed);
        if (clickPayload) {
          emit('chart-point-click', clickPayload);
        }
      }
    },
    onHover: (event, elements) => {
      // Change cursor to crosshair when hovering over chart
      event.native.target.style.cursor = elements.length > 0 ? 'crosshair' : 'default';
    },
    plugins: {
      legend: {
        display: true
      },
      title: {
        display: true,
        text: props.trackName
      },
      tooltip: {
        enabled: false, // Disable default tooltip completely
        external: externalTooltipHandler
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: distanceLabel
        }
      },
      ...(showElevation ? {
        'y-elevation': {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Elevation (m)'
          },
          beginAtZero: false
        }
      } : {}),
      ...(showPulse ? {
        'y-pulse': {
          type: 'linear',
          display: true,
          position: showElevation ? 'right' : 'left',
          title: {
            display: true,
            text: 'Pulse (bpm)'
          },
          beginAtZero: false,
          grid: {
            drawOnChartArea: !showElevation // only draw grid if not dual axis
          }
        }
      } : {}),
      ...(showTemperature ? {
        'y-temperature': {
          type: 'linear',
          display: true,
          position: (showElevation || showPulse) ? 'right' : 'left',
          title: {
            display: true,
            text: 'Temperature (°C)'
          },
          beginAtZero: false,
          grid: {
            drawOnChartArea: !(showElevation || showPulse) // only draw grid if not dual axis
          }
        }
      } : {}),
      ...(showPace ? {
        'y-pace': {
          type: 'linear',
          display: true,
          position: (showElevation || showPulse || showTemperature) ? 'right' : 'left',
          title: {
            display: true,
            text: 'Pace (min/km)'
          },
          beginAtZero: false,
          reverse: true, // Lower pace (faster) should be at the top
          grid: {
            drawOnChartArea: !(showElevation || showPulse || showTemperature) // only draw grid if not dual axis
          }
        }
      } : {})
    }
  };
}, { immediate: true });

// Additional watch to force chart update on mode changes
watch(() => props.chartMode, (newMode, oldMode) => {
  console.log('Chart mode change:', oldMode, '->', newMode);
  // Clean up tooltip when chart mode changes
  cleanupTooltip();
}, { immediate: false });

// Watch for elevation data changes to force chart update
watch(() => [
  props.elevationData?.length,
  props.elevationStats?.enriched,
  props.elevationStats?.dataset,
  props.elevationStats?._lastUpdated,
  props.slopeData?.length
], (newVals, oldVals) => {
  if (newVals && oldVals && JSON.stringify(newVals) !== JSON.stringify(oldVals)) {
    console.log('[ElevationChart] Data updated, forcing chart refresh');
    // Force reactive update by accessing the computed property
    const _ = chartData.value;
  }
}, { immediate: false, deep: false });

function formatDataset(dataset) {
  if (!dataset) return 'Unknown';
  
  // Handle common dataset names
  const datasetNames = {
    'original_gpx': 'Original GPX',
    'original': 'Original',
    'aster30m': 'ASTER 30m',
    'srtm30m': 'SRTM 30m',
    'srtm90m': 'SRTM 90m',
    'mapzen': 'Mapzen',
    'eudem25m': 'EU-DEM 25m',
    'ned10m': 'NED 10m',
    'open-elevation': 'Open-Elevation'
  };
  
  return datasetNames[dataset] || dataset.charAt(0).toUpperCase() + dataset.slice(1);
}

import { formatDateTime } from '../utils/format';

function formatTime(timeValue) {
  if (!timeValue && timeValue !== 0) return 'Unknown';
  
  // Handle different time formats
  if (typeof timeValue === 'string') {
    // ISO string or similar
    return formatDateTime(timeValue);
  } else if (typeof timeValue === 'number') {
    // Unix timestamp or elapsed seconds
    if (timeValue > 1000000000) {
      // Looks like Unix timestamp
      return formatDateTime(timeValue);
    } else {
      // Elapsed seconds from start
      const hours = Math.floor(timeValue / 3600);
      const minutes = Math.floor((timeValue % 3600) / 60);
      const seconds = Math.floor(timeValue % 60);
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  } else if (timeValue instanceof Date) {
    return formatDateTime(timeValue);
  }
  
  return 'Unknown';
}

// ESC key handler to hide tooltip and clear fixed point
function handleEscapeKey(event) {
  if (event.key === 'Escape' || event.keyCode === 27) {
    cleanupTooltip();
    // Emit leave event with clearFixed to reset fixed state
    emitChartPointLeave(true);
  }
}

// Route change handler to clean tooltip
function handleRouteChange() {
  cleanupTooltip();
  // Also clear any chart interaction state
  emitChartPointLeave(true);
}

// Setup event listeners
onMounted(() => {
  // Listen for ESC key globally
  document.addEventListener('keydown', handleEscapeKey);
  
  // Listen for route changes
  router.afterEach(handleRouteChange);
});

onBeforeUnmount(() => {
  // Remove event listeners
  document.removeEventListener('keydown', handleEscapeKey);
  
  // Clean up tooltip before unmounting
  cleanupTooltip();
  
  // Cancel any pending RAF
  if (hoverRafId) {
    cancelAnimationFrame(hoverRafId);
    hoverRafId = null;
  }
});

// Cleanup custom tooltip on component unmount
onUnmounted(() => {
  cleanupTooltip();
  
  // Cancel any pending RAF
  if (hoverRafId) {
    cancelAnimationFrame(hoverRafId);
    hoverRafId = null;
  }
});

// Expose debug helper for deterministic unit testing (non-production only)
if (import.meta.env.MODE !== 'production') {
  try {
    defineExpose({ __debugBuildPayloadForIndex: buildPayloadForIndex });
  } catch (e) {
    // no-op if defineExpose is unavailable in the test environment
  }
}
</script>

<style scoped>
.elevation-chart-container {
  height: 250px;
  position: relative;
}

.elevation-stats-display {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 16px 0;
}

.stat-item {
  background: #fff;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.stat-label {
  font-size: 0.85em;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 1.1em;
  font-weight: 600;
  color: #1a1a1a;
}
</style>

<style>
/* Global styles for custom tooltip */
.elevation-tooltip {
  background: #ffffff;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  min-width: 180px;
  max-width: 260px;
  transition: all 0.15s ease;
  transform: translateY(-5px);
  opacity: 0;
  visibility: hidden;
  z-index: 10000;
  pointer-events: none;
}

.tooltip-header {
  background: #f8f9fa;
  border-bottom: none;
  padding: 8px 12px;
  border-radius: 6px 6px 0 0;
  font-weight: 500;
}

.tooltip-distance {
  font-weight: 500;
  color: #1a1a1a;
  font-size: 12px;
}

.tooltip-time {
  font-weight: 400;
  color: #666;
  font-size: 11px;
  margin-top: 2px;
}

.tooltip-body {
  padding: 8px 12px;
}

.tooltip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  min-height: 24px;
  border-radius: 4px;
  transition: all 0.1s ease;
  position: relative;
  margin-bottom: 6px;
}

.tooltip-row:last-of-type {
  margin-bottom: 0;
}

.tooltip-row:hover {
  background: rgba(0, 0, 0, 0.02);
}

.tooltip-row.elevation {
  border-left: 2px solid rgba(75, 192, 192, 1);
  padding-left: 8px;
  margin-left: -2px;
}

.tooltip-row.pulse {
  border-left: 2px solid rgba(255, 99, 132, 1);
  padding-left: 8px;
  margin-left: -2px;
}

.tooltip-row.temperature {
  border-left: 2px solid rgba(255, 165, 0, 1);
  padding-left: 8px;
  margin-left: -2px;
}

.tooltip-row.pace {
  border-left: 2px solid rgba(156, 39, 176, 1);
  padding-left: 8px;
  margin-left: -2px;
}

.tooltip-row.slope {
  border-left: 2px solid rgba(54, 162, 235, 1);
  padding-left: 8px;
  margin-left: -2px;
}

.tooltip-icon {
  font-size: 14px;
  width: 16px;
  text-align: center;
}

.tooltip-label {
  font-weight: 400;
  color: #666;
  flex: 1;
  font-size: 11px;
}

.tooltip-value {
  font-weight: 500;
  color: #1a1a1a;
  text-align: right;
  font-size: 11px;
  transition: color 0.1s ease;
}

.tooltip-value.slope-value {
  font-weight: 600;
}

.tooltip-slope-category {
  margin-top: 2px;
  margin-bottom: 0;
  margin-left: -2px;
  margin-right: 0;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  color: #1a1a1a;
  transition: all 0.15s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  width: calc(100% + 2px);
}
</style>
