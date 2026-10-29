<template>
  <div
    class="track-detail-flyout ui-reveal"
    :class="{ closing: isClosing, collapsed: isCollapsed }"
    @wheel="handleWheel"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @mousedown.stop
    @mouseup.stop
    @click.stop
    @dblclick.stop
    @selectstart.stop
    @dragstart.prevent
  >
    <!-- Panel Controls "Tab" - only when collapsed -->
    <div v-show="isCollapsed" class="panel-controls-tab">
      <button
        class="collapse-toggle-btn"
        title="Expand panel"
        aria-label="Expand panel"
        @click="toggleCollapse"
      >
        <!-- Arrow pointing up for expand -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M16.59,15.42L12,10.83L7.41,15.42L6,14L12,8L18,14L16.59,15.42Z"
          />
        </svg>
      </button>
    </div>

    <div
      ref="flyoutContent"
      class="flyout-content"
      @wheel="handleContentWheel"
      @touchstart.stop
      @touchmove="handleContentTouchMove"
      @touchend.stop
      @mousedown.stop
      @mouseup.stop
      @selectstart.stop
      @dragstart.prevent
    >
      <!-- Collapsible content -->
      <div v-show="!isCollapsed" class="collapsible-content ui-reveal">
        <!-- Track Header -->
        <div class="track-header">
          <!-- Name Edit Mode -->
          <div
            v-if="isEditingName"
            class="name-edit-block"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @dblclick.stop
            @selectstart.stop
            @dragstart.prevent
          >
            <input
              ref="nameInput"
              v-model="editedName"
              class="edit-name-input"
              aria-label="Track name"
              placeholder="Enter track name..."
              maxlength="255"
              @keydown.enter="saveName"
              @keydown.esc="cancelEditName"
              @mousedown.stop
              @mouseup.stop
              @click.stop
              @dblclick.stop
              @selectstart.stop
              @dragstart.prevent
            />
            <div
              class="edit-name-actions"
              @mousedown.stop
              @mouseup.stop
              @click.stop
              @dblclick.stop
              @selectstart.stop
              @dragstart.prevent
            >
              <button :disabled="savingName" class="save-btn" @click="saveName">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                {{ savingName ? "Saving..." : "Save" }}
              </button>
              <button
                :disabled="savingName"
                class="cancel-btn"
                @click="cancelEditName"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Cancel
              </button>
            </div>
            <div v-if="nameError" class="edit-name-error">
              {{ nameError }}
            </div>
          </div>

          <!-- Name Display Mode -->
          <div v-else class="track-name-block" :class="{ editable: isOwner }">
            <div class="title-with-edit">
              <h2>{{ track.name || "Unnamed Track" }}</h2>
              <button
                v-if="isOwner"
                class="edit-name-btn"
                title="Edit track name"
                @click="startEditName"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                  />
                  <path
                    d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                  />
                </svg>
              </button>
            </div>
            <div class="header-actions grouped">
              <div
                class="action-group track-actions"
                aria-label="Track actions"
              >
                <button
                  class="share-track-btn"
                  :disabled="copyingLink"
                  :title="copyingLink ? 'Copying...' : 'Copy shareable link'"
                  aria-label="Share track"
                  @click="shareTrack"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.53 1.53"
                    />
                    <path
                      d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.53-1.53"
                    />
                  </svg>
                </button>
                <button
                  class="export-gpx-btn"
                  :disabled="exportDisabled"
                  :title="
                    exportingTrack
                      ? 'Exporting...'
                      : exportCooldown > 0
                      ? `Export disabled: wait ${exportCooldown}s`
                      : 'Export track as GPX file'
                  "
                  aria-label="Export GPX"
                  @click="exportTrack"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7,10 12,15 17,10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  v-if="isOwner"
                  class="edit-track-geometry-btn"
                  title="Edit track geometry"
                  aria-label="Edit track geometry"
                  @click="goToEditor"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                    />
                    <path
                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                    />
                  </svg>
                </button>
                <button
                  v-if="isOwner"
                  class="delete-track-btn"
                  title="Delete track permanently"
                  aria-label="Delete track"
                  @click="confirmDelete"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
              <div class="divider" aria-hidden="true" />
              <div
                class="action-group panel-actions"
                aria-label="Panel layout controls"
              >
                <button
                  class="collapse-toggle-btn"
                  title="Collapse panel"
                  aria-label="Collapse panel"
                  @click="toggleCollapse"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"
                    />
                  </svg>
                </button>
                <button
                  class="close-button"
                  title="Close panel"
                  aria-label="Close panel"
                  @click="handleClose"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 4L4 12M4 4L12 12"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

        <!-- Basic Track Info, Map Overlays, Statistics (extracted to StatisticsPanel) -->
        <StatisticsPanel
          :track="track"
          :is-owner="isOwner"
          :speed-unit="speedUnit"
          :formatted-distance="formattedDistance"
          :formatted-duration="formattedDuration"
          :formatted-moving-avg-speed="formattedMovingAvgSpeed"
          :formatted-moving-avg-pace="formattedMovingAvgPace"
          :distance-markers-enabled="distanceMarkersEnabled"
          @speed-unit-change="setSpeedUnit"
          @distance-markers-toggle="handleDistanceMarkersToggle"
        />


          <!-- Description Edit Mode -->
          <div
            v-if="isEditingDescription"
            class="description-edit-block"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @dblclick.stop
            @selectstart.stop
            @dragstart.prevent
          >
            <textarea
              ref="descriptionTextarea"
              v-model="editedDescription"
              class="edit-description-input"
              placeholder="Add a description for this track..."
              @keydown.ctrl.enter="saveDescription"
              @keydown.esc="cancelEditDescription"
              @mousedown.stop
              @mouseup.stop
              @click.stop
              @dblclick.stop
              @selectstart.stop
              @dragstart.prevent
            />
            <div
              class="edit-description-actions"
              @mousedown.stop
              @mouseup.stop
              @click.stop
              @dblclick.stop
              @selectstart.stop
              @dragstart.prevent
            >
              <button
                :disabled="savingDescription"
                class="save-btn"
                @click="saveDescription"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                {{ savingDescription ? "Saving..." : "Save" }}
              </button>
              <button
                :disabled="savingDescription"
                class="cancel-btn"
                @click="cancelEditDescription"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Cancel
              </button>
            </div>
            <div v-if="descriptionError" class="edit-description-error">
              {{ descriptionError }}
            </div>
          </div>

          <!-- Description Display Mode -->
          <div
            v-else-if="track.description || isOwner"
            class="track-description-block"
            :class="{ editable: isOwner, empty: !track.description && isOwner }"
          >
            <div class="description-content">
              <p
                v-if="track.description"
                class="track-description-text"
                v-html="processedDescription"
              />
              <p v-else-if="isOwner" class="track-description-placeholder">
                No description added yet
              </p>
            </div>
            <button
              v-if="isOwner"
              class="edit-description-btn"
              :title="
                track.description ? 'Edit description' : 'Add description'
              "
              @click.stop="startEditDescription"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                />
                <path
                  d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Categories (extracted to CategoriesPanel component) -->
        <CategoriesPanel
          :track="track"
          :is-owner="isOwner"
          :categories-list="categoriesList"
          :save-categories="handleCategoriesUpdated"
        />

        <!-- Auto Classifications -->
        <div
          v-if="
            track.auto_classifications && track.auto_classifications.length > 0
          "
          class="stats-section"
        >
          <div class="section-header-with-tooltip">
            <h3>Auto classifications</h3>
            <span
              class="info-icon"
              tabindex="0"
              data-tooltip="Track types automatically classified by the system based on track characteristics"
              aria-label="Track types automatically classified by the system based on track characteristics"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          </div>
          <div class="auto-classifications">
            <span
              v-for="classification in track.auto_classifications"
              :key="classification"
              class="classification-tag"
            >
              {{ formatClassification(classification) }}
            </span>
          </div>
        </div>

        <!-- Elevation Stats with Chart (extracted to ElevationPanel) -->
        <ElevationPanel
          :track="track"
          :is-owner="isOwner"
          :coordinate-data="coordinateData"
          :parsed-time-data="parsedTimeData"
          :chart-mode="chartMode"
          :chart-update-key="chartUpdateKey"
          :distance-unit="distanceUnit"
          :is-polling-for-elevation="isPollingForElevation"
          :enriching-elevation="enrichingElevation"
          @force-enrich-elevation="forceEnrichElevation"
          @stop-elevation-polling="stopElevationPolling"
          @chart-mode-change="chartMode = $event"
          @chart-point-hover="(payload) => emit('chart-point-hover', payload)"
          @chart-point-leave="(payload) => emit('chart-point-leave', payload)"
          @chart-point-click="(payload) => emit('chart-point-click', payload)"
        />

        <!-- Slope Analysis Section -->
        <div
          v-if="hasSlopeData"
          class="stats-section"
          data-testid="slope-section"
        >
          <h3 data-testid="slope-analysis-title">Slope Analysis</h3>
          <div class="slope-stats-grid" data-testid="slope-stats-grid">
            <div
              v-if="track.slope_max !== undefined && track.slope_max !== null"
              class="stat-item"
              data-testid="max-uphill-slope"
            >
              <span class="stat-label">Max uphill slope</span>
              <span class="stat-value"
                >+{{ Math.abs(track.slope_max).toFixed(1) }}%</span
              >
            </div>
            <div
              v-if="track.slope_min !== undefined && track.slope_min !== null"
              class="stat-item"
              data-testid="max-downhill-slope"
            >
              <span class="stat-label">Max downhill slope</span>
              <span class="stat-value">{{ track.slope_min.toFixed(1) }}%</span>
            </div>
            <div
              v-if="track.slope_avg !== undefined && track.slope_avg !== null"
              class="stat-item"
              data-testid="avg-slope"
            >
              <span class="stat-label">Avg slope</span>
              <span class="stat-value"
                >{{ track.slope_avg >= 0 ? "+" : ""
                }}{{ track.slope_avg.toFixed(1) }}%</span
              >
            </div>
            <div
              v-if="slopeDistributionStats.uphillPercent !== undefined"
              class="stat-item"
              data-testid="uphill-distance"
            >
              <span class="stat-label">Uphill distance</span>
              <span class="stat-value"
                >{{ slopeDistributionStats.uphillPercent.toFixed(1) }}%</span
              >
            </div>
            <div
              v-if="slopeDistributionStats.steepUphillPercent !== undefined"
              class="stat-item"
              data-testid="steep-uphill"
            >
              <span class="stat-label">Steep uphill (>8%)</span>
              <span class="stat-value"
                >{{
                  slopeDistributionStats.steepUphillPercent.toFixed(1)
                }}%</span
              >
            </div>
            <div
              v-if="slopeDistributionStats.steepDownhillPercent !== undefined"
              class="stat-item"
              data-testid="steep-downhill"
            >
              <span class="stat-label">Steep downhill (&lt;-8%)</span>
              <span class="stat-value"
                >{{
                  slopeDistributionStats.steepDownhillPercent.toFixed(1)
                }}%</span
              >
            </div>
          </div>
        </div>

        <!-- Track Metadata (extracted to TrackInfoPanel) -->
        <TrackInfoPanel :track="track" />
      </div>
      <!-- End collapsible-content -->
    </div>
  </div>
