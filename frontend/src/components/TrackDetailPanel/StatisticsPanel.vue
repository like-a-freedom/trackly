<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { Info } from 'lucide-vue-next';
import { formatDuration } from '../../utils/format';

const props = defineProps({
    track: { type: Object, required: true },
    isOwner: { type: Boolean, default: false },
    speedUnit: { type: String, default: 'kmh' },
    formattedDistance: { type: String, default: '' },
    formattedDuration: { type: String, default: '' },
    formattedMovingAvgSpeed: { type: String, default: '' },
    formattedMovingAvgPace: { type: String, default: '' },
    distanceMarkersEnabled: { type: Boolean, default: true },
    preferencePersisted: { type: Boolean, default: true },
});

const emit = defineEmits([
    'speed-unit-change',
    'distance-markers-toggle',
]);

const markersId = useId();
const hintOpen = ref(false);
const markersHint = computed(() => props.preferencePersisted
    ? 'Only in this browser.'
    : 'For this visit only. Browser storage is unavailable.');

const hasSpeedData = computed(() =>
    props.track.moving_avg_speed !== undefined ||
    props.track.moving_avg_pace !== undefined ||
    props.track.avg_hr !== undefined
);

function handleSpeedUnitChange(unit: string) {
    emit('speed-unit-change', unit);
}

function handleDistanceMarkersToggle(event: Event) {
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

                class="stat-item"
            >
                <span class="stat-label">Duration</span>
                <span class="stat-value">{{ formattedDuration && formattedDuration !== 'N/A' ? formattedDuration : 'Not recorded' }}</span>
            </div>
        </div>
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
                <span class="stat-value">{{ formatDuration(track.moving_time) }}</span>
            </div>
            <div
                v-if="track.pause_time !== undefined && track.pause_time !== null"
                class="stat-item"
            >
                <span class="stat-label">Pause time</span>
                <span class="stat-value">{{ formatDuration(track.pause_time) }}</span>
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
    <section class="stats-section" aria-label="Map display">
        <h3>Map display</h3>
        <div class="flex min-w-0 items-center justify-between gap-4 py-2">
            <div class="flex min-w-0 items-center gap-1">
                <label :for="markersId" class="cursor-pointer font-medium text-ink">Distance markers</label>
                <button type="button" class="info-icon markers-hint !h-11 !w-11 shrink-0 border-0 bg-transparent" aria-label="About distance markers" :aria-describedby="`${markersId}-hint`" :data-tooltip="markersHint" :aria-expanded="hintOpen" @click="hintOpen = true" @focus="hintOpen = true" @blur="hintOpen = false" @keydown.esc.stop="hintOpen = false">
                    <Info aria-hidden="true" class="h-4 w-4" />
                </button>
                <span :id="`${markersId}-hint`" class="sr-only">{{ markersHint }}</span>
            </div>
            <label class="relative flex min-h-11 w-11 shrink-0 cursor-pointer items-center" data-testid="distance-markers-toggle">
                <input
                    :id="markersId"
                    type="checkbox"
                    role="switch"
                    class="peer absolute inset-0 z-10 h-full w-full cursor-inherit opacity-0"
                    :aria-describedby="`${markersId}-hint`"
                    :checked="distanceMarkersEnabled"
                    @change="handleDistanceMarkersToggle"
                />
                <span aria-hidden="true" class="flex h-6 w-11 items-center rounded-full border border-muted bg-muted px-0.5 peer-checked:border-action peer-checked:bg-action peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring">
                    <span class="h-4 w-4 rounded-full bg-surface" :class="{ 'translate-x-5': distanceMarkersEnabled }" />
                </span>
            </label>
        </div>
    </section>
</template>

<style scoped>
button.markers-hint::after {
    inset-inline-start: 50%;
    inset-block-start: auto;
    inset-block-end: calc(100% + 8px);
    transform: translateX(-50%);
}
button.markers-hint[aria-expanded="true"]::after {
    opacity: 1;
    visibility: visible;
}
button.markers-hint::before {
    display: none;
}
button.markers-hint[aria-expanded="false"]::after {
    opacity: 0;
    visibility: hidden;
}
</style>
