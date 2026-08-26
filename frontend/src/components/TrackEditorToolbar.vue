<template>
  <div class="track-editor-toolbar">
    <!-- Mode buttons -->
    <div class="toolbar-group">
      <button
        v-for="m in modes"
        :key="m.id"
        class="toolbar-btn"
        :class="{ active: mode === m.id }"
        :title="`${m.label} (${m.key})`"
        :data-testid="`mode-${m.id}`"
        @click="$emit('setMode', m.id)"
      >
        <span
          class="toolbar-btn-icon"
          v-html="m.icon"
        />
        <span class="toolbar-btn-label">{{ m.label }}</span>
      </button>
    </div>

    <!-- Divider -->
    <div class="toolbar-divider" />

    <!-- Undo / Redo -->
    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        :disabled="!canUndo"
        title="Undo (Ctrl+Z)"
        data-testid="undo-btn"
        @click="$emit('undo')"
      >
        <span class="toolbar-btn-icon">&#8630;</span>
      </button>
      <button
        class="toolbar-btn"
        :disabled="!canRedo"
        title="Redo (Ctrl+Y)"
        data-testid="redo-btn"
        @click="$emit('redo')"
      >
        <span class="toolbar-btn-icon">&#8631;</span>
      </button>
    </div>

    <div class="toolbar-divider" />

    <!-- Routing toggle -->
    <div class="toolbar-group">
      <label
        class="toolbar-toggle"
        title="Auto-routing"
      >
        <input
          type="checkbox"
          :checked="routingMode === 'auto'"
          data-testid="routing-toggle"
          @change="$emit('toggleRouting')"
        >
        <span class="toggle-label">Auto</span>
      </label>
      <label
        class="toolbar-select"
        title="Snap to road"
      >
        <select
          class="toolbar-select-input"
          :value="snapToRoadMode"
          data-testid="snap-mode"
          @change="$emit('setSnapToRoadMode', $event.target.value)"
        >
          <option value="auto">Snap: Auto</option>
          <option value="on">Snap: On</option>
          <option value="off">Snap: Off</option>
        </select>
      </label>
      <label
        class="toolbar-select"
        title="Routing profile"
      >
        <select
          class="toolbar-select-input"
          :value="routingProfile"
          data-testid="routing-profile"
          @change="$emit('setRoutingProfile', $event.target.value)"
        >
          <option value="hiking">Hiking</option>
          <option value="walking">Walking</option>
          <option value="running">Running</option>
          <option value="cycling">Cycling</option>
          <option value="mtb">MTB</option>
          <option value="driving">Driving</option>
        </select>
      </label>
      <span
        v-if="graphLoading"
        class="toolbar-status"
      >
        Loading graph...
        <span v-if="graphProgress > 0">{{ graphProgress }}%</span>
      </span>
      <span
        v-else-if="graphError"
        class="toolbar-status error"
      >Route unavailable</span>
    </div>

    <div class="toolbar-divider" />

    <!-- POI mode toggle -->
    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        :class="{ active: poiMode }"
        title="POI add mode"
        data-testid="poi-mode-btn"
        @click="$emit('togglePoiMode')"
      >
        <span class="toolbar-btn-icon">📍</span>
        <span class="toolbar-btn-label">POI</span>
      </button>
      <button
        class="toolbar-btn"
        :class="{ active: showDistanceMarkers }"
        title="Distance markers"
        data-testid="distance-markers-btn"
        @click="$emit('toggleDistanceMarkers')"
      >
        <span class="toolbar-btn-icon">📐</span>
        <span class="toolbar-btn-label">Km</span>
      </button>
    </div>

    <!-- Spacer -->
    <div class="toolbar-spacer" />

    <!-- Stats -->
    <div
      class="toolbar-stats"
      data-testid="toolbar-stats"
    >
      <span
        class="stat-item"
        title="Distance"
      > 📏 {{ distanceDisplay }} </span>
      <span
        class="stat-item"
        title="Estimated time"
      >
        ⏱ {{ timeDisplay }}
      </span>
      <span
        v-if="manualRoutingPercent > 0"
        class="stat-item manual-warning"
        title="Manual routing segments"
      >
        ⚠️ {{ manualRoutingPercent }}% manual
      </span>
      <span
        class="stat-item"
        title="Points"
      > 📍 {{ totalPoints }} </span>
    </div>

    <!-- Export dropdown -->
    <div class="toolbar-group export-group">
      <button
        class="toolbar-btn"
        :disabled="!savedTrackId"
        title="Export track (Ctrl+E)"
        data-testid="export-btn"
        @click="showExportMenu = !showExportMenu"
      >
        <span class="toolbar-btn-icon">📥</span>
        <span class="toolbar-btn-label">Export</span>
      </button>
      <div
        v-if="showExportMenu"
        class="export-dropdown"
        data-testid="export-dropdown"
      >
        <button
          class="export-item"
          @click="handleExport('gpx')"
        >
          🗺 GPX
        </button>
        <button
          class="export-item"
          @click="handleExport('kml')"
        >
          🌍 KML
        </button>
        <button
          class="export-item"
          @click="handleExport('geojson')"
        >
          📄 GeoJSON
        </button>
      </div>
    </div>

    <!-- Save button -->
    <div class="toolbar-group">
      <button
        class="toolbar-btn save-btn"
        :disabled="!canSave || saving"
        title="Save (Ctrl+Shift+S)"
        data-testid="save-btn"
        @click="$emit('save')"
      >
        {{ saving ? "Saving..." : "Save" }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  mode: { type: String, default: "edit" },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  totalPoints: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  manualRoutingPercent: { type: Number, default: 0 },
  routingMode: { type: String, default: "manual" },
  snapToRoadMode: { type: String, default: "auto" },
  routingProfile: { type: String, default: "hiking" },
  graphLoading: { type: Boolean, default: false },
  graphError: { type: String, default: null },
  graphProgress: { type: Number, default: 0 },
  poiMode: { type: Boolean, default: false },
  showDistanceMarkers: { type: Boolean, default: false },
  savedTrackId: { type: [String, null], default: null },
});