</template>

<script setup>
import { TRACK_CATEGORIES } from "../domain/trackCategories";
import {
  ref,
  computed,
  nextTick,
  watch,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import Multiselect from "@vueform/multiselect";
import "@vueform/multiselect/themes/default.css";
import ElevationChart from "./ElevationChart.vue";
import {
  formatDuration as utilFormatDuration,
  formatDistance,
  convertUrlsToLinks,
  formatDateTime,
} from "../utils/format";
import { getSessionId, sessionHeaders } from "../utils/session";
import {
  validateSpeedData,
  formatSpeed,
  formatPace,
  calculatePaceFromSpeed,
} from "../utils/format";
import { useTracks } from "../composables/useTracks";
import { useUnitsStore } from "../stores/units.js";
import { events } from "../events";
import { useMemoizedComputed } from "../composables/useMemoization";
import { clearCacheByPattern } from "../composables/useMemoization";
import { useAdvancedDebounce } from "../composables/useAdvancedDebounce";
import { useTooltipPlacement } from "../composables/useTooltipPlacement";
import { useElevationEnrichment } from "../composables/useElevationEnrichment";
import { http } from "../http-instance";
import { useToastStore } from "@/stores/toast";
import { useConfirm } from "../composables/useConfirm";
import CategoriesPanel from "./TrackDetailPanel/CategoriesPanel.vue";
import ElevationPanel from "./TrackDetailPanel/ElevationPanel.vue";
import StatisticsPanel from "./TrackDetailPanel/StatisticsPanel.vue";
import TrackInfoPanel from "./TrackDetailPanel/TrackInfoPanel.vue";

const props = defineProps({
  track: {
    type: Object,
    required: true,
  },
  isOwner: {
    type: Boolean,
    default: false,
  },
  sessionId: {
    type: String,
    default: "",
  },
  coordinateData: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  "close",
  "description-updated",
  "name-updated",
  "categories-updated",
  "distance-markers-updated",
  "deleted",
  "chart-point-hover",
  "chart-point-leave",
  "chart-point-click",
]);
const route = useRoute();
const router = useRouter();
const isClosing = ref(false);
const isCollapsed = ref(false);
// Use global unit management
const unitsStore = useUnitsStore();
const speedUnit = computed(() => unitsStore.speedUnit);
const distanceUnit = computed(() => unitsStore.distanceUnit);
const paceUnit = computed(() => unitsStore.paceUnit);
const { setSpeedUnit, convertPace } = unitsStore;
// Use toast notifications
const toastStore = useToastStore();
const { showToast } = toastStore;
// Use confirm dialogs
const { showConfirm } = useConfirm();

const categoriesList = TRACK_CATEGORIES;
const chartMode = ref("elevation");
const chartUpdateKey = ref(Date.now()); // Force chart updates
const flyoutContent = ref(null);
const descriptionTextarea = ref(null);
const nameInput = ref(null);

const track = ref(props.track);

// Icon tooltips (extracted to composables/useTooltipPlacement)
const { attach: attachIconTooltips, detach: detachIconTooltips } =
  useTooltipPlacement(flyoutContent);

// Elevation enrichment + polling (extracted to composables/useElevationEnrichment)
const {
  enrichingElevation,
  enrichmentPollingInterval,
  isPollingForElevation,
  startElevationPolling,
  stopElevationPolling,
  pollForElevationData,
  forceEnrichElevation,
} = useElevationEnrichment({
  track,
  chartUpdateKey,
  hasElevationData: () => hasElevationData.value,
  sessionId: () => props.sessionId,
  showConfirm,
  showToast,
});

// --- Name editing state ---
const isEditingName = ref(false);
const editedName = ref("");
const savingName = ref(false);
const nameError = ref("");

// Reset panel state on mount to fix re-opening issues
onMounted(() => {
  isClosing.value = false;
  isCollapsed.value = false;

  // Do not auto-start polling on mount by default to avoid unnecessary repeated requests.
  // Polling is started manually via the 'Force update elevation' control or when the backend explicitly indicates in-progress state.
  // Setup tooltip handlers within this panel
  attachIconTooltips();
});

// NOTE: We do not auto-start polling on component activation.

// Cleanup on unmount
onUnmounted(() => {
  stopElevationPolling();
  // Detach tooltip handlers
  detachIconTooltips();
  // Clear export cooldown timer if active
  if (exportCooldownInterval) {
    clearInterval(exportCooldownInterval);
    exportCooldownInterval = null;
  }
  // Remove stop polling listener
  events.off("stop-elevation-polling", stopElevationPolling);
});

onDeactivated(() => {
  stopElevationPolling();
});

// Listen for signal from parent (TrackView) to stop polling when deactivating
onMounted(() => {
  events.on("stop-elevation-polling", stopElevationPolling);
});

// Reset panel state when track changes
watch(
  () => props.track?.id,
  () => {
    isClosing.value = false;
    isCollapsed.value = false;
  }
);

// Reset panel state when returning to track view (handles same track re-opening)
watch(
  () => route.path,
  (newPath) => {
    if (newPath && newPath.startsWith("/track/")) {
      isClosing.value = false;
      isCollapsed.value = false;
    }
  }
);

// --- Description editing state ---
const isEditingDescription = ref(false);
const editedDescription = ref("");
const savingDescription = ref(false);
const descriptionError = ref("");

// --- Categories state (handled by CategoriesPanel component) ---
const distanceMarkersEnabled = ref(true);

const {
  updateTrackCategories,
  updateTrackInPolylines,
  updateTrackDistanceMarkers,
} = useTracks();

watch(
  () => props.track?.distance_markers_enabled,
  (nextValue) => {
    distanceMarkersEnabled.value = nextValue !== false;
  },
  { immediate: true }
);

async function handleDistanceMarkersToggle(event) {
  if (!props.track?.id) return;
  const nextValue = !!event.target.checked;
  distanceMarkersEnabled.value = nextValue;

  try {
    await updateTrackDistanceMarkers(props.track.id, nextValue);
    track.value = { ...track.value, distance_markers_enabled: nextValue };
    emit("distance-markers-updated", nextValue);
    showToast(
      nextValue ? "Distance markers enabled" : "Distance markers hidden",
      "success"
    );
  } catch (err) {
    distanceMarkersEnabled.value =
      track.value?.distance_markers_enabled !== false;
    showToast(err.message || "Failed to update overlays", "error");
  }
}

// Handle categories update from CategoriesPanel component
async function handleCategoriesUpdated(categoryValues) {
  await updateTrackCategories(props.track.id, categoryValues);

  // Update local track data only after persistence succeeds.
  track.value = { ...track.value, categories: categoryValues };

  // Update the track in polylines list if it exists.
  updateTrackInPolylines(props.track.id, { categories: categoryValues });

  emit("categories-updated", categoryValues);
  showToast("Categories updated", "success");
}

// --- Export state ---
const exportingTrack = ref(false);
const deletingTrack = ref(false);

// Client-side export cooldown (seconds remaining);
// value is set from server 'X-Export-Rate-Limit-Seconds' on success
// or from 'Retry-After' header when a 429 is returned.
const exportCooldown = ref(0);
let exportCooldownInterval = null;

const exportDisabled = computed(
  () => exportingTrack.value || exportCooldown.value > 0
);

function startExportCooldown(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return;
  if (exportCooldownInterval) {
    clearInterval(exportCooldownInterval);
    exportCooldownInterval = null;
  }
  exportCooldown.value = seconds;
  exportCooldownInterval = setInterval(() => {
    if (exportCooldown.value <= 1) {
      clearInterval(exportCooldownInterval);
      exportCooldownInterval = null;
      exportCooldown.value = 0;
    } else {
      exportCooldown.value -= 1;
    }
  }, 1000);
}

// --- Share state ---
const copyingLink = ref(false);
const linkCopied = ref(false);

// Computed property to safely parse time data
const parsedTimeData = computed(() => {
  const timeData = track.value?.time_data;
  if (!timeData) return [];

  if (Array.isArray(timeData)) {
    return timeData;
  }

  if (typeof timeData === "string") {
    try {
      const parsed = JSON.parse(timeData);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("[TrackDetailPanel] Failed to parse time_data string:", e);
      return [];
    }
  }

  return [];
});
const hasSpeedData = useMemoizedComputed(
  (track) => {
    return (
      (track?.avg_speed !== undefined && track?.avg_speed !== null) ||
      (track?.max_speed !== undefined && track?.max_speed !== null)
    );
  },
  [() => props.track],
  {
    keyFn: (deps) =>
      `speed_${deps[0]?.id}_${deps[0]?.avg_speed}_${deps[0]?.max_speed}`,
  }
);

const hasElevationData = useMemoizedComputed(
  (track) => {
    // Check for elevation profile data (most important)
    if (track?.elevation_profile && track?.elevation_profile.length > 0) {
      return true;
    }

    // Check for meaningful elevation stats (not just zeros)
    const hasElevationGain =
      track?.elevation_gain !== undefined &&
      track?.elevation_gain !== null &&
      track?.elevation_gain > 0;
    const hasElevationLoss =
      track?.elevation_loss !== undefined &&
      track?.elevation_loss !== null &&
      Math.abs(track?.elevation_loss) > 0;

    return hasElevationGain || hasElevationLoss;
  },
  [() => props.track],
  {
    keyFn: (deps) => {
      const track = deps[0];
      if (!track) return "elevation_null";
      const profileHash = track.elevation_profile
        ? `${track.elevation_profile.length}_${JSON.stringify(
            track.elevation_profile.slice(0, 2)
          )}`
        : "null";
      return `elevation_${track.id}_${profileHash}_${track.elevation_gain}_${
        track.elevation_loss
      }_${track.elevation_enriched}_${track.elevation_enriched_at}_${
        track._lastUpdated || "0"
      }`;
    },
  }
);

const hasHeartRateData = useMemoizedComputed(
  (track) => {
    // Check for heart rate profile data
    if (track?.hr_data && track?.hr_data.length > 0) {
      return true;
    }

    // Check for meaningful heart rate stats (not just zeros)
    const hasAvgHr =
      track?.avg_hr !== undefined &&
      track?.avg_hr !== null &&
      track?.avg_hr > 0;
    const hasMaxHr =
      track?.max_hr !== undefined &&
      track?.max_hr !== null &&
      track?.max_hr > 0;

    return hasAvgHr || hasMaxHr;
  },
  [() => props.track],
  {
    keyFn: (deps) => {
      const track = deps[0];
      if (!track) return "hr_null";
      const hrDataHash = track.hr_data
        ? `${track.hr_data.length}_${JSON.stringify(track.hr_data.slice(0, 2))}`
        : "null";
      return `hr_${track.id}_${hrDataHash}_${track.avg_hr}_${track.max_hr}`;
    },
  }
);

const hasTemperatureData = useMemoizedComputed(
  (track) => {
    // Check for temperature profile data
    if (track?.temp_data && track?.temp_data.length > 0) {
      return track.temp_data.some(
        (temp) =>
          temp !== null && temp !== undefined && typeof temp === "number"
      );
    }
    return false;
  },
  [() => props.track],
  {
    keyFn: (deps) => {
      const track = deps[0];
      if (!track) return "temp_null";
      const tempDataHash = track.temp_data
        ? `${track.temp_data.length}_${JSON.stringify(
            track.temp_data.slice(0, 2)
          )}`
        : "null";
      return `temp_${track.id}_${tempDataHash}`;
    },
  }
);

const hasPaceData = useMemoizedComputed(
  (track) => {
    console.log("[TrackDetailPanel] Checking pace data for track:", track?.id, {
      paceData: track?.pace_data ? "present" : "missing",
      avgSpeed: track?.avg_speed,
      movingAvgSpeed: track?.moving_avg_speed,
    });

    // Check for backend-calculated pace data first
    if (
      track?.pace_data &&
      Array.isArray(track.pace_data) &&
      track.pace_data.length > 0
    ) {
      console.log(
        "[TrackDetailPanel] Found backend-calculated pace data:",
        track.pace_data.length,
        "points"
      );
      return true;
    }

    // Fallback: check if we have aggregate speed data that frontend can use to estimate pace
    if (track?.avg_speed && track?.avg_speed > 0) {
      console.log(
        "[TrackDetailPanel] Found avg_speed for pace calculation:",
        track.avg_speed
      );
      return true;
    }

    if (track?.moving_avg_speed && track?.moving_avg_speed > 0) {
      console.log(
        "[TrackDetailPanel] Found moving_avg_speed for pace calculation:",
        track.moving_avg_speed
      );
      return true;
    }

    console.log("[TrackDetailPanel] No suitable pace data found");
    return false;
  },
  [() => props.track],
  {
    keyFn: (deps) => {
      const [track] = deps;
      if (!track) return "pace_null";
      const paceDataHash = track.pace_data
        ? `pace_array_${track.pace_data.length}`
        : "null";
      return `pace_${track.id}_${paceDataHash}_${track.avg_speed}_${track.moving_avg_speed}`;
    },
  }
);

const hasSlopeData = computed(() => {
  const track = props.track;

  // Check for slope segments data
  if (track?.slope_segments && track?.slope_segments.length > 0) {
    const hasSlope = track.slope_segments.some(
      (segment) =>
        segment &&
        typeof segment === "object" &&
        typeof segment.slope_percent === "number"
    );
    return hasSlope;
  }

  // Check if slope metrics are available
  const hasMetrics = track?.slope_min !== null && track?.slope_max !== null;
  return hasMetrics;
});

// Calculate slope distribution statistics from histogram
const slopeDistributionStats = computed(() => {
  const track = props.track;

  if (!track?.slope_histogram || !Array.isArray(track.slope_histogram)) {
    return {
      uphillPercent: undefined,
      steepUphillPercent: undefined,
      steepDownhillPercent: undefined,
    };
  }

  let totalDistance = 0;
  let uphillDistance = 0;
  let steepUphillDistance = 0; // >8%
  let steepDownhillDistance = 0; // <-8%

  track.slope_histogram.forEach((bucket) => {
    if (bucket && typeof bucket.distance_m === "number") {
      const distance = bucket.distance_m;
      const bucketFrom = bucket.bucket_from || 0;
      const bucketTo = bucket.bucket_to || 0;

      totalDistance += distance;

      // Count uphill (positive slope)
      if (bucketFrom > 0 || bucketTo > 0) {
        uphillDistance += distance;
      }

      // Count steep uphill (>8%)
      if (bucketFrom > 8) {
        steepUphillDistance += distance;
      }

      // Count steep downhill (<-8%)
      if (bucketTo < -8) {
        steepDownhillDistance += distance;
      }
    }
  });

  if (totalDistance === 0) {
    return {
      uphillPercent: undefined,
      steepUphillPercent: undefined,
      steepDownhillPercent: undefined,
    };
  }

  return {
    uphillPercent: (uphillDistance / totalDistance) * 100,
    steepUphillPercent: (steepUphillDistance / totalDistance) * 100,
    steepDownhillPercent: (steepDownhillDistance / totalDistance) * 100,
  };
});

// Combined check for elevation section visibility
const hasElevationOrHeartRateData = computed(() => {
  return (
    hasElevationData.value ||
    hasHeartRateData.value ||
    hasTemperatureData.value ||
    hasPaceData.value ||
    hasSlopeData.value
  );
});

// Dynamic chart title based on available data - memoized
const chartTitle = useMemoizedComputed(
  (hasElevation, hasHR, hasTemp, hasPace, trackName) => {
    const dataTypes = [];
    if (hasElevation) dataTypes.push("Elevation");
    if (hasHR) dataTypes.push("Heart Rate");
    if (hasTemp) dataTypes.push("Temperature");
    if (hasPace) dataTypes.push("Pace");

    if (dataTypes.length > 1) {
      return `${trackName} - ${dataTypes.join(" & ")}`;
    } else if (dataTypes.length === 1) {
      return `${trackName} - ${dataTypes[0]} Profile`;
    } else {
      return `${trackName} - Profile`;
    }
  },
  [
    () => hasElevationData.value,
    () => hasHeartRateData.value,
    () => hasTemperatureData.value,
    () => hasPaceData.value,
    () => props.track?.name || "Unnamed Track",
  ],
  {
    keyFn: (deps) => `charttitle_${deps.join("_")}`,
  }
);

// Watch for track changes
watch(
  () => props.track,
  (newTrack, oldTrack) => {
    track.value = newTrack;

    // Ensure any existing polling is stopped when track changes
    if (newTrack && newTrack.id !== oldTrack?.id) {
      stopElevationPolling();
      console.info(
        `[TrackDetailPanel] Track changed to ${newTrack.id} - auto-polling disabled (manual start only)`
      );
      // We intentionally do NOT auto-start polling. Polling should be started
      // only via explicit user action or external signals to avoid excessive background requests.
    }
  }
);

// Watch for elevation data changes in the prop (for updates from parent)
watch(
  () => [
    props.track?.elevation_enriched,
    props.track?.elevation_gain,
    props.track?.elevation_loss,
    props.track?.elevation_profile,
    props.track?.slope_segments,
    props.track?.slope_min,
    props.track?.slope_max,
  ],
  (newVals, oldVals) => {
    // Update local track if prop changed
    if (props.track && props.track !== track.value) {
      console.info(
        `[TrackDetailPanel] Data updated via prop for track ${props.track.id}`
      );

      // Force complete track update with new object reference
      track.value = { ...props.track };

      // Stop polling if elevation data is now available
      if (props.track.elevation_enriched && isPollingForElevation.value) {
        stopElevationPolling();
      }
    } else if (
      newVals &&
      oldVals &&
      JSON.stringify(newVals) !== JSON.stringify(oldVals)
    ) {
      // If the reference is the same but data changed, force reactivity
      console.info(
        `[TrackDetailPanel] Data values changed for track ${props.track?.id}`
      );
      track.value = { ...props.track };
    }
  },
  { deep: false }
);

const escapeHtml = (text) => {
  if (!text) return "";
  return text.replace(/[&<>"]/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return map[char] || char;
  });
};

// Processed description with clickable links (escaped first for safety)
const processedDescription = computed(() => {
  if (!track.value?.description) return "";
  const escaped = escapeHtml(track.value.description);
  return convertUrlsToLinks(escaped);
});

// Distance formatting - memoized
const formattedDistance = useMemoizedComputed(
  (lengthKm, distanceUnit) => {
    if (lengthKm === undefined || lengthKm === null) {
      return "N/A";
    }
    return formatDistance(lengthKm, distanceUnit);
  },
  [() => track.value?.length_km, () => distanceUnit.value],
  {
    keyFn: (deps) => `distance_${deps[0]}_${deps[1]}`,
  }
);

// Duration formatting - memoized
const formattedDuration = useMemoizedComputed(
  (durationSeconds) => {
    return utilFormatDuration(durationSeconds);
  },
  [() => track.value?.duration_seconds],
  {
    keyFn: (deps) => `duration_${deps[0]}`,
  }
);

// Speed formatting - memoized
const formattedAvgSpeed = useMemoizedComputed(
  (avgSpeed, speedUnitValue) => {
    if (!validateSpeedData(avgSpeed)) return "N/A";
    return formatSpeed(avgSpeed, speedUnitValue);
  },
  [() => track.value?.avg_speed, () => speedUnit.value],
  {
    keyFn: (deps) => `avgspeed_${deps[0]}_${deps[1]}`,
  }
);

const formattedMaxSpeed = useMemoizedComputed(
  (maxSpeed, speedUnitValue) => {
    if (!validateSpeedData(maxSpeed)) return "N/A";
    return formatSpeed(maxSpeed, speedUnitValue);
  },
  [() => track.value?.max_speed, () => speedUnit.value],
  {
    keyFn: (deps) => `maxspeed_${deps[0]}_${deps[1]}`,
  }
);

// Pace formatting - memoized
const formattedAvgPace = useMemoizedComputed(
  (avgSpeed, paceUnit) => {
    if (!validateSpeedData(avgSpeed)) return "N/A";
    return calculatePaceFromSpeed(avgSpeed, paceUnit);
  },
  [() => track.value?.avg_speed, () => paceUnit.value],
  {
    keyFn: (deps) => `avgpace_${deps[0]}_${deps[1]}`,
  }
);

const formattedBestPace = useMemoizedComputed(
  (maxSpeed, paceUnit) => {
    if (!validateSpeedData(maxSpeed)) return "N/A";
    return calculatePaceFromSpeed(maxSpeed, paceUnit);
  },
  [() => track.value?.max_speed, () => paceUnit.value],
  {
    keyFn: (deps) => `bestpace_${deps[0]}_${deps[1]}`,
  }
);

// Moving speed and pace formatting - memoized
const formattedMovingAvgSpeed = useMemoizedComputed(
  (movingAvgSpeed, speedUnitValue) => {
    if (!validateSpeedData(movingAvgSpeed)) return "N/A";
    return formatSpeed(movingAvgSpeed, speedUnitValue);
  },
  [() => track.value?.moving_avg_speed, () => speedUnit.value],
  {
    keyFn: (deps) => `movingavgspeed_${deps[0]}_${deps[1]}`,
  }
);

const formattedMovingAvgPace = useMemoizedComputed(
  (movingAvgPace, paceUnit) => {
    if (
      movingAvgPace === undefined ||
      movingAvgPace === null ||
      movingAvgPace <= 0
    )
      return "N/A";
    const convertedPace = convertPace(movingAvgPace);
    if (convertedPace === null) return "N/A";
    return formatPace(convertedPace, paceUnit);
  },
  [() => track.value?.moving_avg_pace, () => paceUnit.value],
  {
    keyFn: (deps) => `movingavgpace_${deps[0]}_${deps[1]}`,
  }
);

// Elevation calculations - memoized
const elevationGain = useMemoizedComputed(
  (elevationGain, elevationLoss) => {
    if (
      elevationGain === undefined ||
      elevationGain === null ||
      elevationLoss === undefined ||
      elevationLoss === null
    ) {
      return null;
    }

    const gain = elevationGain - Math.abs(elevationLoss);
    return gain >= 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0);
  },
  [() => track.value?.elevation_gain, () => track.value?.elevation_loss],
  {
    keyFn: (deps) => `elevgain_${deps[0]}_${deps[1]}`,
  }
);

