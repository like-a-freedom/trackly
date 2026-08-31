<template>
  <aside
    class="track-editor-left-panel"
    data-testid="track-editor-left-panel"
  >
    <!-- ─── Header: name + metrics + actions ─── -->
    <header class="panel-header">
      <div class="panel-track-info">
        <div
          class="panel-track-name"
          data-testid="panel-track-name"
        >
          {{ resolvedTrackName }}
        </div>
        <div class="panel-metrics">
          <span data-testid="panel-distance">{{ distanceDisplay }}</span>
          <span class="panel-metrics-sep">·</span>
          <span data-testid="panel-time">{{ timeDisplay }}</span>
          <span class="panel-metrics-sep">·</span>
          <span data-testid="panel-points">{{ totalPoints }} pts</span>
        </div>
      </div>
      <div class="panel-header-actions">
        <!-- Export dropdown -->
        <div
          ref="exportRef"
          class="panel-export-wrap"
        >
          <button
            class="panel-ghost-btn"
            :class="{ 'panel-ghost-btn--active': showExportMenu }"
            :disabled="!savedTrackId"
            title="Export track"
            data-testid="panel-export-toggle"
            @click="showExportMenu = !showExportMenu"
          >
            ↓
          </button>
          <div
            v-if="showExportMenu"
            class="panel-export-menu"
            data-testid="panel-export-menu"
          >
            <button
              data-testid="panel-export-gpx"
              @click="handleExport('gpx')"
            >
              GPX
            </button>
            <button
              data-testid="panel-export-kml"
              @click="handleExport('kml')"
            >
              KML
            </button>
            <button
              data-testid="panel-export-geojson"
              @click="handleExport('geojson')"
            >
              GeoJSON
            </button>
          </div>
        </div>
        <button
          class="panel-save-btn"
          :disabled="!canSave || saving"
          data-testid="panel-save"
          @click="$emit('save')"
        >
          {{ saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </header>

    <!-- ─── Alerts ─── -->
    <div
      v-if="showDraftBanner || !!error || showRoutingStatus"
      class="panel-alerts"
    >
      <div
        v-if="showDraftBanner"
        class="panel-alert panel-alert--draft"
        data-testid="panel-alert-draft"
      >
        <div class="panel-alert-body">
          <strong>Unsaved draft found</strong>
          <span>Restore or remove before starting fresh.</span>
        </div>
        <div class="panel-alert-btns">
          <button
            class="panel-alert-btn panel-alert-btn--primary"
            data-testid="top-alert-restore-draft"
            @click="$emit('restoreDraft')"
          >
            Restore
          </button>
          <button
            class="panel-alert-btn"
            data-testid="top-alert-delete-draft"
            @click="$emit('deleteDraft')"
          >
            Delete
          </button>
        </div>
      </div>
      <div
        v-if="error"
        class="panel-alert panel-alert--error"
        role="alert"
      >
        <strong>{{ error }}</strong>
      </div>
      <div
        v-if="showRoutingStatus"
        class="panel-alert panel-alert--warning"
      >
        <span v-if="graphLoading">
          Loading routing{{ graphProgress > 0 ? ` ${graphProgress}%` : "…" }}
        </span>
        <span v-else>⚠️ Routing unavailable</span>
      </div>
    </div>

    <!-- ─── Tabs ─── -->
    <nav
      class="panel-tabs"
      aria-label="Panel sections"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="panel-tab"
        :class="{ 'panel-tab--active': activeTab === tab.id }"
        :data-testid="`panel-tab-${tab.id}`"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- ─── Tab content ─── -->
    <div class="panel-content">
      <!-- Segments tab -->
      <div
        v-show="activeTab === 'segments'"
        class="panel-tab-body"
      >
        <div
          v-if="totalPoints < 2 && !showDraftBanner"
          class="panel-empty-tip"
          data-testid="panel-tip"
        >
          Click on the map to draw your first point
        </div>
        <TrackEditorSegmentsCard
          :segment-stats="segmentStats"
          :active-segment-index="activeSegmentIndex"
          :highlighted-segment-index="highlightedSegmentIndex"
          @add-segment="$emit('addSegment')"
          @set-active-segment="$emit('setActiveSegment', $event)"
          @hover-segment="$emit('hoverSegment', $event)"
          @leave-segment="$emit('leaveSegment')"
          @update-segment-name="$emit('updateSegmentName', ...$event)"
          @update-segment-color="$emit('updateSegmentColor', ...$event)"
          @join-segments="$emit('joinSegments', ...$event)"
          @new-track-from-segment="$emit('newTrackFromSegment', $event)"
          @reverse-segment="$emit('reverseSegment', $event)"
          @delete-segment="$emit('deleteSegment', $event)"
        />
      </div>

      <!-- Info tab: metadata + actions -->
      <div
        v-show="activeTab === 'info'"
        class="panel-tab-body"
      >
        <TrackEditorMetaCard
          :track-name="trackName"
          :track-description="trackDescription"
          :track-categories="trackCategories"
          :total-points="totalPoints"
          @update:track-name="$emit('update:trackName', $event)"
          @update:track-description="$emit('update:trackDescription', $event)"
          @update:track-categories="$emit('update:trackCategories', $event)"
        />
        <div class="panel-inner-divider" />
        <TrackEditorActionsCard
          :total-distance-km="totalDistanceKm"
          :estimated-time-minutes="estimatedTimeMinutes"
          :total-points="totalPoints"
          :segment-count="segmentStats.length"
          :poi-count="pois.length"
          :fragment-info="fragmentInfo"
          :optimizer-target-ratio="optimizerTargetRatio"
          :optimizer-preview="optimizerPreview"
          :optimizer-stats="optimizerStats"
          :optimizer-loading="optimizerLoading"
          :optimizer-error="optimizerError"
          @duplicate-track="$emit('duplicateTrack')"
          @reverse-track="$emit('reverseTrack')"
          @close-loop="$emit('closeLoop')"
          @close-loop-same-way="$emit('closeLoopSameWay')"
          @close-loop-different-route="$emit('closeLoopDifferentRoute')"
          @update:optimizer-target-ratio="
            $emit('update:optimizerTargetRatio', $event)
          "
          @preview-optimization="$emit('previewOptimization')"
          @apply-optimization="$emit('applyOptimization')"
          @clear-optimization="$emit('clearOptimization')"
          @download-optimization="$emit('downloadOptimization')"
          @clear-fragment="$emit('clearFragment')"
          @reroute-fragment="$emit('rerouteFragment')"
          @delete-fragment-connect="$emit('deleteFragmentConnect')"
          @delete-fragment-split="$emit('deleteFragmentSplit')"
          @reverse-fragment="$emit('reverseFragment')"
          @export-fragment="$emit('exportFragment')"
        />
      </div>

      <!-- Elevation tab -->
      <div
        v-show="activeTab === 'elevation'"
        class="panel-tab-body"
      >
        <TrackEditorChartCard
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
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import TrackEditorActionsCard from "./TrackEditorActionsCard.vue";
import TrackEditorChartCard from "./TrackEditorChartCard.vue";
import TrackEditorMetaCard from "./TrackEditorMetaCard.vue";
import TrackEditorSegmentsCard from "./TrackEditorSegmentsCard.vue";

const props = defineProps({
  // Track identity
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
  totalPoints: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  manualRoutingPercent: { type: Number, default: 0 },
  // Save state
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  savedTrackId: { type: [String, null], default: null },
  // Routing status
  routingMode: { type: String, default: "manual" },
  graphLoading: { type: Boolean, default: false },
  graphError: { type: String, default: null },
  graphProgress: { type: Number, default: 0 },
  // Alerts
  showDraftBanner: { type: Boolean, default: false },
  error: { type: String, default: null },
  // Segments
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  highlightedSegmentIndex: { type: Number, default: null },
  // POIs
  pois: { type: Array, default: () => [] },
  // Elevation
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
  coordinateData: { type: Array, default: () => [] },
  // Fragment & optimizer
  fragmentInfo: { type: Object, default: null },
  optimizerTargetRatio: { type: Number, default: 0.1 },
  optimizerPreview: { type: Object, default: null },
  optimizerStats: { type: Object, default: null },
  optimizerLoading: { type: Boolean, default: false },
  optimizerError: { type: String, default: null },
});

const emit = defineEmits([
  "save",
  "export",
  "restoreDraft",
  "deleteDraft",
  "update:trackName",
  "update:trackDescription",
  "update:trackCategories",
  "updateSegmentName",
  "updateSegmentColor",
  "addSegment",
  "deleteSegment",
  "reverseSegment",
  "setActiveSegment",
  "joinSegments",
  "newTrackFromSegment",
  "hoverSegment",
  "leaveSegment",
  "clearFragment",
  "deleteFragmentConnect",
  "deleteFragmentSplit",
  "reverseFragment",
  "rerouteFragment",
  "exportFragment",
  "closeLoop",
  "closeLoopSameWay",
  "closeLoopDifferentRoute",
  "reverseTrack",
  "duplicateTrack",
  "update:optimizerTargetRatio",
  "previewOptimization",
  "applyOptimization",
  "clearOptimization",
  "downloadOptimization",
  "chart-point-hover",
  "chart-point-leave",
  "chart-point-click",
]);

const activeTab = ref("segments");
const showExportMenu = ref(false);
const exportRef = ref(null);

const tabs = [
  { id: "segments", label: "Segments" },
  { id: "info", label: "Info" },
  { id: "elevation", label: "Elevation" },
];

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

const showRoutingStatus = computed(() => {
  if (props.graphLoading) return true;
  if (!props.graphError) return false;
  return (
    props.routingMode === "auto" ||
    props.manualRoutingPercent > 0 ||
    props.totalPoints > 1
  );
});

function handleExport(format) {
  showExportMenu.value = false;
  emit("export", format);
}

function handleOutsideClick(e) {
  if (exportRef.value && !exportRef.value.contains(e.target)) {
    showExportMenu.value = false;
  }
}

onMounted(() => document.addEventListener("pointerdown", handleOutsideClick));
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", handleOutsideClick)
);
</script>

<style scoped>
/* ── Container ── */
.track-editor-left-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.1),
    0 2px 8px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ── Header ── */
