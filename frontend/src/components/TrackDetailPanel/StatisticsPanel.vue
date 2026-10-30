<script setup lang="ts">
import { computed } from 'vue';
import { hasMetric } from '../../domain/metricAvailability';
import { formatDuration } from '../../utils/format';

const props = defineProps({
    track: { type: Object, required: true },
    isOwner: { type: Boolean, default: false },
    speedUnit: { type: String, default: 'kmh' },
    formattedDistance: { type: String, default: '' },
    formattedDuration: { type: String, default: '' },
    formattedMovingAvgSpeed: { type: String, default: '' },
    formattedMovingAvgPace: { type: String, default: '' },
});

const emit = defineEmits(['speed-unit-change']);

const hasSpeedData = computed(() =>
    ['moving_avg_speed', 'moving_avg_pace', 'moving_time', 'pause_time', 'avg_hr', 'hr_min', 'hr_max']
        .some(key => hasMetric(props.track[key]))
);
const hasDuration = computed(() => !!props.formattedDuration && props.formattedDuration !== 'N/A');

function handleSpeedUnitChange(unit: string) {
    emit('speed-unit-change', unit);
}

</script>

<template>
    <!-- Basic Track Info -->
    <div class="stats-section">
        <div class="section-header">
            <h3>Basic info</h3>
            <div class="header-actions">
                <div class="unit-toggles" role="group" aria-label="Distance unit">
                    <button
                        class="unit-toggle"
                        :class="{ active: speedUnit === 'kmh' }"
                        type="button"
                        :aria-pressed="speedUnit === 'kmh'"
                        @click="handleSpeedUnitChange('kmh')"
                    >
                        km
                    </button>
                    <button
                        class="unit-toggle"
                        :class="{ active: speedUnit === 'mph' }"
                        type="button"
                        :aria-pressed="speedUnit === 'mph'"
                        @click="handleSpeedUnitChange('mph')"
                    >
                        miles
                    </button>
                </div>
            </div>
        </div>
        <div class="basic-info-grid">
            <div class="stat-item">
                <span class="stat-label">Distance</span>
                <span class="stat-value">{{ formattedDistance }}</span>
            </div>
            <div
                v-if="hasDuration"
                class="stat-item"
            >
                <span class="stat-label">Duration</span>
                <span class="stat-value">{{ formattedDuration }}</span>
            </div>
        </div>
    </div>

    <!-- Speed and Pace Section -->
    <div v-if="hasSpeedData" class="stats-section">
        <h3>Statistics</h3>
        <div class="speed-pace-grid">
            <div
                v-if="
                    hasMetric(track.moving_avg_speed)
                "
                class="stat-item"
            >
                <span class="stat-label">Average moving speed</span>
                <span class="stat-value">{{ formattedMovingAvgSpeed }}</span>
            </div>
            <div
                v-if="
                    hasMetric(track.moving_avg_pace)
                "
                class="stat-item"
            >
                <span class="stat-label">Average moving pace</span>
                <span class="stat-value">{{ formattedMovingAvgPace }}</span>
            </div>
            <div
                v-if="hasMetric(track.moving_time)"
                class="stat-item"
            >
                <span class="stat-label">Moving time</span>
                <span class="stat-value">{{ formatDuration(track.moving_time) }}</span>
            </div>
            <div
                v-if="hasMetric(track.pause_time)"
                class="stat-item"
            >
                <span class="stat-label">Pause time</span>
                <span class="stat-value">{{ formatDuration(track.pause_time) }}</span>
            </div>
            <div
                v-if="hasMetric(track.avg_hr)"
                class="stat-item"
            >
                <span class="stat-label">Average HR</span>
                <span class="stat-value">{{ Math.round(track.avg_hr) }} bpm</span>
            </div>
            <div
                v-if="hasMetric(track.hr_min)"
                class="stat-item"
            >
                <span class="stat-label">Minimum HR</span>
                <span class="stat-value">{{ Math.round(track.hr_min) }} bpm</span>
            </div>
            <div
                v-if="hasMetric(track.hr_max)"
                class="stat-item"
            >
                <span class="stat-label">Maximum HR</span>
                <span class="stat-value">{{ Math.round(track.hr_max) }} bpm</span>
            </div>
        </div>
    </div>
</template>