// Debounced API functions to prevent excessive requests
const debouncedSaveName = useAdvancedDebounce(
  async (trackId, name, sessionId) => {
    const response = await http(`/api/tracks/${trackId}/name`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: name.trim(), session_id: sessionId }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("You are not allowed to edit this track name.");
      } else {
        throw new Error("Failed to update track name.");
      }
    }
  },
  500,
  { leading: false, trailing: true }
);

const debouncedSaveDescription = useAdvancedDebounce(
  async (trackId, description, sessionId) => {
    const response = await http(`/api/tracks/${trackId}/description`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description, session_id: sessionId }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("You are not allowed to edit this description.");
      } else {
        throw new Error("Failed to update description.");
      }
    }
  },
  500,
  { leading: false, trailing: true }
);

function startEditName() {
  isEditingName.value = true;
  editedName.value = track.value.name || "";
  nameError.value = "";

  // Auto-focus on next tick
  nextTick(() => {
    if (nameInput.value) {
      nameInput.value.focus();
      nameInput.value.select(); // Select all text for easy replacement
    }
  });
}
function goToEditor() {
  if (!props.track?.id) return;
  router.push({ name: "TrackEdit", params: { id: props.track.id } });
}
async function confirmDelete() {
  if (deletingTrack.value) return;
  if (!track.value?.id) return;

  const proceed = await showConfirm({
    title: "Delete Track",
    message: "Delete track? This action cannot be undone.",
    confirmText: "Delete",
    cancelText: "Cancel",
  });

  if (!proceed) return;
  try {
    deletingTrack.value = true;
    const res = await http(`/api/tracks/${track.value.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: track.value.name || "",
        session_id: props.sessionId,
      }),
    });
    if (res.status === 204) {
      const deletedId = track.value.id; // preserve before close
      // Emit locally
      emit("deleted", deletedId);
      // Also dispatch global event so views (e.g., HomeView) can react if this panel is on another route
      events.emit("track-deleted", { id: deletedId });
      emit("close");
    } else if (res.status === 403) {
      showToast("You are not allowed to delete this track.", "error");
    } else if (res.status === 404) {
      showToast("Track not found or already deleted.", "error");
    } else {
      showToast("Failed to delete track.", "error");
    }
  } catch (err) {
    console.error("Delete track error", err);
    showToast("Error deleting track.", "error");
  } finally {
    deletingTrack.value = false;
  }
}

function cancelEditName() {
  isEditingName.value = false;
  nameError.value = "";
}

async function saveName() {
  if (!editedName.value.trim()) {
    nameError.value = "Track name cannot be empty.";
    return;
  }

  savingName.value = true;
  nameError.value = "";

  try {
    await debouncedSaveName(track.value.id, editedName.value, props.sessionId);

    // Update local track object immediately for reactive UI
    track.value.name = editedName.value.trim();
    emit("name-updated", editedName.value.trim());

    // Dispatch global event for other components (like HomeView tooltip)
    events.emit("track-name-updated", {
      trackId: track.value.id,
      newName: editedName.value.trim(),
    });

    isEditingName.value = false;
  } catch (err) {
    nameError.value = err.message || "Network error.";
  } finally {
    savingName.value = false;
  }
}

function startEditDescription() {
  isEditingDescription.value = true;
  editedDescription.value = track.value.description || "";
  descriptionError.value = "";

  // Auto-focus and auto-resize on next tick
  nextTick(() => {
    if (descriptionTextarea.value) {
      descriptionTextarea.value.focus();
      autoResizeTextarea();
    }
  });
}

function autoResizeTextarea() {
  if (descriptionTextarea.value) {
    descriptionTextarea.value.style.height = "auto";
    descriptionTextarea.value.style.height =
      Math.min(descriptionTextarea.value.scrollHeight, 300) + "px";
  }
}

function cancelEditDescription() {
  isEditingDescription.value = false;
  descriptionError.value = "";
}
async function saveDescription() {
  savingDescription.value = true;
  descriptionError.value = "";

  try {
    await debouncedSaveDescription(
      track.value.id,
      editedDescription.value,
      props.sessionId
    );

    // Update local track object immediately for reactive UI
    track.value.description = editedDescription.value;
    emit("description-updated", editedDescription.value);

    // Dispatch global event for other components (like HomeView tooltip)
    events.emit("track-description-updated", {
      trackId: track.value.id,
      newDescription: editedDescription.value,
    });

    isEditingDescription.value = false;
  } catch (err) {
    descriptionError.value = err.message || "Network error.";
  } finally {
    savingDescription.value = false;
  }
}

// Utility functions - memoized for performance
// Date formatting function

function formatClassification(classification) {
  // Format classification with proper capitalization
  return classification
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDataset(dataset) {
  if (!dataset) return "Unknown";

  // Handle common dataset names
  const datasetNames = {
    original_gpx: "Original GPX",
    original: "Original",
    aster30m: "ASTER 30m",
    srtm30m: "SRTM 30m",
    srtm90m: "SRTM 90m",
    mapzen: "Mapzen",
    eudem25m: "EU-DEM 25m",
    ned10m: "NED 10m",
    "open-elevation": "Open-Elevation",
  };

  return (
    datasetNames[dataset] || dataset.charAt(0).toUpperCase() + dataset.slice(1)
  );
}

// Export track as GPX
async function exportTrack() {
  if (!track.value?.id) return;

  exportingTrack.value = true;
  try {
    // Include session header so backend can apply per-session rate limits when available
    const headers = sessionHeaders(props.sessionId || getSessionId());

    const response = await http(`/api/tracks/${track.value.id}/export`, {
      headers,
    });

    // Handle rate-limited responses (HTTP 429). Show a toast and start client cooldown based on Retry-After header.
    if (response && response.status === 429) {
      let retry = null;
      try {
        if (
          response &&
          response.headers &&
          typeof response.headers.get === "function"
        ) {
          retry = response.headers.get("retry-after");
        } else if (response && response.headers instanceof Map) {
          retry = response.headers.get("retry-after");
        }
      } catch (e) {
        retry = null;
      }
      const seconds = retry ? parseInt(retry, 10) : 10;
      if (!isNaN(seconds) && seconds > 0) startExportCooldown(seconds);
      showToast(
        `Please wait ${seconds} seconds before exporting again.`,
        "error"
      );
      return;
    }

    if (!response.ok) {
      throw new Error("Failed to export track");
    }

    // Read server-provided cooldown header (if any)
    let cooldown = null;
    try {
      if (
        response &&
        response.headers &&
        typeof response.headers.get === "function"
      ) {
        cooldown =
          response.headers.get("x-export-rate-limit-seconds") ||
          response.headers.get("retry-after");
      } else if (response && response.headers instanceof Map) {
        cooldown =
          response.headers.get("x-export-rate-limit-seconds") ||
          response.headers.get("retry-after");
      }
    } catch (e) {
      cooldown = null;
    }
    const cooldownSeconds = cooldown ? parseInt(cooldown, 10) : null;

    // Get the GPX content as blob
    const blob = await response.blob();

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Determine filename: prefer Content-Disposition header filename, else sanitize track name preserving Unicode.
    function sanitizeFilename(name, fallback) {
      if (!name) return fallback;
      // Normalize to decompose combined characters, if available
      const normalized =
        name && typeof name.normalize === "function"
          ? name.normalize("NFKD")
          : name;
      // Allow Unicode letters/numbers, spaces, hyphens, underscores and dots; remove other characters
      const cleaned = String(normalized)
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[^\p{L}\p{N}\s_.-]+/gu, "");
      const collapsed = cleaned.trim().replace(/\s+/g, "_").replace(/_+/g, "_");
      const trimmed = collapsed.replace(/^\.+|\.+$/g, "");
      return trimmed || fallback;
    }

    // Try to extract filename from Content-Disposition header
    let filename = null;
    let disposition = null;
    try {
      if (response && response.headers) {
        if (typeof response.headers.get === "function") {
          disposition = response.headers.get("content-disposition");
        } else if (response.headers instanceof Map) {
          disposition = response.headers.get("content-disposition");
        }
      }
    } catch (e) {
      disposition = null;
    }

    if (disposition) {
      const m1 = disposition.match(/filename\*=UTF-8''([^;\n]+)/i);
      const m2 = disposition.match(/filename\s*=\s*"?([^";\n]+)"?/i);
      let rawName = null;
      if (m1) rawName = decodeURIComponent(m1[1]);
      else if (m2) rawName = m2[1];
      if (rawName) {
        // Strip path and extension
        rawName = rawName
          .split("/")
          .pop()
          .replace(/\.[^.]+$/, "");
        filename = sanitizeFilename(rawName, "");
      }
    }

    if (!filename) {
      const trackName = track.value && track.value.name ? track.value.name : "";
      // Try robust Unicode-preserving sanitization first (may throw if Unicode property escapes are not supported)
      try {
        const alt = trackName
          ? trackName
              .replace(/[^\p{L}\p{N}\s_.-]+/gu, "")
              .trim()
              .replace(/\s+/g, "_")
          : "";
        filename = sanitizeFilename(trackName, alt) || alt;
      } catch (e) {
        // Fallback to earlier sanitizer that may strip non-ASCII but guarantees a safe name
        filename = sanitizeFilename(trackName, "");
      }
    }

    // If filename is still empty use track-id; otherwise ensure it doesn't contain path separators or unsafe chars
    if (filename) {
      const unsafe = /[<>:"/\\|?*\x00-\x1F]/;
      if (unsafe.test(filename)) {
        const cleaned2 = filename
          .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "")
          .replace(/\s+/g, "_");
        filename = cleaned2 || `track-${track.value.id}`;
      }
    } else {
      filename = `track-${track.value.id}`;
    }

    link.download = `${filename}.gpx`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    window.URL.revokeObjectURL(url);

    // Start client cooldown if server provided one
    if (cooldownSeconds && !isNaN(cooldownSeconds) && cooldownSeconds > 0) {
      startExportCooldown(cooldownSeconds);
    }
  } catch (error) {
    console.error("Export failed:", error);
    // You could emit an error event here or show a toast notification
  } finally {
    exportingTrack.value = false;
  }
}

// Share track link
async function shareTrack() {
  if (!track.value?.id) return;

  copyingLink.value = true;
  try {
    // Create the shareable URL
    const trackUrl = `${window.location.origin}/track/${track.value.id}`;

    // Copy to clipboard
    await navigator.clipboard.writeText(trackUrl);

    // Show success feedback
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch (error) {
    console.error("Failed to copy link:", error);
    // Fallback for older browsers
    try {
      const textArea = document.createElement("textarea");
      textArea.value = `${window.location.origin}/track/${track.value.id}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);

      linkCopied.value = true;
      setTimeout(() => {
        linkCopied.value = false;
      }, 2000);
    } catch (fallbackError) {
      console.error("Fallback copy failed:", fallbackError);
    }
  } finally {
    copyingLink.value = false;
  }
}

