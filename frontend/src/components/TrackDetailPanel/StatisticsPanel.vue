<script setup>
import { computed } from 'vue';

const props = defineProps({
    track: { type: Object, required: true },
    isOwner: { type: Boolean, default: false },
    speedUnit: { type: String, default: 'kmh' },
    formattedDistance: { type: String, default: '' },
    formattedDuration: { type: String, default: '' },
    formattedMovingAvgSpeed: { type: String, default: '' },
    formattedMovingAvgPace: { type: String, default: '' },
    distanceMarkersEnabled: { type: Boolean, default: true },
});

const emit = defineEmits([
    'speed-unit-change',
    'distance-markers-toggle',
]);

const hasSpeedData = computed(() =>
    props.track.moving_avg_speed !== undefined ||
    props.track.moving_avg_pace !== undefined ||
    props.track.avg_hr !== undefined
);

function handleSpeedUnitChange(unit) {
    emit('speed-unit-change', unit);
}

function handleDistanceMarkersToggle(event) {
    emit('distance-markers-toggle', event);
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
                v-if="
                    track.duration_seconds !== undefined &&
                    track.duration_seconds !== null &&
                    track.duration_seconds > 0
                "
                class="stat-item"
            >
                <span class="stat-label">Duration</span>
                <span class="stat-value">{{ formattedDuration }}</span>
            </div>
        </div>
    </div>

    <!-- Map Overlays -->
    <div class="stats-section">
        <div class="section-header">
            <h3>Map overlays</h3>
        </div>
        <label class="toggle-row" data-testid="distance-markers-toggle">
            <input
                type="checkbox"
                :checked="distanceMarkersEnabled"
                :disabled="!isOwner"
                @change="handleDistanceMarkersToggle"
            />
            <span>Distance markers</span>
            <!-- A tooltip on the label explains the disabled state in place.
                 The paragraph below repeated it as body copy, which read as a
                 rule rather than as help. -->
            <span
                v-if="!isOwner"
                class="info-icon"
                tabindex="0"
                data-tooltip="Only the track owner can change overlay settings"
                aria-label="Only the track owner can change overlay settings"
            >?</span>
        </label>
    </div>

    <!-- Speed and Pace Section -->
    <div v-if="hasSpeedData" class="stats-section">
        <h3>Statistics</h3>
        <div class="speed-pace-grid">
            <div
                v-if="
                    track.moving_avg_speed !== undefined &&
                    track.moving_avg_speed !== null
                "
                class="stat-item"
            >
                <span class="stat-label">Average moving speed</span>
                <span class="stat-value">{{ formattedMovingAvgSpeed }}</span>
            </div>
            <div
                v-if="
                    track.moving_avg_pace !== undefined &&
                    track.moving_avg_pace !== null
                "
                class="stat-item"
            >
                <span class="stat-label">Average moving pace</span>
                <span class="stat-value">{{ formattedMovingAvgPace }}</span>
            </div>
            <div
                v-if="track.moving_time !== undefined && track.moving_time !== null"
                class="stat-item"
            >
                <span class="stat-label">Moving time</span>
                <span class="stat-value">{{ track.moving_time }}</span>
            </div>
            <div
                v-if="track.pause_time !== undefined && track.pause_time !== null"
                class="stat-item"
            >
                <span class="stat-label">Pause time</span>
                <span class="stat-value">{{ track.pause_time }}</span>
            </div>
            <div
                v-if="track.avg_hr !== undefined && track.avg_hr !== null"
                class="stat-item"
            >
                <span class="stat-label">Average HR</span>
                <span class="stat-value">{{ Math.round(track.avg_hr) }} bpm</span>
            </div>
            <div
                v-if="track.hr_min !== undefined && track.hr_min !== null"
                class="stat-item"
            >
                <span class="stat-label">Minimum HR</span>
                <span class="stat-value">{{ Math.round(track.hr_min) }} bpm</span>
            </div>
            <div
                v-if="track.hr_max !== undefined && track.hr_max !== null"
                class="stat-item"
            >
                <span class="stat-label">Maximum HR</span>
                <span class="stat-value">{{ Math.round(track.hr_max) }} bpm</span>
            </div>
        </div>
    </div>
</template>
