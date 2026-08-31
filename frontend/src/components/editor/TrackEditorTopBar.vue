<template>
  <section
    ref="rootElement"
    class="track-editor-top-bar"
  >
    <div class="top-bar-context">
      <div class="top-bar-track-copy">
        <span class="top-bar-eyebrow">Track editor</span>
        <strong data-testid="top-bar-track-name">{{
          resolvedTrackName
        }}</strong>
      </div>
      <span
        v-if="savedTrackId"
        class="top-bar-badge"
        data-testid="top-bar-saved-badge"
      >
        Saved
      </span>
    </div>

    <div class="top-bar-metrics">
      <span
        class="metric-chip"
        data-testid="top-bar-distance"
      >{{
        distanceDisplay
      }}</span>
      <span
        class="metric-chip"
        data-testid="top-bar-time"
      >{{
        timeDisplay
      }}</span>
      <span
        class="metric-chip"
        data-testid="top-bar-points"
      >{{ totalPoints }} pts</span>
      <span
        v-if="manualRoutingPercent > 0"
        class="metric-chip metric-chip--warning"
        data-testid="top-bar-manual-warning"
      >
        {{ manualRoutingPercent }}% manual
      </span>
    </div>

    <div class="top-bar-controls">
      <div class="top-bar-overflow-group">
        <button
          ref="overflowToggle"
          class="top-bar-ghost-btn"
          :aria-expanded="showOverflowMenu ? 'true' : 'false'"
          aria-haspopup="dialog"
          aria-controls="track-editor-top-bar-overflow"
          data-testid="top-bar-overflow-toggle"
          @click="toggleOverflowMenu"
        >
          More
        </button>

        <div
          v-if="showOverflowMenu"
          id="track-editor-top-bar-overflow"
          ref="overflowPanel"
          class="top-bar-overflow-menu"
          :style="overflowMenuStyle"
          data-testid="top-bar-overflow-menu"
          aria-label="Editor secondary controls"
          @keydown.esc.prevent="handleCloseOverflow(true)"
        >
          <label
            class="top-bar-menu-toggle"
            title="Auto routing"
          >
            <input
              type="checkbox"
              :checked="routingMode === 'auto'"
              data-testid="top-bar-routing-toggle"
              @change="$emit('toggleRouting')"
            >
            <span>Auto routing</span>
          </label>

          <select
            class="top-bar-select"
            :value="snapToRoadMode"
            data-testid="top-bar-snap-mode"
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

          <select
            class="top-bar-select"
            :value="routingProfile"
            data-testid="top-bar-routing-profile"
            @change="$emit('setRoutingProfile', $event.target.value)"
          >
            <option value="hiking">
              Hiking
            </option>
            <option value="walking">
              Walking
            </option>
            <option value="running">
              Running
            </option>
            <option value="cycling">
              Cycling
            </option>
            <option value="mtb">
              MTB
            </option>
            <option value="driving">
              Driving
            </option>
          </select>

          <button
            class="top-bar-export-item"
            :aria-pressed="showDistanceMarkers ? 'true' : 'false'"
            data-testid="top-bar-distance-markers"
            @click="$emit('toggleDistanceMarkers')"
          >
            Distance markers
          </button>

          <button
            class="top-bar-export-item"
            :disabled="!savedTrackId"
            data-testid="top-bar-export-gpx"
            @click="handleExport('gpx')"
          >
            GPX
          </button>
          <button
            class="top-bar-export-item"
            :disabled="!savedTrackId"
            data-testid="top-bar-export-kml"
            @click="handleExport('kml')"
          >
            KML
          </button>
          <button
            class="top-bar-export-item"
            :disabled="!savedTrackId"
            data-testid="top-bar-export-geojson"
            @click="handleExport('geojson')"
          >
            GeoJSON
          </button>
        </div>
      </div>

      <button
        class="top-bar-save-btn"
        :disabled="!canSave || saving"
        data-testid="top-bar-save"
        @click="$emit('save')"
      >
        {{ saving ? "Saving..." : "Save" }}
      </button>
    </div>

    <div
      v-if="shouldShowGraphStatus"
      class="top-bar-status"
      data-testid="top-bar-status"
    >
      <span v-if="graphLoading">Loading graph{{ graphProgress > 0 ? ` ${graphProgress}%` : "" }}</span>
      <template v-else>
        <span class="top-bar-status-warning">
          {{ graphError || "Routing is currently unavailable" }}
        </span>
        <div
          v-if="graphError && routingMode === 'auto'"
          class="top-bar-status-actions"
        >
          <button
            class="top-bar-status-action"
            data-testid="top-bar-reload-graph"
            @click="$emit('reloadGraph')"
          >
            Reload
          </button>
          <button
            class="top-bar-status-action"
            data-testid="top-bar-switch-to-manual"
            @click="$emit('switchToManual')"
          >
            Manual
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  trackName: { type: String, default: "" },
  totalPoints: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  manualRoutingPercent: { type: Number, default: 0 },
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  savedTrackId: { type: [String, null], default: null },
  routingMode: { type: String, default: "manual" },
  snapToRoadMode: { type: String, default: "auto" },
  routingProfile: { type: String, default: "hiking" },
  showDistanceMarkers: { type: Boolean, default: false },
  graphLoading: { type: Boolean, default: false },
  graphError: { type: String, default: null },
  graphProgress: { type: Number, default: 0 },
});

const emit = defineEmits([
  "save",
  "export",
  "toggleRouting",
  "setSnapToRoadMode",
  "setRoutingProfile",
  "toggleDistanceMarkers",
  "reloadGraph",
  "switchToManual",
]);

const showOverflowMenu = ref(false);
const rootElement = ref(null);
const overflowToggle = ref(null);
const overflowPanel = ref(null);
const overflowMenuStyle = ref({});