function handleClose() {
  isClosing.value = true;
  // Stop any ongoing polling
  stopElevationPolling();
  setTimeout(() => {
    emit("close");
  }, 300); // Match this with CSS transition duration
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

// Touch handling state
const touchStartY = ref(0);
const touchStartScrollTop = ref(0);

// Prevent scroll propagation to the map behind
function handleWheel(event) {
  // Allow wheel events to bubble up only if the flyout-content can't scroll
  if (!flyoutContent.value) return;

  const { scrollTop, scrollHeight, clientHeight } = flyoutContent.value;
  const isAtTop = scrollTop === 0;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight;

  // Prevent propagation if scrolling within bounds
  if ((!isAtTop && event.deltaY < 0) || (!isAtBottom && event.deltaY > 0)) {
    event.stopPropagation();
  }
}

function handleContentWheel(event) {
  // Always stop propagation for content area
  event.stopPropagation();
}

// Touch event handlers for mobile devices
function handleTouchStart(event) {
  // Record the initial touch position and scroll position
  if (flyoutContent.value && event.touches.length === 1) {
    touchStartY.value = event.touches[0].clientY;
    touchStartScrollTop.value = flyoutContent.value.scrollTop;
  }
}

function handleTouchMove(event) {
  // Prevent default only if we're at the scroll boundaries
  if (!flyoutContent.value || event.touches.length !== 1) return;

  const touchY = event.touches[0].clientY;
  const touchDeltaY = touchStartY.value - touchY;
  const { scrollTop, scrollHeight, clientHeight } = flyoutContent.value;

  const isAtTop = scrollTop === 0;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1; // -1 for rounding

  // Prevent propagation if scrolling within bounds
  if ((!isAtTop || touchDeltaY > 0) && (!isAtBottom || touchDeltaY < 0)) {
    event.stopPropagation();
  }
}

function handleTouchEnd(event) {
  // Reset touch tracking
  touchStartY.value = 0;
  touchStartScrollTop.value = 0;
}

function handleContentTouchMove(event) {
  // Always stop propagation for content area to prevent map interaction
  if (!flyoutContent.value) return;

  const { scrollTop, scrollHeight, clientHeight } = flyoutContent.value;
  const canScroll = scrollHeight > clientHeight;

  if (canScroll) {
    // Let the content scroll naturally, but prevent map interaction
    event.stopPropagation();
  } else {
    // If content can't scroll, prevent the touch event entirely
    event.preventDefault();
    event.stopPropagation();
  }
}

// Watch for changes in editedDescription to auto-resize textarea
watch(editedDescription, () => {
  nextTick(() => {
    autoResizeTextarea();
  });
});

// Watch for track changes to set appropriate chart mode
watch(
  () => props.track,
  (newTrack) => {
    if (newTrack) {
      // Set chart mode based on available data
      const hasElevation = hasElevationData.value;
      const hasHR = hasHeartRateData.value;
      const hasTemp = hasTemperatureData.value;
      const hasPace = hasPaceData.value;
      const hasSlope = hasSlopeData.value;

      if (import.meta.env.DEV) {
        console.log("[TrackDetailPanel] Chart mode logic:", {
          currentMode: chartMode.value,
          hasElevation,
          hasSlope,
          hasHR,
          hasTemp,
          hasPace,
        });
      }

      if (hasElevation && (hasHR || hasTemp || hasPace)) {
        // If elevation and at least one other type are available, keep current mode or default to 'both'
        if (
          ![
            "elevation",
            "pulse",
            "temperature",
            "pace",
            "elevation-with-slope",
            "both",
          ].includes(chartMode.value)
        ) {
          chartMode.value = "both";
        }
      } else if (hasElevation && hasSlope) {
        // If we have both elevation and slope, only set elevation-with-slope if no valid mode is set
        if (!["elevation", "elevation-with-slope"].includes(chartMode.value)) {
          chartMode.value = "elevation-with-slope";
        }
      } else if (hasElevation) {
        if (!["elevation"].includes(chartMode.value)) {
          chartMode.value = "elevation";
        }
      } else if (hasHR) {
        chartMode.value = "pulse";
      } else if (hasTemp) {
        chartMode.value = "temperature";
      } else if (hasPace) {
        chartMode.value = "pace";
      }

      if (import.meta.env.DEV) {
        console.log("[TrackDetailPanel] Final chart mode:", chartMode.value);
      }
    }
  },
  { immediate: true }
);

// Expose methods for testing
defineExpose({
  pollForElevationData,
  startElevationPolling,
  stopElevationPolling,
  isPollingForElevation,
  enrichmentPollingInterval,
});
</script>

<style scoped>
.track-detail-flyout {
  position: fixed;
  inset-inline-start: 0;
  inset-inline-end: 0;
  inset-block-end: 0;
  z-index: 1001;
  background: oklch(100% 0 none / 0.98);
  border-start-start-radius: 18px;
  border-start-end-radius: 18px;
  box-shadow: 0 -4px 24px oklch(0% 0 none / 0.18);
  padding: 24px 0 0 0;
  width: 100vw;
  min-width: 100vw;
  max-width: 100vw;
  margin: 0;
  min-height: 200px;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  color: var(--color-ink);
  box-sizing: border-box;
  /* Prevent touch actions from propagating to map */
  touch-action: none;
}

.track-detail-flyout.closing {
  transform: translateY(100%);
  opacity: 0;
}

.track-detail-flyout.collapsed {
  min-height: 0px;
  max-height: 0px;
  padding: 0;
  overflow: visible;
}

.flyout-content {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0 20px 32px 20px;
  box-sizing: border-box;
  overflow-y: auto;
  flex: 1;
  /* Allow vertical scrolling only within content */
  touch-action: pan-y;
  /* Enable momentum scrolling on iOS */
  -webkit-overflow-scrolling: touch;
}

.track-detail-flyout.collapsed .flyout-content {
  padding: 0;
  overflow: clip;
  max-height: 0;
  min-height: 0;
  height: 0;
  opacity: 0;
}

.track-detail-flyout.collapsed .flyout-content * {
  margin: 0 !important;
  padding: 0 !important;
}

/* Custom scrollbar styling */
.flyout-content::-webkit-scrollbar {
  width: 6px;
}

.flyout-content::-webkit-scrollbar-track {
  background: transparent;
}

.flyout-content::-webkit-scrollbar-thumb {
  background: oklch(0% 0 none / 0.2);
  border-radius: 3px;
}

@media (hover: hover) and (pointer: fine) {
  .flyout-content::-webkit-scrollbar-thumb:hover {
    background: oklch(0% 0 none / 0.3);
  }
}

.panel-controls-tab {
  position: fixed;
  inset-block-end: 16px;
  inset-inline-end: 16px;
  z-index: 1300; /* Same as TrackFilterControl */
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--control-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--control-border);
  box-shadow: var(--control-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
}

@media (hover: hover) and (pointer: fine) {
  .panel-controls-tab:hover {
    /* Keep subtle transform but avoid highlighting the whole tab area
       — highlight will be applied to the inner button for consistency */
    transform: translateY(-1px);
  }
}

.collapse-toggle-btn {
  /* Match sizing, padding and hover area to other icon buttons like .close-button */
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-muted);
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  box-sizing: border-box;
  min-width: 28px;
  height: 28px;
}

