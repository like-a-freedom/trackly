<template>
  <section
    class="track-editor-chart-card"
    data-testid="track-editor-chart-card"
  >
    <TrackEditorInspectorElevation
      :elevation-profile="elevationProfile"
      :elevation-stats="elevationStats"
      :total-distance-km="totalDistanceKm"
      :coordinate-data="coordinateData"
      :elevation-loading="elevationLoading"
      :elevation-error="elevationError"
      @chart-point-hover="$emit('chart-point-hover', $event)"
      @chart-point-leave="$emit('chart-point-leave', $event)"
      @chart-point-click="$emit('chart-point-click', $event)"
    />
    <div v-if="recordedSeries && availableSeries.length" class="border-t border-line p-3">
      <label class="block text-sm font-semibold text-ink" for="recorded-series">Original GPS recording</label>
      <select id="recorded-series" v-model="recordedMode" class="my-2 min-h-11 w-full rounded border border-line bg-surface px-3 text-base">
        <option v-for="series in availableSeries" :key="series.value" :value="series.value">{{ series.label }}</option>
      </select>
      <p class="text-sm text-muted">Recorded measurements refer to the original route.</p>
      <ElevationChart :chart-mode="recordedMode" :total-distance="recordedSeries.distance" :coordinate-data="recordedSeries.coordinates" :speed-data="recordedSeries.speed" :pace-data="recordedSeries.pace" :heart-rate-data="recordedSeries.heartRate" :temperature-data="recordedSeries.temperature" :time-data="recordedSeries.time" />
    </div>
  </section>
</template>

<script setup>
import TrackEditorInspectorElevation from "./TrackEditorInspectorElevation.vue";
import ElevationChart from "../ElevationChart.vue";
import { computed, ref, watch } from "vue";

const props = defineProps({
  recordedSeries: { type: Object, default: null },
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  totalDistanceKm: { type: Number, default: 0 },
  coordinateData: { type: Array, default: () => [] },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
});
const recordedMode = ref('speed');
const availableSeries = computed(() => [{value:'speed',label:'Speed · km/h',key:'speed'},{value:'pace',label:'Pace · min/km',key:'pace'},{value:'pulse',label:'Heart rate · bpm',key:'heartRate'},{value:'temperature',label:'Temperature · °C',key:'temperature'}].filter(s => props.recordedSeries?.[s.key]?.some(v => typeof v === 'number' && Number.isFinite(v))));
watch(availableSeries, series => { if (!series.some(s => s.value === recordedMode.value)) recordedMode.value = series[0]?.value ?? 'speed'; }, {immediate:true});

defineEmits(["chart-point-hover", "chart-point-leave", "chart-point-click"]);
</script>

<style scoped>
.track-editor-chart-card {
  min-width: 0;
}
</style>
