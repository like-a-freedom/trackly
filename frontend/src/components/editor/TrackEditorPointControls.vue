<template>
  <details class="mt-4 border-t border-line pt-4">
    <summary class="min-h-11 cursor-pointer font-medium">Edit points by coordinates</summary>
    <form class="mt-3 grid gap-3" @submit.prevent="handleAdd">
      <label class="grid gap-1 text-sm">Latitude<input v-model.number="latitude" aria-label="Latitude" type="number" step="any" min="-90" max="90" required class="min-h-11 rounded border border-line px-3 text-base" /></label>
      <label class="grid gap-1 text-sm">Longitude<input v-model.number="longitude" aria-label="Longitude" type="number" step="any" min="-180" max="180" required class="min-h-11 rounded border border-line px-3 text-base" /></label>
      <button type="submit" :disabled="!validCoordinates" class="min-h-11 rounded border-0 bg-action px-3 text-white disabled:opacity-50">Add point</button>
    </form>
    <div v-if="points.length" class="mt-4 grid gap-3">
      <label class="grid gap-1 text-sm">Point number<input v-model.number="pointNumber" type="number" min="1" :max="points.length" class="min-h-11 rounded border border-line px-3 text-base" @change="handleFocus" /></label>
      <p class="m-0 text-sm text-muted" aria-live="polite">{{ points.length }} points in this segment. {{ isAnchor ? 'Selected point is an anchor.' : 'Make this point an anchor to move or delete it.' }}</p>
      <div class="grid grid-cols-2 gap-2">
        <button class="min-h-11 rounded border border-line bg-white px-2" :disabled="!validPoint" @click="handleFocus">Show on map</button>
        <button v-if="!isAnchor" class="min-h-11 rounded border border-line bg-white px-2" :disabled="!validPoint" @click="$emit('promote', pointNumber - 1)">Make anchor</button>
        <button v-else class="min-h-11 rounded border border-line bg-white px-2" :disabled="!validCoordinates" @click="$emit('move', pointNumber - 1, Number(latitude), Number(longitude))">Move anchor</button>
        <button class="min-h-11 rounded border border-line bg-white px-2" :disabled="!validPoint || !isAnchor" @click="$emit('delete', pointNumber - 1)">Delete anchor</button>
        <button class="min-h-11 rounded border border-line bg-white px-2" :disabled="!validPoint" @click="$emit('fragment', pointNumber - 1)">Select fragment endpoint</button>
      </div>
    </div>
  </details>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LatLngTuple } from '@/types';
const props = defineProps<{ points: LatLngTuple[]; anchors: number[] }>();
const emit = defineEmits<{ add: [lat:number,lon:number]; focus:[index:number]; promote:[index:number]; move:[index:number,lat:number,lon:number]; delete:[index:number]; fragment:[index:number] }>();
const latitude = ref<number | string>('');
const longitude = ref<number | string>('');
const pointNumber = ref(1);
const validCoordinates = computed(() => latitude.value !== '' && longitude.value !== '' && Number.isFinite(Number(latitude.value)) && Number.isFinite(Number(longitude.value)) && Math.abs(Number(latitude.value)) <= 90 && Math.abs(Number(longitude.value)) <= 180);
const validPoint = computed(() => Number.isInteger(pointNumber.value) && pointNumber.value >= 1 && pointNumber.value <= props.points.length);
const isAnchor = computed(() => validPoint.value && props.anchors.includes(pointNumber.value - 1));
watch(() => props.points[pointNumber.value - 1], point => { if (point) { latitude.value = point[0]; longitude.value = point[1]; } }, { immediate:true });
const handleAdd = () => { if (validCoordinates.value) emit('add',Number(latitude.value),Number(longitude.value)); };
const handleFocus = () => { if (validPoint.value) emit('focus',pointNumber.value - 1); };
</script>
