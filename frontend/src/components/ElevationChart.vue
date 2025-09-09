<template>
  <div class="elevation-chart-container">
    <Line v-if="chartData.datasets && chartData.datasets.length > 0" :data="chartData" :options="chartOptions" />
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
import { ref, computed, watch, shallowRef } from 'vue';
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
  }
});

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
    keyFn: (deps) => `pulse_${deps[0]?.length}_${JSON.stringify(deps[0]?.slice(0, 5))}`
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
    keyFn: (deps) => `temp_${deps[0]?.length}_${JSON.stringify(deps[0]?.slice(0, 5))}`
  }
);

const chartData = useMemoizedComputed(
  (elevationData, heartRateData, temperatureData, hasPulseValue, hasTemperatureValue, totalDistance, chartMode, elevationStats, distanceUnit) => {
    if ((!elevationData || elevationData.length === 0) && (!hasPulseValue) && (!hasTemperatureValue) && (!elevationStats.gain && !elevationStats.loss)) {
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
    
    // Use the maximum point count for labels, but keep original data arrays
    const maxPointCount = Math.max(
      elevationPointCount,
      pulsePointCount,
      temperaturePointCount,
      2 // minimum for stats display
    );
    
    // Debug logging for data dimensions
    console.log(`[ElevationChart] Data dimensions:`, {
      elevationPoints: elevationPointCount,
      pulsePoints: pulsePointCount,
      temperaturePoints: temperaturePointCount,
      maxPointCount,
      chartMode,
      hasElevationData: elevationPointCount > 0,
      hasPulseValue,
      hasTemperatureValue
    });
    
    if (maxPointCount === 0) return {};
    
    // Convert distance to appropriate unit
    const distanceInTargetUnit = distanceUnit === 'mi' ? totalDistance * 0.621371 : totalDistance;
    const unitLabel = distanceUnit === 'mi' ? ' mi' : ' km';
    
    const step = maxPointCount === 2 ? distanceInTargetUnit : distanceInTargetUnit / (maxPointCount - 1);
    const labels = Array.from({ length: maxPointCount }, (_, i) => ((i === maxPointCount - 1
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
    const interpolatedElevation = interpolateToLabelCount(elevation, maxPointCount);
    const interpolatedPulse = interpolateToLabelCount(pulse, maxPointCount);
    const interpolatedTemperature = interpolateToLabelCount(temperature, maxPointCount);

    const datasets = [];
    if (chartMode === 'elevation' || chartMode === 'both') {
      if (elevationPointCount > 0) {
        datasets.push({
          label: 'Elevation (m)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          data: interpolatedElevation,
          yAxisID: 'y-elevation',
        });
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
    return { labels, datasets };
  },
  [
    () => props.elevationData,
    () => props.heartRateData,
    () => props.temperatureData,
    () => hasPulse.value,
    () => hasTemperature.value,
    () => props.totalDistance,
    () => props.chartMode,
    () => props.elevationStats,
    () => props.distanceUnit
  ],
  {
    keyFn: (deps) => {
      const [elevData, hrData, tempData, hasPulseVal, hasTempVal, totalDist, mode, elevStats, distUnit] = deps;
      return `chartdata_${elevData?.length || 0}_${hrData?.length || 0}_${tempData?.length || 0}_${hasPulseVal}_${hasTempVal}_${totalDist}_${mode}_${JSON.stringify(elevStats)}_${distUnit}`;
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
  () => props.trackName,
  () => props.distanceUnit
], () => {
  const showElevation = props.chartMode === 'elevation' || props.chartMode === 'both';
  const showPulse = (props.chartMode === 'pulse' || props.chartMode === 'both') && hasPulse.value;
  const showTemperature = (props.chartMode === 'temperature' || props.chartMode === 'both') && hasTemperature.value;
  
  const distanceLabel = props.distanceUnit === 'mi' ? 'Distance (mi)' : 'Distance (km)';
  
  chartOptions.value = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true
      },
      title: {
        display: true,
        text: props.trackName
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) {
              if (context.dataset.yAxisID === 'y-elevation') {
                label += context.parsed.y.toFixed(0) + ' m';
              } else if (context.dataset.yAxisID === 'y-pulse') {
                label += context.parsed.y.toFixed(0) + ' bpm';
              } else if (context.dataset.yAxisID === 'y-temperature') {
                label += context.parsed.y.toFixed(1) + ' °C';
              }
            }
            return label;
          }
        }
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
      } : {})
    }
  };
}, { immediate: true });

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