/* When the collapse button is inside the floating tab, keep it small and centered */
.panel-controls-tab .collapse-toggle-btn {
  width: auto;
  height: auto;
  padding: 6px;
}

.close-button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-danger);
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  box-sizing: border-box;
}

@media (hover: hover) and (pointer: fine) {
  .close-button:hover {
    background: color-mix(in oklch, var(--color-danger) 10%, transparent);
    color: var(--color-danger);
    transform: scale(1.05);
  }

  .collapse-toggle-btn:hover {
    /* Neutral, subtle highlight to match other icon buttons */
    background: oklch(0% 0 none / 0.06);
    color: var(--color-ink);
    transform: scale(1.05);
  }
}

.collapse-toggle-btn:active {
  transform: scale(0.95);
}

.close-button:active {
  transform: scale(0.95);
}

/* Track Header */
.track-header {
  margin-block-end: 20px;
  position: relative;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions.grouped {
  gap: 16px;
}

.header-actions .action-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions .divider {
  width: 1px;
  align-self: stretch;
  background: linear-gradient(
    to bottom,
    oklch(0% 0 none / 0.08),
    oklch(0% 0 none / 0.15),
    oklch(0% 0 none / 0.08)
  );
  border-radius: 1px;
}

.share-track-btn {
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  font-size: 13px;
  gap: 6px;
}

@media (hover: hover) and (pointer: fine) {
  .share-track-btn:hover {
    background: color-mix(in oklch, var(--color-action) 10%, transparent);
    color: var(--accent);
    transform: scale(1.05);
  }
}

.share-track-btn:active {
  transform: scale(0.95);
}

.share-track-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.export-gpx-btn {
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

@media (hover: hover) and (pointer: fine) {
  .export-gpx-btn:hover {
    background: color-mix(in oklch, var(--color-action) 10%, transparent);
    color: var(--accent);
    transform: scale(1.05);
  }
}

.export-gpx-btn:active {
  transform: scale(0.95);
}

.export-gpx-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.delete-track-btn {
  background: none;
  border: none;
  color: var(--color-danger);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

@media (hover: hover) and (pointer: fine) {
  .delete-track-btn:hover {
    background: color-mix(in oklch, var(--color-danger) 10%, transparent);
    color: var(--color-danger);
    transform: scale(1.05);
  }
}

.edit-track-geometry-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

@media (hover: hover) and (pointer: fine) {
  .edit-track-geometry-btn:hover {
    background: color-mix(in oklch, var(--color-action) 10%, transparent);
    color: var(--color-action);
    transform: scale(1.05);
  }
}

.edit-track-geometry-btn:active {
  transform: scale(0.95);
}

.delete-track-btn:active {
  transform: scale(0.95);
}

.delete-track-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.track-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.6em;
  color: var(--color-ink);
  font-weight: 600;
}

/* Track Name */
.track-name-block {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-block-end: 12px;
}

.title-with-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-header .title-with-edit h2 {
  margin: 0;
  line-height: 1.2;
  font-size: 1.6em;
  color: var(--color-ink);
  font-weight: 600;
}

.track-name-block .header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (hover: hover) and (pointer: fine) {
  .track-name-block.editable:hover .edit-name-btn {
    opacity: 1;
  }
}

.edit-name-btn {
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

@media (hover: hover) and (pointer: fine) {
  .edit-name-btn:hover {
    background: oklch(95.5% 0 none);
    color: var(--accent-hover);
    transform: scale(1.05);
  }
}

.edit-name-btn:active {
  transform: scale(0.95);
}

/* Name Edit Mode */
.name-edit-block {
  background: oklch(98.2% 0.0017 none);
  border-radius: 12px;
  padding: 20px;
  margin: 0 0 18px 0;
  border: 2px solid oklch(95.3% 0.0218 239.4);
  box-shadow: 0 4px 16px color-mix(in oklch, var(--color-action) 8%, transparent);
}

.edit-name-input {
  width: 100%;
  font-size: 1.6em;
  font-weight: 600;
  color: var(--color-ink);
  background: var(--color-surface);
  border: 2px solid oklch(89.8% 0 none);
  border-radius: 8px;
  padding: 12px 16px;
  margin-block-end: 16px;
  font-family: inherit;
  box-sizing: border-box;
  transition:
    border-color 0.2s var(--ease-out, ease-out),
    box-shadow 0.2s var(--ease-out, ease-out);
}

.edit-name-input:focus-visible {
  /* A border-colour shift alone is not a focus indicator. The ring carries
     the state; the tint and lift are supporting cues. */
  outline: 2px solid var(--accent);
  outline-offset: -1px;
  border-color: var(--accent);
  background: var(--control-bg-solid);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--color-action) 18%, transparent);
}

.edit-name-actions {
  display: flex;
  gap: 12px;
  margin-block-end: 0;
}

.edit-name-actions button {
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 90px;
  justify-content: center;
}

.edit-name-error {
  color: oklch(56.8% 0.2002 26.4);
  font-size: 0.9em;
  margin-block-start: 8px;
  padding: 8px 12px;
  background: oklch(95.7% 0.0221 7.2);
  border-radius: 6px;
  border: 1px solid oklch(56.8% 0.2002 26.4);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Track Description */
.track-description-block {
  background: oklch(98.2% 0.0017 none);
  border-radius: 12px;
  padding: 16px 20px;
  margin: 0 0 18px 0;
  position: relative;
  border: 2px solid transparent;
}

.track-description-block.editable {
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .track-description-block.editable:hover {
    background: oklch(96.5% 0.0069 247.9);
    border-color: oklch(95.3% 0.0218 239.4);
    transform: translateY(-1px);
    box-shadow: 0 3px 12px color-mix(in oklch, var(--color-action) 8%, transparent);
  }
}

.track-description-block.empty {
  border: 2px dashed oklch(85.8% 0 none);
  background: oklch(98.5% 0 none);
}

@media (hover: hover) and (pointer: fine) {
  .track-description-block.empty:hover {
    border-color: var(--accent-hover);
    background: oklch(98.7% 0.0062 255.5);
  }
}

.description-content {
  padding-inline-end: 50px; /* Space for edit button */
}

.track-description-text {
  color: oklch(38.7% 0 none);
  font-size: 1.08em;
  line-height: 1.6;
  margin: 0;
  word-break: break-word;
  white-space: pre-wrap;
}

.track-description-placeholder {
  color: var(--color-muted);
  font-size: 1.08em;
  line-height: 1.6;
  margin: 0;
  font-style: italic;
}

.edit-description-btn {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: 12px;
  transform: translateY(-50%);
  background: color-mix(in oklch, var(--color-action) 10%, transparent);
  color: var(--color-action);
  border: none;
  border-radius: 6px;
  padding: 6px;
  font-size: 0;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

@media (hover: hover) and (pointer: fine) {
  .edit-description-btn:hover {
    background: color-mix(in oklch, var(--color-action) 20%, transparent);
    opacity: 1;
    transform: translateY(-50%) scale(1.05);
  }
}

.edit-description-btn:active {
  transform: translateY(-50%) scale(0.95);
}

.description-edit-block {
  background: oklch(98.2% 0.0017 none);
  border-radius: 12px;
  padding: 20px;
  margin: 0 0 18px 0;
  border: 2px solid oklch(95.3% 0.0218 239.4);
  box-shadow: 0 4px 16px color-mix(in oklch, var(--color-action) 8%, transparent);
}

.edit-description-input {
  width: 100%;
  min-height: 80px;
  max-height: 300px;
  border-radius: 8px;
  border: 2px solid oklch(89.8% 0 none);
  padding: 12px 16px;
  font-size: 1.08em;
  margin-block-end: 16px;
  resize: none;
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: inherit;
  box-sizing: border-box;
  line-height: 1.5;
  overflow-y: auto;
  transition:
    border-color 0.2s var(--ease-out, ease-out),
    box-shadow 0.2s var(--ease-out, ease-out);
}

.edit-description-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
  border-color: var(--accent);
  background: var(--control-bg-solid);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--color-action) 18%, transparent);
}