.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.75);
  background: rgba(255, 255, 255, 0.99);
  min-height: 0;
}

.panel-track-info {
  flex: 1;
  min-width: 0;
}

.panel-track-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.panel-metrics {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  font-size: 0.72rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.panel-metrics-sep {
  color: #cbd5e1;
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.panel-ghost-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 9px;
  background: transparent;
  color: #475569;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.12s, border-color 0.12s;
}

.panel-ghost-btn:hover:not(:disabled) {
  background: rgba(241, 245, 249, 1);
  border-color: #93c5fd;
}

.panel-ghost-btn--active {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #2563eb;
}

.panel-ghost-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Export dropdown */
.panel-export-wrap {
  position: relative;
}

.panel-export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  min-width: 110px;
  padding: 4px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-export-menu button {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #334155;
  font-size: 0.8125rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.panel-export-menu button:hover {
  background: #f1f5f9;
}

/* Save button */
.panel-save-btn {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 9px;
  background: #2563eb;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s, opacity 0.12s;
  flex-shrink: 0;
}

.panel-save-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.panel-save-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Alerts ── */
.panel-alerts {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.75);
}

.panel-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 14px;
  font-size: 0.78rem;
  line-height: 1.35;
}

.panel-alert--draft {
  background: #fffbeb;
  color: #92400e;
}

