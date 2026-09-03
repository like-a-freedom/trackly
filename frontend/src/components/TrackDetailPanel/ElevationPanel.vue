<script setup>
import { computed } from 'vue';
import ElevationChart from '../ElevationChart.vue';

const props = defineProps({
    track: { type: Object, required: true },
    isOwner: { type: Boolean, default: false },
    coordinateData: { type: Array, default: () => [] },
    parsedTimeData: { type: Array, default: () => [] },
    chartMode: { type: String, default: 'elevation' },
    chartUpdateKey: { type: Number, default: 0 },
    distanceUnit: { type: String, default: 'km' },
    isPollingForElevation: { type: Boolean, default: false },
    enrichingElevation: { type: Boolean, default: false },
});

const emit = defineEmits([
    'force-enrich-elevation',
    'stop-elevation-polling',
    'chart-mode-change',
    'chart-point-hover',
    'chart-point-leave',
    'chart-point-click',
]);

const hasElevationData = computed(() =>
    props.track.elevation_profile?.length > 0 ||
    props.track.elevation_gain > 0
);

const hasHeartRateData = computed(() =>
    props.track.hr_data?.length > 0
);

const hasTemperatureData = computed(() =>
    props.track.temp_data?.length > 0
);

const hasPaceData = computed(() =>
    props.track.pace_data?.length > 0
);

const hasSlopeData = computed(() =>
    props.track.slope_segments?.length > 0
);

const hasAnyChartData = computed(() =>
    hasElevationData.value ||
    hasHeartRateData.value ||
    hasTemperatureData.value ||
    hasPaceData.value ||
    hasSlopeData.value
);

const hasElevationOrHeartRateData = computed(() =>
    hasElevationData.value ||
    hasHeartRateData.value ||
    hasTemperatureData.value ||
    hasPaceData.value ||
    hasSlopeData.value
);

const netElevation = computed(() => {
    const gain = props.track.elevation_gain || 0;
    const loss = Math.abs(props.track.elevation_loss || 0);
    const net = gain - loss;
    return net > 0 ? `+${net.toFixed(0)}` : net.toFixed(0);
});

const chartTitle = computed(() =>
    props.track.name || 'Elevation'
);

function handleChartModeChange(mode) {
    emit('chart-mode-change', mode);
}
</script>

<template>
    <!-- Elevation Stats with Chart -->
    <div v-if="hasElevationOrHeartRateData" class="stats-section">
        <div class="section-header">
            <h3>Elevation</h3>
            <div class="header-actions">
                <!-- Force Update Elevation Button -->
                <button
                    v-if="isOwner && hasElevationData"
                    class="force-update-btn"
                    :disabled="enrichingElevation"
                    title="Force update elevation data from external service"
                    @click="emit('force-enrich-elevation')"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
                    </svg>
                </button>

                <!-- Stop Polling Button (only shown when polling is active) -->
                <button
                    v-if="isPollingForElevation"
                    class="stop-polling-btn-header"
                    title="Stop automatic elevation data polling"
                    @click="emit('stop-elevation-polling')"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                </button>

                <div v-if="hasAnyChartData" class="chart-toggles">
                    <button
                        v-if="hasElevationData"
                        class="chart-toggle"
                        :class="{ active: chartMode === 'elevation' }"
                        @click="handleChartModeChange('elevation')"
                    >
                        Elevation
                    </button>
                    <button
                        v-if="hasHeartRateData"
                        class="chart-toggle"
                        :class="{ active: chartMode === 'pulse' }"
                        @click="handleChartModeChange('pulse')"
                    >
                        Heart rate
                    </button>
                    <button
                        v-if="hasTemperatureData"
                        class="chart-toggle"
                        :class="{ active: chartMode === 'temperature' }"
                        @click="handleChartModeChange('temperature')"
                    >
                        Temperature
                    </button>
                    <button
                        v-if="hasPaceData"
                        class="chart-toggle"
                        :class="{ active: chartMode === 'pace' }"
                        @click="handleChartModeChange('pace')"
                    >
                        Pace
                    </button>
                    <button
                        v-if="hasSlopeData && hasElevationData"
                        class="chart-toggle"
                        :class="{ active: chartMode === 'elevation-with-slope' }"
                        title="Elevation profile with slope gradient overlay"
                        data-testid="elevation-slope-toggle"
                        @click="handleChartModeChange('elevation-with-slope')"
                    >
                        Elevation + Slope
                    </button>
                    <button
                        v-if="(hasHeartRateData || hasTemperatureData || hasPaceData) && hasElevationData"
                        class="chart-toggle"
                        :class="{ active: chartMode === 'both' }"
                        @click="handleChartModeChange('both')"
                    >
                        Both
                    </button>
                </div>
            </div>
        </div>

        <!-- Elevation Chart -->
        <div v-if="hasAnyChartData" class="chart-section">
            <ElevationChart
                :key="`chart-${track.id}-${track.elevation_enriched_at || track.updated_at || 'default'}-${chartMode}-${chartUpdateKey}`"
                :elevation-data="track.elevation_profile"
                :heart-rate-data="track.hr_data"
                :temperature-data="track.temp_data"
                :slope-data="track.slope_segments"
                :speed-data="track.speed_data"
                :pace-data="track.pace_data"
                :coordinate-data="coordinateData"
                :time-data="parsedTimeData"
                :avg-speed="track.avg_speed"
                :moving-avg-speed="track.moving_avg_speed"
                :track-name="chartTitle"
                :total-distance="track.length_km"
                :chart-mode="chartMode"
                :distance-unit="distanceUnit"
                :elevation-stats="{
                    gain: track.elevation_gain,
                    loss: track.elevation_loss,
                    min: track.elevation_min,
                    max: track.elevation_max,
                    enriched: track.elevation_enriched,
                    dataset: track.elevation_dataset,
                }"
                @chart-point-hover="(payload) => emit('chart-point-hover', payload)"
                @chart-point-leave="(payload) => emit('chart-point-leave', payload)"
                @chart-point-click="(payload) => emit('chart-point-click', payload)"
            />
        </div>

        <!-- Elevation Statistics -->
        <div v-if="hasElevationData" class="elevation-stats">
            <div
                v-if="track.elevation_gain !== undefined && track.elevation_gain !== null"
                class="stat-item"
            >
                <span class="stat-label">Total ascent</span>
                <span class="stat-value">{{ track.elevation_gain.toFixed(0) }} m</span>
            </div>
            <div
                v-if="track.elevation_loss !== undefined && track.elevation_loss !== null"
                class="stat-item"
            >
                <span class="stat-label">Total descent</span>
                <span class="stat-value">{{ Math.abs(track.elevation_loss).toFixed(0) }} m</span>
            </div>
            <div
                v-if="track.elevation_gain !== undefined && track.elevation_gain !== null && track.elevation_loss !== undefined && track.elevation_loss !== null"
                class="stat-item"
            >
                <span class="stat-label">Net elevation</span>
                <span class="stat-value">{{ netElevation }} m</span>
            </div>
            <div
                v-if="track.elevation_min !== undefined && track.elevation_min !== null"
                class="stat-item"
            >
                <span class="stat-label">Minimum elevation</span>
                <span class="stat-value">{{ track.elevation_min.toFixed(0) }} m</span>
            </div>
            <div
                v-if="track.elevation_max !== undefined && track.elevation_max !== null"
                class="stat-item"
            >
                <span class="stat-label">Maximum elevation</span>
                <span class="stat-value">{{ track.elevation_max.toFixed(0) }} m</span>
            </div>
        </div>
    </div>
</template>
