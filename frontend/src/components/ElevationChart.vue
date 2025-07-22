<template>
  <div class="elevation-chart-container">
    <Line v-if="chartData.datasets && chartData.datasets.length > 0" :data="chartData" :options="chartOptions" />
    <p v-else>No elevation, pulse, or temperature data available for this track.</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
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
  }
});

const hasPulse = computed(() => {
  return Array.isArray(props.heartRateData) && 
         props.heartRateData.length > 0 && 
         props.heartRateData.some(value => value !== null && value !== undefined && typeof value === 'number' && value > 0);
});

const hasTemperature = computed(() => {
  return Array.isArray(props.temperatureData) && 
         props.temperatureData.length > 0 && 
         props.temperatureData.some(value => value !== null && value !== undefined && typeof value === 'number');
});

const chartData = computed(() => {
  if ((!props.elevationData || props.elevationData.length === 0) && (!hasPulse.value) && (!hasTemperature.value)) {
    return {};
  }
  // Use totalDistance prop to generate X-axis labels in kilometers
  const pointCount = Math.max(
    props.elevationData ? props.elevationData.length : 0,
    hasPulse.value ? props.heartRateData.length : 0,
    hasTemperature.value ? props.temperatureData.length : 0
  );
  if (pointCount === 0) return {};
  const step = pointCount === 2 ? props.totalDistance : props.totalDistance / (pointCount - 1);
  const labels = Array.from({ length: pointCount }, (_, i) => (i === pointCount - 1
    ? props.totalDistance
    : i * step
  ).toFixed(2) + ' km');

  // Elevation extraction
  let elevation = [];
  if (props.elevationData && props.elevationData.length > 0) {
    if (props.elevationData.every(p => typeof p === 'number' || p === null)) {
      elevation = props.elevationData;
    } else if (props.elevationData.every(p => Array.isArray(p) && p.length === 2)) {
      elevation = props.elevationData.map(p => p[1]);
    } else if (props.elevationData.every(p => typeof p === 'object' && p !== null && 'dist' in p && 'ele' in p)) {
      elevation = props.elevationData.map(p => p.ele);
    }
  }
  // Pulse extraction
  let pulse = [];
  if (hasPulse.value) {
    if (props.heartRateData.every(p => typeof p === 'number' || p === null)) {
      pulse = props.heartRateData;
    } else if (props.heartRateData.every(p => Array.isArray(p) && p.length >= 2)) {
      pulse = props.heartRateData.map(p => p[1]);
    } else if (props.heartRateData.every(p => typeof p === 'object' && p !== null && ('hr' in p || 'pulse' in p))) {
      pulse = props.heartRateData.map(p => p.hr ?? p.pulse);
    }
  }
  // Temperature extraction
  let temperature = [];
  if (hasTemperature.value) {
    if (props.temperatureData.every(p => typeof p === 'number' || p === null)) {
      temperature = props.temperatureData;
    } else if (props.temperatureData.every(p => Array.isArray(p) && p.length >= 2)) {
      temperature = props.temperatureData.map(p => p[1]);
    } else if (props.temperatureData.every(p => typeof p === 'object' && p !== null && ('temp' in p || 'temperature' in p))) {
      temperature = props.temperatureData.map(p => p.temp ?? p.temperature);
    }
  }
  // Pad arrays to match pointCount
  if (elevation.length < pointCount) elevation = [...elevation, ...Array(pointCount - elevation.length).fill(null)];
  if (pulse.length < pointCount) pulse = [...pulse, ...Array(pointCount - pulse.length).fill(null)];
  if (temperature.length < pointCount) temperature = [...temperature, ...Array(pointCount - temperature.length).fill(null)];

  const datasets = [];
  if (props.chartMode === 'elevation' || props.chartMode === 'both') {
    datasets.push({
      label: 'Elevation (m)',
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 0,
      data: elevation,
      yAxisID: 'y-elevation',
    });
  }
  if ((props.chartMode === 'pulse' || props.chartMode === 'both') && hasPulse.value) {
    datasets.push({
      label: 'Pulse (bpm)',
      backgroundColor: 'rgba(255, 99, 132, 0.13)',
      borderColor: 'rgba(255, 99, 132, 1)',
      borderWidth: 2,
      tension: 0.3,
      fill: false,
      pointRadius: 0,
      data: pulse,
      yAxisID: 'y-pulse',
    });
  }
  if ((props.chartMode === 'temperature' || props.chartMode === 'both') && hasTemperature.value) {
    datasets.push({
      label: 'Temperature (°C)',
      backgroundColor: 'rgba(255, 165, 0, 0.13)',
      borderColor: 'rgba(255, 165, 0, 1)',
      borderWidth: 2,
      tension: 0.3,
      fill: false,
      pointRadius: 0,
      data: temperature,
      yAxisID: 'y-temperature',
    });
  }
  return { labels, datasets };
});

const chartOptions = computed(() => {
  const showElevation = props.chartMode === 'elevation' || props.chartMode === 'both';
  const showPulse = (props.chartMode === 'pulse' || props.chartMode === 'both') && hasPulse.value;
  const showTemperature = (props.chartMode === 'temperature' || props.chartMode === 'both') && hasTemperature.value;
  return {
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
          text: 'Distance (km)'
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
});

watch(() => props.trackName, (newName) => {
  if (chartOptions.value.plugins.title) {
    chartOptions.value.plugins.title.text = newName;
  }
});
</script>

<style scoped>
.elevation-chart-container {
  height: 250px;
  position: relative;
}
</style>