.edit-description-input::placeholder {
  color: var(--color-muted);
  font-style: italic;
}

.edit-description-actions {
  display: flex;
  gap: 12px;
  margin-block-end: 0;
}

.edit-description-actions button {
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 90px;
  justify-content: center;
}

.save-btn {
  background: var(--accent-hover);
  color: var(--color-surface);
  box-shadow: 0 2px 8px color-mix(in oklch, var(--color-action) 30%, transparent);
}

.save-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.save-btn:disabled {
  background: oklch(86.2% 0.0592 247);
  color: oklch(94.9% 0 none);
  cursor: not-allowed;
  box-shadow: none;
}

@media (hover: hover) and (pointer: fine) {
  .save-btn:not(:disabled):hover {
    background: var(--accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in oklch, var(--color-action) 40%, transparent);
  }
}

.cancel-btn {
  background: oklch(97% 0 none);
  color: var(--color-muted);
  border: 2px solid oklch(89.8% 0 none);
}

.cancel-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.cancel-btn:disabled {
  background: oklch(98.2% 0 none);
  color: oklch(84.5% 0 none);
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .cancel-btn:not(:disabled):hover {
    background: oklch(94.9% 0 none);
    border-color: oklch(79.2% 0 none);
    color: oklch(38.7% 0 none);
  }
}

