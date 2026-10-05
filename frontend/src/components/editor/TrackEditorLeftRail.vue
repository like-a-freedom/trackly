<template>
  <nav
    class="track-editor-left-rail"
    aria-label="Editor tools"
  >
    <select class="mode-select min-h-11 min-w-0 rounded border border-line bg-white text-sm text-ink" :value="mode" aria-label="Drawing tool" @change="$emit('setMode', ($event.target as HTMLSelectElement).value)"><option v-for="item in modeItems" :key="item.id" :value="item.id">{{ item.label }}</option></select>
    <div class="left-rail-group left-rail-group--modes">
      <button
        v-for="item in modeItems"
        :key="item.id"
        class="left-rail-btn"
        :class="{ active: mode === item.id }"
        :aria-pressed="mode === item.id ? 'true' : 'false'"
        :data-testid="`left-rail-mode-${item.id}`"
        :title="`${item.label} (${item.key})`"
        @click="$emit('setMode', item.id)"
      >
        <component :is="item.icon" :size="18" aria-hidden="true" />
        <span class="sr-only">{{ item.label }}</span>
      </button>
    </div>

    <div class="left-rail-divider" />

    <div class="left-rail-group">
      <button
        class="left-rail-btn"
        :disabled="!canUndo"
        data-testid="left-rail-undo"
        title="Undo"
        @click="$emit('undo')"
      >
        <Undo2 :size="18" aria-hidden="true" />
        <span class="sr-only">Undo</span>
      </button>
      <button
        class="left-rail-btn"
        :disabled="!canRedo"
        data-testid="left-rail-redo"
        title="Redo"
        @click="$emit('redo')"
      >
        <Redo2 :size="18" aria-hidden="true" />
        <span class="sr-only">Redo</span>
      </button>
    </div>

    <div class="left-rail-divider" />

    <div class="left-rail-group left-rail-group--footer">
      <button
        class="left-rail-btn"
        :class="{ active: poiMode }"
        :aria-pressed="poiMode ? 'true' : 'false'"
        data-testid="left-rail-poi-toggle"
        title="POI mode"
        @click="$emit('togglePoiMode')"
      >
        <MapPin :size="18" aria-hidden="true" />
        <span class="sr-only">Toggle POI mode</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { Eye, Pencil, Scissors, Route, PenTool, Undo2, Redo2, MapPin } from 'lucide-vue-next';
const props = defineProps({
  mode: { type: String, default: "edit" },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  poiMode: { type: Boolean, default: false },
});

defineEmits(["setMode", "undo", "redo", "togglePoiMode"]);

const modeItems = [
  { id: "view", label: "View", key: "F1", icon: Eye },
  { id: "edit", label: "Draw", key: "F2", icon: Pencil },
  { id: "fragment", label: "Fragments", key: "F3", icon: Scissors },
  { id: "routing", label: "Routing", key: "F4", icon: Route },
  { id: "trace", label: "Trace", key: "T", icon: PenTool },
];
</script>

<style scoped>
.track-editor-left-rail { display:flex; flex-direction:row; gap:8px; padding:6px; border:1px solid var(--color-line); background:var(--color-surface); border-radius:8px; overflow-x:auto; }
.left-rail-group { display:flex; gap:4px; flex-shrink:0; }
.left-rail-divider { width:1px; background:var(--color-line); }
.left-rail-btn { display:flex; align-items:center; justify-content:center; width:44px; height:44px; border:0; background:transparent; color:var(--color-ink); border-radius:4px; cursor:pointer; flex-shrink:0; }
.left-rail-btn.active { background:var(--color-action); color:white; }
.left-rail-btn:disabled { color:#75859a; cursor:not-allowed; }
.left-rail-btn:hover:not(:disabled):not(.active) { background:#eff6ff; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }

.mode-select { display:none; }
@media(max-width:900px) {
 .mode-select { display:block; flex:1; width:76px; }
 .left-rail-group--modes,.left-rail-divider { display:none; }
 .track-editor-left-rail { gap:4px; padding:4px; }
}
</style>