const emit = defineEmits([
  "setMode",
  "undo",
  "redo",
  "save",
  "toggleRouting",
  "setSnapToRoadMode",
  "setRoutingProfile",
  "togglePoiMode",
  "toggleDistanceMarkers",
  "export",
]);

const showExportMenu = ref(false);

const modes = [
  { id: "view", label: "View", key: "F1", icon: "👁" },
  { id: "edit", label: "Draw", key: "F2", icon: "✏️" },
  { id: "fragment", label: "Fragments", key: "F3", icon: "✂️" },
  { id: "routing", label: "Routing", key: "F4", icon: "🗺️" },
  { id: "trace", label: "Trace", key: "T", icon: "🖊️" },
];

const distanceDisplay = computed(() => {
  const km = props.totalDistanceKm;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
});

const timeDisplay = computed(() => {
  const mins = props.estimatedTimeMinutes;
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
});

function handleExport(format) {
  showExportMenu.value = false;
  emit("export", format);
}
</script>

<style scoped>
.track-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  z-index: 1000;
  flex-wrap: wrap;
}

.toolbar-select {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.toolbar-select-input {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: #111827;
  background: #fff;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.15s;
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  background: #e8f0fe;
  border-color: #1976d2;
}

.toolbar-btn.active {
  background: #1976d2;
  color: #fff;
  border-color: #1565c0;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn-icon {
  font-size: 16px;
  line-height: 1;
}

.toolbar-btn-label {
  font-size: 12px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e0e0e0;
  margin: 0 4px;
}

.toolbar-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #555;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #555;
  padding: 0 8px;
}

.stat-item {
  white-space: nowrap;
}

.manual-warning {
  color: #c62828;
  font-weight: 600;
}

.save-btn {
  background: #1976d2;
  color: #fff;
  border-color: #1565c0;
  font-weight: 500;
}

.save-btn:hover:not(:disabled) {
  background: #1565c0;
}

.toggle-label {
  user-select: none;
}

.toolbar-status {
  font-size: 11px;
  color: #555;
  margin-left: 6px;
}

.toolbar-status.error {
  color: #c62828;
}

.export-group {
  position: relative;
}

.export-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 100;
  min-width: 140px;
  padding: 4px 0;
}

.export-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: #333;
}

.export-item:hover {
  background: #f0f0f0;
}

@media (max-width: 640px) {
  .track-editor-toolbar {
    padding: 4px 8px;
    gap: 2px;
  }

  .toolbar-btn-label {
    display: none;
  }

  .toolbar-stats {
    font-size: 11px;
    gap: 6px;
    padding: 0 4px;
  }
}

@media (pointer: coarse) {
  .toolbar-btn {
    padding: 8px 12px;
    font-size: 14px;
  }

  .toolbar-btn-icon {
    font-size: 18px;
  }

  .toolbar-toggle {
    font-size: 13px;
  }
}
</style>