.edit-description-error {
  color: oklch(56.8% 0.2002 26.4);
  font-size: 0.9em;
  margin-block-start: 8px;
  padding: 8px 12px;
  background: oklch(95.7% 0.0221 7.2);
  border-radius: 6px;
  border: 1px solid oklch(56.8% 0.2002 26.4);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Stats Sections */
:deep(.stats-section) {
  margin-block-end: 24px;
  padding-block-end: 20px;
  border-block-end: 1px solid oklch(94.9% 0 none);
}

:deep(.stats-section:last-of-type) {
  border-block-end: none;
}

:deep(.stats-section h3) {
  margin: 0 0 12px 0;
  font-size: 1.3em;
  color: var(--color-ink);
  font-weight: 600;
}

:deep(.section-header-with-tooltip) {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-block-end: 12px;
}

:deep(.section-header-with-tooltip h3) {
  margin: 0;
  font-size: 1.3em;
  color: var(--color-ink);
  font-weight: 600;
}

/* The info icon renders inside CategoriesPanel and StatisticsPanel, so every
   rule here needs :deep() — without it the scoped selector never matched
   and the icon rendered as bare text with no tooltip. */
:deep(.info-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  cursor: help;
  opacity: 0.7;
  transition:
    opacity 0.2s var(--ease-out, ease-out),
    color 0.2s var(--ease-out, ease-out),
    background-color 0.2s var(--ease-out, ease-out);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  position: relative;
}

@media (hover: hover) and (pointer: fine) {
  :deep(.info-icon:hover) {
    opacity: 1;
    color: var(--accent-hover);
    background-color: color-mix(in oklch, var(--color-action) 10%, transparent);
  }
}

/* Ensure tooltips work correctly for custom tooltip attr */
:deep(.info-icon[data-tooltip]) {
  position: relative;
}

/* Custom CSS tooltip */
:deep(.info-icon::after) {
  content: attr(data-tooltip);
  position: absolute;
  /* Anchored below the icon rather than above it: these hints sit inside a
     panel header where "above" would cover the track name and description. */
  inset-block-start: calc(100% + 8px);
  inset-inline-start: 0;
  transform: none;
  background: var(--color-surface);
  color: var(--color-ink);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
  width: max-content;
  max-width: 220px;
  overflow-wrap: break-word;
  word-break: break-word;
  text-align: left;
  box-sizing: border-box;
  z-index: 10000;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.2s var(--ease-out, ease-out),
    visibility 0.2s var(--ease-out, ease-out);
  box-shadow: 0 2px 12px oklch(0% 0 none / 0.15);
  border: 1px solid oklch(90.7% 0 none);
}

@media (hover: hover) and (pointer: fine) {
  :deep(.info-icon:hover::after) {
    opacity: 1;
    visibility: visible;
  }
}

:deep(.info-icon:focus-visible::after) {
  opacity: 1;
  visibility: visible;
}

/* Tooltip arrow. Matches the bubble below the icon: the arrow sits directly
   under the icon, pointing up at it. */
:deep(.info-icon::before) {
  content: "";
  position: absolute;
  inset-inline-start: 8px;
  inset-block-start: calc(100% + 2px);
  border: 6px solid transparent;
  border-block-end-color: var(--color-surface);
  z-index: 10001;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.2s var(--ease-out, ease-out),
    visibility 0.2s var(--ease-out, ease-out);
  filter: drop-shadow(0 1px 1px oklch(0% 0 none / 0.1));
}

@media (hover: hover) and (pointer: fine) {
  :deep(.info-icon:hover::before) {
    opacity: 1;
    visibility: visible;
  }
}

:deep(.info-icon:focus-visible::before) {
  opacity: 1;
  visibility: visible;
}

:deep(.info-icon:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--color-action) 18%, transparent);
  color: var(--accent);
  background-color: color-mix(in oklch, var(--color-action) 8%, transparent);
}

.info-icon svg {
  pointer-events: none;
  width: 14px;
  height: 14px;
}

/* off-DOM measurement element for tooltip sizing (visually hidden) */
.info-icon__measure {
  position: absolute;
  inset-inline-start: -9999px;
  inset-block-start: -9999px;
  visibility: hidden;
  pointer-events: none;
  background: var(--color-surface);
  color: var(--color-ink);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
  width: max-content;
  max-width: 220px;
  overflow-wrap: break-word;
  word-break: break-word;
  text-align: left;
  box-sizing: border-box;
}

/* Unit and chart toggles live in StatisticsPanel, so they need :deep() for
   the same scope reason as the stat rows above. */
:deep(.section-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-block-end: 16px;
}

/* Unit Toggles */
:deep(.unit-toggles) {
  display: flex;
  background: oklch(95.5% 0 none);
  border-radius: 6px;
  padding: 2px;
}

:deep(.unit-toggle) {
  background: transparent;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
  color: var(--color-muted);
}

:deep(.unit-toggle.active) {
  background: oklch(100% 0 none);
  color: var(--color-ink);
  box-shadow: 0 1px 3px oklch(0% 0 none / 0.1);
}

@media (hover: hover) and (pointer: fine) {
  :deep(.unit-toggle:hover:not(.active)) {
    background: oklch(100% 0 none / 0.7);
  }
}

:deep(.unit-toggle:active) {
  transform: scale(0.97);
}

/* Chart Toggles */
:deep(.chart-toggles) {
  display: flex;
  background: oklch(95.5% 0 none);
  border-radius: 6px;
  padding: 2px;
}

:deep(.chart-toggle) {
  background: transparent;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
  color: var(--color-muted);
}

:deep(.chart-toggle.active) {
  background: oklch(100% 0 none);
  color: var(--color-ink);
  box-shadow: 0 1px 3px oklch(0% 0 none / 0.1);
}

@media (hover: hover) and (pointer: fine) {
  :deep(.chart-toggle:hover:not(.active):not(:disabled)) {
    background: oklch(100% 0 none / 0.7);
  }
}

:deep(.chart-toggle:active:not(:disabled)) {
  transform: scale(0.97);
}

:deep(.chart-toggle:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Header Actions Container */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Force Update Button */
.force-update-btn {
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  box-sizing: border-box;
}

@media (hover: hover) and (pointer: fine) {
  .force-update-btn:hover:not(:disabled) {
    background: color-mix(in oklch, var(--color-action) 10%, transparent);
    color: var(--accent);
    transform: scale(1.05);
  }

  .force-update-btn:hover:not(:disabled) svg {
    transform: rotate(180deg);
  }
}

.force-update-btn:active {
  transform: scale(0.95);
}

.force-update-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Stop Polling Button in Header */
.stop-polling-btn-header {
  background: none;
  border: none;
  color: var(--color-danger);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  box-sizing: border-box;
}

@media (hover: hover) and (pointer: fine) {
  .stop-polling-btn-header:hover {
    background: color-mix(in oklch, var(--color-danger) 10%, transparent);
    color: var(--color-danger);
    transform: scale(1.05);
  }
}

.stop-polling-btn-header:active {
  transform: scale(0.95);
}

/* Speed/Pace Grid */
.speed-pace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Basic Info Grid */
.basic-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* The Basic info / Elevation panels and the categories tags render inside
   CategoriesPanel and StatisticsPanel. Those child components carry their own
   scope id, so a bare selector in this scoped block never matched them and the
   stats, tabs and tags all fell back to unstyled defaults. :deep() crosses
   that boundary while keeping these rules in one place. */
:deep(.stats-section .stat-item) {
  background: oklch(98.2% 0.0017 none);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

:deep(.stats-section .stat-label) {
  font-size: 0.85em;
  color: var(--color-muted);
  font-weight: 500;
}

:deep(.stats-section .stat-value) {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--color-ink);
}

/* Elevation Stats */
:deep(.stats-section .elevation-stats) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-block-start: 16px;
}

/* Slope Stats Grid */
:deep(.stats-section .slope-stats-grid) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Chart Section within stats */
:deep(.stats-section .chart-section) {
  margin: 16px 0;
  border-radius: 8px;
  overflow: clip;
}

/* Heart Rate Stats */
:deep(.stats-section .hr-stats) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Categories. The read-only tag list renders inside .stats-section, so the
   selector keys off that rather than a .categories-section that does not
   exist in the DOM. */
:deep(.categories) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

:deep(.category-tag) {
  background: oklch(95.3% 0.0218 239.4);
  color: var(--color-action);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 500;
}

.category-tag.editable {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  background: oklch(95.3% 0.0218 239.4);
  border: 1px solid oklch(88.5% 0.0546 243.4);
  transition:
    background-color 0.2s var(--ease-out, ease-out),
    border-color 0.2s var(--ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .category-tag.editable:hover {
    background: oklch(88.5% 0.0546 243.4);
    border-color: oklch(81.6% 0.0896 243.6);
  }
}

.remove-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: oklch(0% 0 none / 0.1);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-action);
}

@media (hover: hover) and (pointer: fine) {
  .remove-tag:hover {
    background: oklch(0% 0 none / 0.2);
    transform: scale(1.1);
  }
}

.remove-tag:active {
  transform: scale(0.95);
}

.remove-tag svg {
  display: block;
}