.panel-alert--error {
  background: #fef2f2;
  color: #991b1b;
}

.panel-alert--warning {
  background: #fff7ed;
  color: #9a3412;
}

.panel-alert-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.panel-alert-body strong {
  font-weight: 700;
}

.panel-alert-body span {
  font-size: 0.72rem;
  opacity: 0.85;
}

.panel-alert-btns {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.panel-alert-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 7px;
  background: transparent;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
  transition: background-color 0.1s;
}

.panel-alert-btn:hover {
  background: rgba(0, 0, 0, 0.07);
}

.panel-alert-btn--primary {
  background: #d97706;
  border-color: #d97706;
  color: #fff;
}

.panel-alert-btn--primary:hover {
  background: #b45309;
  border-color: #b45309;
}

/* ── Tabs ── */
.panel-tabs {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  border-bottom: 1px solid rgba(226, 232, 240, 0.75);
  background: rgba(248, 250, 252, 0.6);
}

.panel-tab {
  flex: 1;
  height: 37px;
  padding: 0;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.79rem;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.12s;
  letter-spacing: -0.01em;
}

.panel-tab:hover {
  color: #334155;
}

.panel-tab--active {
  color: #2563eb;
  font-weight: 650;
}

.panel-tab--active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 12%;
  right: 12%;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #2563eb;
}

/* ── Content ── */
.panel-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.panel-tab-body {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 10px 14px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
}

.panel-tab-body::-webkit-scrollbar {
  width: 4px;
}

.panel-tab-body::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.4);
  border-radius: 4px;
}

.panel-inner-divider {
  height: 1px;
  background: rgba(226, 232, 240, 0.8);
  margin: 8px 0;
}

.panel-empty-tip {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 500;
  text-align: center;
}
</style>