const resolvedTrackName = computed(
  () => props.trackName?.trim() || "Untitled track"
);

const distanceDisplay = computed(() => {
  if (props.totalDistanceKm < 1) {
    return `${Math.round(props.totalDistanceKm * 1000)} m`;
  }

  return `${props.totalDistanceKm.toFixed(2)} km`;
});

const timeDisplay = computed(() => {
  const mins = props.estimatedTimeMinutes;
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = Math.floor(mins / 60);
  const rest = Math.round(mins % 60);
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
});

const shouldShowGraphStatus = computed(() => {
  if (props.graphLoading) {
    return true;
  }

  if (!props.graphError) {
    return false;
  }

  return (
    props.routingMode === "auto" ||
    props.manualRoutingPercent > 0 ||
    props.totalPoints > 1
  );
});

function handleExport(format) {
  handleCloseOverflow();
  emit("export", format);
}

function handleCloseOverflow(returnFocus = false) {
  showOverflowMenu.value = false;
  overflowMenuStyle.value = {};

  if (returnFocus) {
    nextTick(() => overflowToggle.value?.focus());
  }
}

function updateOverflowMenuPosition() {
  if (!showOverflowMenu.value || !overflowToggle.value) {
    return;
  }

  const toggleRect = overflowToggle.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const horizontalPadding = viewportWidth <= 768 ? 16 : 12;
  const maxWidth = Math.min(320, viewportWidth - horizontalPadding * 2);
  const left = Math.min(
    Math.max(horizontalPadding, toggleRect.right - maxWidth),
    viewportWidth - maxWidth - horizontalPadding
  );
  const top = Math.min(toggleRect.bottom + 8, viewportHeight - 24);

  overflowMenuStyle.value = {
    position: "fixed",
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(maxWidth)}px`,
    minWidth: "0",
    maxWidth: `${Math.round(maxWidth)}px`,
    right: "auto",
  };
}

function toggleOverflowMenu() {
  showOverflowMenu.value = !showOverflowMenu.value;

  if (showOverflowMenu.value) {
    nextTick(() => {
      updateOverflowMenuPosition();
      const firstFocusable = overflowPanel.value?.querySelector(
        "input, select, button:not([disabled])"
      );
      firstFocusable?.focus();
    });
  }
}

function handleViewportChange() {
  updateOverflowMenuPosition();
}

function handleDocumentPointerDown(event) {
  if (!showOverflowMenu.value) {
    return;
  }

  if (!rootElement.value?.contains(event.target)) {
    handleCloseOverflow();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("scroll", handleViewportChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  window.removeEventListener("resize", handleViewportChange);
  window.removeEventListener("scroll", handleViewportChange, true);
});
</script>

<style scoped>
.track-editor-top-bar {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "context metrics controls"
    "status status status";
  gap: 10px 14px;
  align-items: center;
  padding: 12px 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
}

.top-bar-context {
  grid-area: context;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.top-bar-track-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top-bar-track-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #0f172a;
}

.top-bar-eyebrow {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}

.top-bar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 0.8rem;
  font-weight: 600;
}

.top-bar-metrics {
  grid-area: metrics;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 0.84rem;
}

.metric-chip--warning {
  background: #fff7ed;
  color: #c2410c;
}

.top-bar-controls {
  grid-area: controls;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  align-self: stretch;
}

.top-bar-ghost-btn,
.top-bar-save-btn {
  border-radius: 12px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: #fff;
  color: #0f172a;
  padding: 9px 12px;
  font-size: 0.9rem;
}

.top-bar-ghost-btn,
.top-bar-save-btn {
  cursor: pointer;
}

.top-bar-save-btn {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
  font-weight: 600;
}

.top-bar-overflow-group {
  position: relative;
}

.top-bar-overflow-menu {
  position: fixed;
  display: grid;
  gap: 4px;
  width: min(320px, calc(100vw - 24px));
  min-width: 220px;
  max-width: calc(100vw - 24px);
  max-height: min(65vh, 420px);
  overflow-y: auto;
  padding: 6px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(203, 213, 225, 0.9);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
  z-index: 20;
  box-sizing: border-box;
}

.top-bar-menu-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  color: #334155;
  font-size: 0.9rem;
}

.top-bar-select {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  padding: 8px 10px;
  font-size: 0.9rem;
}

.top-bar-export-item {
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
}

.top-bar-export-item:hover {
  background: #eff6ff;
}

.top-bar-ghost-btn:disabled,
.top-bar-save-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.top-bar-status {
  grid-area: status;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 0.8rem;
  min-height: 18px;
}

.top-bar-status-warning {
  color: #b45309;
}

.top-bar-status-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.top-bar-status-action {
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  padding: 4px 8px;
  font-size: 0.78rem;
  cursor: pointer;
}

.top-bar-status-action:hover {
  background: rgba(241, 245, 249, 1);
}

@media (max-width: 1100px) {
  .track-editor-top-bar {
    grid-template-columns: 1fr;
    grid-template-areas:
      "context"
      "metrics"
      "controls"
      "status";
  }

  .top-bar-controls {
    justify-content: flex-start;
    align-self: auto;
  }
}

@media (max-width: 768px) {
  .track-editor-top-bar {
    padding: 11px 13px;
  }

  .top-bar-context,
  .top-bar-controls {
    justify-content: flex-start;
  }

  .top-bar-metrics {
    gap: 6px;
  }

  .metric-chip {
    font-size: 0.8rem;
    padding: 5px 9px;
  }

  .top-bar-overflow-menu {
    width: min(320px, calc(100vw - 32px));
    min-width: 0;
    max-width: calc(100vw - 32px);
  }
}
</style>