/* Categories Inline Edit Mode */
.categories-inline-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start !important; /* Align multiselect to the left, not center or stretch */
  justify-content: flex-start !important;
}

/* Size the multiselect trigger to fit its tag contents instead of stretching to container */
.categories-inline-edit .track-category-select-inline {
  width: max-content; /* shrink to content width */
  min-width: 140px; /* sensible minimum for empty state */
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  align-self: flex-start !important; /* Force self-alignment to left */
  margin-inline-start: 0 !important; /* No start margin */
  margin-inline-end: auto !important; /* Push to start */
  --ms-tag-bg: oklch(69.6% 0.1491 162.5);
  --ms-tag-color: var(--color-surface);
  --ms-tag-radius: 4px;
  --ms-tag-font-size: 0.87rem;
  --ms-tag-font-weight: 600;
  font-size: 0.87rem;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: oklch(100% 0 none);
  min-height: 44px;
}

/* Mobile: fall back to full width for narrow screens */
@media (max-width: 700px) {
  .categories-inline-edit .track-category-select-inline {
    width: 100% !important;
    display: block;
  }
}

/* Mark the multiselect with a unique class for dropdown alignment */
.track-category-select-inline {
  position: relative;
}

/* Override multiselect wrapper centering - force left alignment */
/* Use :deep() to penetrate into the Multiselect component */
.categories-inline-edit
  .track-category-select-inline
  :deep(.multiselect-wrapper) {
  margin: 0 !important; /* Remove auto-centering margin */
  margin-inline-start: 0 !important;
  margin-inline-end: 0 !important;
}

/* Also target the multiselect root element itself */
.categories-inline-edit :deep(.multiselect) {
  margin: 0 !important;
  margin-inline-start: 0 !important;
  margin-inline-end: 0 !important;
}

/* The saving indicator pairs a spinner with the word "Saving...". Without an
   explicit box and flex-shrink: 0 the SVG flexes to fill the row and the text
   ends up riding along inside the rotating element. */
.saving-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: var(--color-muted);
  padding: 4px 0;
}

:deep(.saving-indicator .spinner) {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.edit-error {
  padding: 8px 12px;
  background: oklch(95.7% 0.0221 7.2);
  border: 1px solid oklch(65.4% 0.1926 25.1);
  border-radius: 6px;
  color: var(--color-danger);
  font-size: 0.9em;
}

.auto-classifications {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.classification-tag {
  background: oklch(93.8% 0.026 321.9);
  color: oklch(45.3% 0.1988 313);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 500;
}

/* Chart Section */
.chart-section {
  margin: 20px 0;
}

/* Chart Section within stats sections has different spacing */
.stats-section .chart-section {
  margin: 16px 0;
  border-radius: 8px;
  overflow: clip;
}

.elevation-profile-placeholder {
  height: 150px;
  background-color: oklch(95.5% 0 none);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--color-muted);
  font-style: italic;
}

:deep(.toggle-row) {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.95em;
  color: oklch(33.5% 0.0331 260.9);
}

:deep(.toggle-row input) {
  width: 16px;
  height: 16px;
}

/* Track Metadata — rendered by TrackInfoPanel, same scope reason as above. */
:deep(.track-metadata) {
  margin-block-start: 24px;
}

:deep(.track-metadata h3) {
  margin: 0 0 16px 0;
  font-size: 1.3em;
  color: var(--color-ink);
  font-weight: 600;
}

:deep(.metadata-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

:deep(.metadata-item) {
  background: oklch(98.2% 0.0017 none);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

:deep(.metadata-label) {
  font-size: 0.85em;
  color: var(--color-muted);
  font-weight: 500;
}

:deep(.metadata-value) {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--color-ink);
}

/* Panel controls responsive adjustments */
@media (max-width: 640px) {
  .panel-controls-tab {
    inset-block-end: 12px;
    inset-inline-end: 12px;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    /* Solid background for better visibility on mobile */
    background: var(--color-surface);
    backdrop-filter: none;
    border: 1px solid oklch(0% 0 none / 0.12);
    box-shadow: 0 4px 12px oklch(0% 0 none / 0.15);
  }

  .collapse-toggle-btn svg {
    width: 20px;
    height: 20px;
  }
}

/* Mobile responsiveness */
@media (max-width: 700px) {
  .track-detail-flyout {
    border-radius: 16px 16px 0 0;
    padding: 18px 0 0 0;
  }

  .flyout-content {
    padding: 0 16px 28px 16px;
  }

  .speed-pace-grid {
    grid-template-columns: 1fr;
  }

  .elevation-stats {
    grid-template-columns: 1fr;
  }

  .basic-info-grid {
    grid-template-columns: 1fr;
  }

  .hr-stats {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    align-self: flex-end;
    width: 100%;
    justify-content: flex-end;
  }

  .unit-toggles {
    align-self: flex-end;
  }
}

@media (max-width: 500px) {
  .metadata-grid {
    grid-template-columns: 1fr;
  }
}

/* Safari-specific mobile fixes */
@supports (-webkit-appearance: none) {
  @media (max-width: 640px) {
    .panel-controls-tab {
      background: var(--color-surface) !important;
      backdrop-filter: none !important;
      border: 1px solid oklch(0% 0 none / 0.12) !important;
      box-shadow: 0 4px 12px oklch(0% 0 none / 0.15) !important;
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
  }
}

/* Touch targets. The panel's icon buttons render at 28x28 for density, which
   is a cursor target. On touch the hit area grows to 44x44 while the icon
   stays the same size, so the visual weight does not change. */
@media (max-width: 640px), (pointer: coarse) {
  .close-button,
  .share-track-btn,
  .export-gpx-btn,
  .collapse-toggle-btn,
  .delete-track-btn,
  .edit-track-geometry-btn,
  .panel-controls-tab {
    min-width: 44px;
    height: 44px;
  }
}
@media(min-width:901px) {
 .track-detail-flyout { inset-inline-start:auto; inset-inline-end:0; inset-block-start:0; inset-block-end:0; width:380px; min-width:0; max-width:380px; min-height:0; max-height:100dvh; padding:20px 0 0; border-radius:0; box-shadow:none; border-inline-start:1px solid var(--color-line); background:var(--color-surface); }
 .track-detail-flyout.collapsed { inset-block-start:auto; width:44px; max-height:0; }
 .flyout-content { padding:0 20px 24px; }
 :deep(.basic-info-grid), :deep(.speed-pace-grid) { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
.track-name-block { flex-wrap:wrap; align-items:flex-start; }
 .title-with-edit { min-width:0; max-width:100%; flex:1 1 100%; }
 .track-header .title-with-edit h2 { overflow-wrap:anywhere; }
 .track-name-block .header-actions { flex:1 1 100%; width:100%; justify-content:flex-end; gap:4px; }
 .header-actions.grouped { gap:8px; flex-wrap:wrap; }

/* Motion is opt-in: transitions that move or scale an element, smooth panel
   scrolling and the saving spinner only run when the visitor has not asked for
   reduced motion. Color-only transitions stay ungated above. */
@media (prefers-reduced-motion: no-preference) {
  .track-detail-flyout {
    transition:
      transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.3s var(--ease-out, ease-out);
  }

  .flyout-content {
    scroll-behavior: smooth;
  }

  .panel-controls-tab {
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .collapse-toggle-btn {
    transition:
      background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .close-button,
  .share-track-btn,
  .export-gpx-btn,
  .delete-track-btn,
  .edit-track-geometry-btn,
  .stop-polling-btn-header,
  .force-update-btn {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      color 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  .edit-name-btn {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      color 0.2s var(--ease-out, ease-out),
      opacity 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  .edit-description-btn {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      opacity 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  .track-description-block {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      border-color 0.2s var(--ease-out, ease-out),
      box-shadow 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  .save-btn,
  .cancel-btn {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      border-color 0.2s var(--ease-out, ease-out),
      color 0.2s var(--ease-out, ease-out),
      box-shadow 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  .remove-tag {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  .force-update-btn svg {
    transition: transform 0.3s var(--ease-out, ease-out);
  }

  :deep(.unit-toggle),
  :deep(.chart-toggle) {
    transition:
      background-color 0.2s var(--ease-out, ease-out),
      color 0.2s var(--ease-out, ease-out),
      box-shadow 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }

  :deep(.saving-indicator .spinner) {
    animation: spin 1s linear infinite;
  }
}
</style>

<style>
/* Global styles for multiselect dropdown (rendered via teleport to body) */
/* Force left alignment for category multiselect dropdown */
/* Note: These styles target the dropdown that is rendered via teleport to body */

/* CRITICAL: Force left alignment for multiselect component and ALL its children */
/* Use very specific selectors to override library defaults */
.categories-inline-edit .track-category-select-inline,
.categories-inline-edit .track-category-select-inline.multiselect,
.categories-inline-edit > .multiselect,
.categories-inline-edit > .track-category-select-inline {
  margin: 0 !important;
  margin-inline-start: 0 !important;
  margin-inline-end: auto !important;
  align-self: flex-start !important;
}

/* Target the internal wrapper that has margin: 0 auto by default */
.categories-inline-edit .multiselect-wrapper,
.categories-inline-edit .track-category-select-inline .multiselect-wrapper,
.categories-inline-edit .multiselect .multiselect-wrapper,
.track-category-select-inline .multiselect-wrapper {
  margin: 0 !important;
  margin-inline-start: 0 !important;
  margin-inline-end: auto !important;
  justify-content: flex-start !important;
}

/* Also override the .multiselect root styles */
.categories-inline-edit .multiselect,
.track-category-select-inline.multiselect {
  margin: 0 !important;
  margin-inline-start: 0 !important;
  margin-inline-end: auto !important;
}

/* Touch targets for the toggles that live in this unscoped block. The scoped
   rule above cannot reach them because StatisticsPanel renders its own root
   and so carries a different scope id. */
@media (max-width: 640px), (pointer: coarse) {
  .unit-toggle,
  .chart-toggle {
    min-height: 44px;
    padding: 0 14px;
  }
}

</style>
