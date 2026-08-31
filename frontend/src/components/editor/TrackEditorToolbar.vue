<template>
  <nav
    class="track-editor-toolbar"
    aria-label="Editor mode controls"
    data-testid="track-editor-toolbar"
  >
    <!-- Mode buttons -->
    <div class="toolbar-group">
      <button
        v-for="item in modeItems"
        :key="item.id"
        class="toolbar-btn toolbar-btn--mode"
        :class="{ 'toolbar-btn--active': mode === item.id }"
        :aria-pressed="mode === item.id ? 'true' : 'false'"
        :title="`${item.label} (${item.key})`"
        :data-testid="`toolbar-mode-${item.id}`"
        @click="$emit('setMode', item.id)"
      >
        <span
          class="toolbar-btn-icon"
          aria-hidden="true"
        >{{ item.icon }}</span>
        <span class="toolbar-btn-label">{{ item.label }}</span>
      </button>
    </div>

    <span
      class="toolbar-sep"
      aria-hidden="true"
    />

    <!-- Undo / Redo -->
    <button
      class="toolbar-btn toolbar-btn--compact"
      :disabled="!canUndo"
      title="Undo (Ctrl+Z)"
      data-testid="toolbar-undo"
      @click="$emit('undo')"
    >
      <span
        class="toolbar-btn-icon"
        aria-hidden="true"
      >↶</span>
      <span class="sr-only">Undo</span>
    </button>
    <button
      class="toolbar-btn toolbar-btn--compact"
      :disabled="!canRedo"
      title="Redo (Ctrl+Y)"
      data-testid="toolbar-redo"
      @click="$emit('redo')"
    >
      <span
        class="toolbar-btn-icon"
        aria-hidden="true"
      >↷</span>
      <span class="sr-only">Redo</span>
    </button>

    <span
      class="toolbar-sep"
      aria-hidden="true"
    />

    <!-- Routing toggle + profile -->
    <button
      class="toolbar-btn toolbar-btn--compact"
      :class="{ 'toolbar-btn--active': routingMode === 'auto' }"
      :aria-pressed="routingMode === 'auto' ? 'true' : 'false'"
      title="Toggle auto routing"
      data-testid="toolbar-routing-toggle"
      @click="$emit('toggleRouting')"
    >
      <span
        class="toolbar-btn-icon"
        aria-hidden="true"
      >🛣️</span>
      <span class="toolbar-btn-label">Route</span>
    </button>

    <select
      v-if="routingMode === 'auto'"
      class="toolbar-select"
      :value="routingProfile"
      data-testid="toolbar-routing-profile"
      @change="$emit('setRoutingProfile', $event.target.value)"
    >
      <option value="hiking">
        🥾 Hiking
      </option>
      <option value="walking">
        🚶 Walking
      </option>
      <option value="running">
        🏃 Running
      </option>
      <option value="cycling">
        🚴 Cycling
      </option>
      <option value="mtb">
        🚵 MTB
      </option>
      <option value="driving">
        🚗 Driving
      </option>
    </select>

    <select
      class="toolbar-select toolbar-select--sm"
      :value="snapToRoadMode"
      data-testid="toolbar-snap-mode"
      @change="$emit('setSnapToRoadMode', $event.target.value)"
    >
      <option value="auto">
        Snap: Auto
      </option>
      <option value="on">
        Snap: On
      </option>
      <option value="off">
        Snap: Off
      </option>
    </select>

    <span
      class="toolbar-sep"
      aria-hidden="true"
    />

    <!-- POI toggle -->
    <button
      class="toolbar-btn toolbar-btn--compact"
      :class="{ 'toolbar-btn--active': poiMode }"
      :aria-pressed="poiMode ? 'true' : 'false'"
      title="Toggle POI mode"
      data-testid="toolbar-poi"
      @click="$emit('togglePoiMode')"
    >
      <span
        class="toolbar-btn-icon"
        aria-hidden="true"
      >📍</span>
      <span class="sr-only">POI</span>
    </button>

    <!-- Distance markers toggle -->
    <button
      class="toolbar-btn toolbar-btn--compact"
      :class="{ 'toolbar-btn--active': showDistanceMarkers }"
      :aria-pressed="showDistanceMarkers ? 'true' : 'false'"
      title="Distance markers"
      data-testid="toolbar-distance-markers"
      @click="$emit('toggleDistanceMarkers')"
    >
      <span
        class="toolbar-btn-icon"
        aria-hidden="true"
      >📏</span>
      <span class="sr-only">Distance markers</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps({
  mode: { type: String, default: "edit" },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  poiMode: { type: Boolean, default: false },
  routingMode: { type: String, default: "manual" },
  snapToRoadMode: { type: String, default: "auto" },
  routingProfile: { type: String, default: "hiking" },
  showDistanceMarkers: { type: Boolean, default: false },
});

defineEmits([
  "setMode",
  "undo",
  "redo",
  "togglePoiMode",
  "toggleRouting",
  "setSnapToRoadMode",
  "setRoutingProfile",
  "toggleDistanceMarkers",
]);

const modeItems = [
  { id: "view", label: "View", key: "F1", icon: "👁" },
  { id: "edit", label: "Draw", key: "F2", icon: "✏️" },
  { id: "fragment", label: "Cut", key: "F3", icon: "✂️" },
  { id: "routing", label: "Route", key: "F4", icon: "🗺️" },
  { id: "trace", label: "Trace", key: "T", icon: "🖊️" },
];
</script>

<style scoped>
.track-editor-toolbar {
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  padding: 5px 10px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.09),
    0 1px 4px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
}

.toolbar-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.toolbar-sep {
  display: block;
  width: 1px;
  height: 20px;
  background: rgba(148, 163, 184, 0.4);
  flex-shrink: 0;
  margin: 0 5px;
}

.toolbar-btn {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 9px;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: #475569;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(241, 245, 249, 1);
  color: #0f172a;
}

.toolbar-btn--active {
  background: #2563eb;
  color: #fff;
}

.toolbar-btn--active:hover:not(:disabled) {
  background: #1d4ed8;
  color: #fff;
}

.toolbar-btn--compact {
  padding: 0 8px;
  gap: 0;
}

.toolbar-btn:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.toolbar-btn-icon {
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
}

.toolbar-btn-label {
  font-size: 0.8125rem;
  font-weight: 500;
}

.toolbar-select {
  height: 28px;
  padding: 0 6px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  border-radius: 9px;
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
  font-size: 0.78rem;
  cursor: pointer;
  outline: none;
  flex-shrink: 0;
  transition: border-color 0.12s;
}

.toolbar-select:focus {
  border-color: #93c5fd;
}

.toolbar-select--sm {
  max-width: 98px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .track-editor-toolbar {
    padding: 4px 8px;
    gap: 2px;
    border-radius: 14px;
  }

  .toolbar-btn-label {
    display: none;
  }

  .toolbar-btn--mode {
    padding: 0 7px;
  }

  .toolbar-select {
    max-width: 80px;
    font-size: 0.72rem;
  }

  .toolbar-select--sm {
    display: none;
  }
}
</style>
