<script setup lang="ts">
import { computed } from 'vue';
import { Ruler } from 'lucide-vue-next';
const props = defineProps<{ enabled: boolean; persisted: boolean }>();
const emit = defineEmits<{ toggle: [enabled: boolean] }>();
const hint = computed(() => props.persisted
  ? 'Distance markers. Only in this browser.'
  : 'Distance markers. For this visit only. Browser storage is unavailable.');
</script>
<template>
  <button v-tooltip="hint" type="button" class="distance-markers-btn"
    aria-label="Distance markers" :aria-pressed="enabled" @click="emit('toggle', !enabled)">
    <Ruler :size="16" aria-hidden="true" />
  </button>
</template>
<style scoped>
.distance-markers-btn[aria-pressed="true"] {
  color: var(--color-action);
  background: color-mix(in oklch, var(--color-action) 10%, transparent);
}
</style>
