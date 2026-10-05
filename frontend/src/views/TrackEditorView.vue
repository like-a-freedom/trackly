<template>
  <div class="track-editor-view flex h-dvh min-h-0 flex-col bg-canvas">
    <!-- Top bar: track context + save/export + routing controls -->
    <TrackEditorTopBar
      :track-name="editor.trackName.value"
      :total-points="editor.totalPoints.value"
      :total-distance-km="editor.totalDistanceKm.value"
      :estimated-time-minutes="editor.estimatedTimeMinutes.value"
      :manual-routing-percent="editor.manualRoutingPercent.value"
      :can-save="editor.canSave.value"
      :saving="editor.saving.value"
      :is-dirty="editor.isDirty.value"
      :saved-track-id="editor.savedTrackId.value"
      :routing-mode="editor.routing.mode.value"
      :snap-to-road-mode="editor.snapToRoadMode.value"
      :routing-profile="editor.routing.profile.value"
      :show-distance-markers="showDistanceMarkers"
      :graph-loading="editor.routing.graphLoading.value"
      :graph-error="editor.routing.graphError.value"
      :graph-progress="editor.routing.graphProgress.value"
      :graph-coverage="editor.routing.graphCoverage?.value?.name ?? ''"
      @save="handleSave"
      @export="handleExport"
      @toggle-routing="editor.routing.toggleMode"
      @set-snap-to-road-mode="editor.setSnapToRoadMode"
      @set-routing-profile="editor.routing.setProfile"
      @toggle-distance-markers="showDistanceMarkers = !showDistanceMarkers"
      @reload-graph="handleReloadGraph"
      @switch-to-manual="handleSwitchToManual"
    />

    <button v-if="trackId && editor.error.value" class="min-h-11 border-0 bg-surface px-4 text-action" @click="editor.loadTrack(trackId)">Retry loading track</button>

    <!-- Alert strip: draft banner, errors, quick-start tips -->
    <TrackEditorTopAlertStrip
      :show-draft-banner="showDraftBanner"
      :error="editor.error.value"
      :total-points="editor.totalPoints.value"
      @restore-draft="handleRestoreDraft"
      @delete-draft="handleDeleteDraft"
    />

    <p v-if="editor.recordedTrack?.value" class="m-0 bg-blue-50 px-4 py-2 text-sm text-ink" role="note">This is a GPS recording. Description changes keep its measurements; changing the route creates a separate copy when you save.</p>
    <p v-if="editor.draftStorageError?.value" class="m-0 bg-amber-50 px-4 py-2 text-sm text-ink" role="alert">{{ editor.draftStorageError.value }}</p>
    <div v-if="editor.draftConflict?.value" class="bg-amber-50 px-4 py-2 text-sm" role="alert">
      This draft changed in another tab. Automatic backup is paused.
      <button class="min-h-11 border-0 bg-transparent px-3 text-action" @click="handleRestoreDraft">Use other tab's draft</button>
      <button class="min-h-11 border-0 bg-transparent px-3 text-action" @click="editor.keepLocalDraft">Keep this tab's work</button>
    </div>
    <section class="editor-map-stage" data-testid="editor-map-stage">
        <section class="editor-map-region" data-testid="editor-map-region">
          <TrackEditorMap
            ref="editorMap"
            :segments="editor.segments.value"
            :active-segment-index="editor.activeSegmentIndex.value"
            :editor-mode="editor.editorMode.value"
            :total-points="editor.totalPoints.value"
            :pois="editor.pois.value"
            :poi-mode="poiMode"
            :routing-mode="editor.routing.mode.value"
            :snap-to-road-mode="editor.snapToRoadMode.value"
            :snap-to-point="editor.routing.snapToPoint"
            :fragment-selection="editor.fragmentSelection.value"
            :optimizer-preview-segments="
              editor.optimizerPreview.value?.segments || []
            "
            :hover-marker="chartHoverMarker"
            :focus-marker="keyboardFocusMarker"
            :highlighted-segment-index="highlightedSegmentIndex"
            :show-distance-markers="showDistanceMarkers"
            :estimated-time-minutes="editor.estimatedTimeMinutes.value"
            @add-waypoint="handleAddWaypoint"
            @trace-stroke="editor.appendTrace"
            :viewport="editor.viewport?.value"
            @viewport-change="editor.setViewport"
            @move-waypoint="handleMoveWaypoint"
            @delete-waypoint="handleDeleteWaypoint"
            @insert-waypoint="handleInsertWaypoint"
            @cut-segment="handleCutSegment"
            @select-fragment-point="handleSelectFragmentPoint"
            @split-segment="editor.splitSegment"
            @set-active-segment="editor.setActiveSegment"
            @promote-to-waypoint="editor.promoteToWaypoint"
            @add-poi="handleAddPoi"
            @delete-poi="handleDeletePoi"
            @new-track-from-segment="handleNewTrackFromSegment"
            @focus-waypoint="handleFocusWaypoint"
            @hover-segment="(i) => (highlightedSegmentIndex = i)"
            @leave-segment="() => (highlightedSegmentIndex = null)"
            @reverse-segment="handleReverseSegmentMap"
            @join-segments-visual="handleJoinSegmentsVisual"
            @shortcut-between-points="handleShortcutBetweenPoints"
          />
        </section>

        <div class="editor-overlay-layer" data-testid="editor-overlay-layer">
          <!-- Left rail: mode switching + undo/redo + POI -->
          <nav class="editor-left-rail" data-testid="editor-left-rail">
            <TrackEditorLeftRail
              :mode="editor.editorMode.value"
              :can-undo="editor.canUndo.value"
              :can-redo="editor.canRedo.value"
              :poi-mode="poiMode"
              @set-mode="editor.setMode"
              @undo="editor.handleUndo"
              @redo="editor.handleRedo"
              @toggle-poi-mode="poiMode = !poiMode"
            />
          </nav>

          <!-- Left panel: tabbed content (no header/alerts) -->
          <aside class="editor-left-panel" :data-sheet="sheetState" data-testid="editor-left-panel">
            <button class="sheet-toggle min-h-11 w-full border-0 bg-surface px-4 text-left text-ink" :aria-expanded="sheetState !== 'collapsed'" @click="sheetState = sheetState === 'collapsed' ? 'medium' : sheetState === 'medium' ? 'full' : 'collapsed'">{{ sheetState === 'collapsed' ? 'Open route panel' : sheetState === 'medium' ? 'Expand route panel' : 'Collapse route panel' }}</button>
            <TrackEditorLeftPanel
              :track-name="editor.trackName.value"
              :track-description="editor.trackDescription.value"
              :track-categories="editor.trackCategories.value"
              :total-points="editor.totalPoints.value"
              :total-distance-km="editor.totalDistanceKm.value"
              :estimated-time-minutes="editor.estimatedTimeMinutes.value"
              :manual-routing-percent="editor.manualRoutingPercent.value"
              :segment-stats="editor.segmentStats.value"
              :active-segment-index="editor.activeSegmentIndex.value"
              :highlighted-segment-index="highlightedSegmentIndex"
              :pois="editor.pois.value"
              :elevation-profile="editor.elevationProfile.value"
              :recorded-series="editor.recordedSeries?.value"
              :elevation-stats="editor.elevationStats.value"
              :elevation-loading="editor.elevationLoading.value"
              :elevation-error="editor.elevationError.value"
              :coordinate-data="editor.coordinateData.value"
              :fragment-info="fragmentInfo"
              :optimizer-target-ratio="editor.optimizerTargetRatio.value"
              :optimizer-preview="editor.optimizerPreview.value"
              :optimizer-stats="editor.optimizerStats.value"
              :optimizer-loading="editor.optimizerLoading.value"
              :optimizer-error="editor.optimizerError.value"
              @update:track-name="editor.trackName.value = $event"
              @update:track-description="editor.trackDescription.value = $event"
              @update:track-categories="editor.trackCategories.value = $event"
              @update-segment-name="editor.setSegmentName"
              @update-segment-color="editor.setSegmentColor"
              @update:optimizer-target-ratio="editor.setOptimizerTargetRatio"
              @add-segment="editor.addSegment"
              @delete-segment="editor.deleteSegment"
              @reverse-segment="editor.reverseSegment"
              @set-active-segment="editor.setActiveSegment"
              @join-segments="handleJoinSegments"
              @new-track-from-segment="handleNewTrackFromSegment"
              @clear-fragment="editor.clearFragmentSelection"
              @delete-fragment-connect="handleDeleteFragmentConnect"
              @delete-fragment-split="handleDeleteFragmentSplit"
              @reverse-fragment="handleReverseFragment"
              @reroute-fragment="handleRerouteFragment"
              @close-loop="handleCloseLoop"
              @close-loop-same-way="handleCloseLoopSameWay"
              @close-loop-different-route="handleCloseLoopDifferentRoute"
              @export-fragment="handleExportFragment"
              @reverse-track="handleReverseTrack"
              @duplicate-track="handleDuplicateTrack"
              @preview-optimization="editor.previewOptimization"
              @apply-optimization="handleApplyOptimization"
              @clear-optimization="editor.clearOptimizationPreview"
              @download-optimization="editor.downloadOptimizationPreview"
              @chart-point-hover="handleElevationPointHover"
              @chart-point-leave="handleElevationPointLeave"
              @chart-point-click="handleElevationPointClick"
              @hover-segment="(i) => (highlightedSegmentIndex = i)"
              @leave-segment="() => (highlightedSegmentIndex = null)"
            >
              <template #context>
                <TrackEditorPointControls :points="editor.segments.value[editor.activeSegmentIndex.value]?.points || []" :anchors="editor.segments.value[editor.activeSegmentIndex.value]?.waypoints || []"
                  @add="handleAddWaypoint" @focus="handleFocusWaypoint(editor.activeSegmentIndex.value, $event)"
                  @promote="editor.promoteToWaypoint(editor.activeSegmentIndex.value, $event)"
                  @move="(index, lat, lon) => handleMoveWaypoint(editor.activeSegmentIndex.value, index, lat, lon)"
                  @delete="handleDeleteWaypoint(editor.activeSegmentIndex.value, $event)"
                  @fragment="handleSelectFragmentPoint(editor.activeSegmentIndex.value, $event)" />
            <TrackEditorInspector
              :editor-mode="editor.editorMode.value"
              :total-points="editor.totalPoints.value"
              :poi-mode="poiMode"
              :segment-stats="editor.segmentStats.value"
              :active-segment-index="editor.activeSegmentIndex.value"
              :pois="editor.pois.value"
              :fragment-info="fragmentInfo"
              @delete-poi="handleDeletePoi"
              @update-poi="handleUpdatePoi"
            />
              </template>
            </TrackEditorLeftPanel>
          </aside>


        </div>
      </section>

    <!-- Toast notifications -->
    <Toast
      :message="toast.message"
      :type="toast.type"
      :duration="toast.duration"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { useConfirm } from "../composables/useConfirm";
import { useTrackEditor } from "../composables/useTrackEditor";
import { useToastStore } from "../stores/toast.js";
import TrackEditorMap from "../components/TrackEditorMap.vue";
import TrackEditorPointControls from "../components/editor/TrackEditorPointControls.vue";
import TrackEditorLeftPanel from "../components/editor/TrackEditorLeftPanel.vue";
import TrackEditorInspector from "../components/editor/TrackEditorInspector.vue";
import TrackEditorTopBar from "../components/editor/TrackEditorTopBar.vue";
import TrackEditorTopAlertStrip from "../components/editor/TrackEditorTopAlertStrip.vue";
import TrackEditorLeftRail from "../components/editor/TrackEditorLeftRail.vue";
import Toast from "../components/ToastNotification.vue";

const route = useRoute();
const router = useRouter();
const toastStore = useToastStore();
const { showToast } = toastStore;
const toast = computed(() => ({
    message: toastStore.message,
    type: toastStore.type,
    duration: toastStore.duration
}));

// Determine if editing existing track
const trackId = computed(() => route.params.id ?? null);
const sheetState = ref("medium");
const editor = useTrackEditor({ trackId: trackId.value });
const { showConfirm } = useConfirm();
async function confirmEditorLeave() {
  if (!editor.isDirty.value) return true;
  return showConfirm({title:'Leave editor?',message:editor.draftStorageError?.value ? 'Your changes are not backed up on this device. Leaving may lose them.' : 'Your changes are not saved to the track. A local draft is kept on this device.',confirmText:'Leave editor',cancelText:'Keep editing'});
}
onBeforeRouteLeave(confirmEditorLeave);
onBeforeRouteUpdate(confirmEditorLeave);

const editorMap = ref(null);
const showDraftBanner = ref(false);
const poiMode = ref(false);
const chartHoverMarker = ref(null);
const isChartPointFixed = ref(false);
const selectedPointIndex = ref(null);
const keyboardFocusMarker = ref(null);
const highlightedSegmentIndex = ref(null);
const showDistanceMarkers = ref(false);

const fragmentInfo = computed(() => {
  const selection = editor.fragmentSelection.value || {};
  if (
    selection.segIndex === null ||
    selection.segIndex === undefined ||
    selection.startIdx === null ||
    selection.startIdx === undefined
  ) {
    return null;
  }

  const hasEnd = selection.endIdx !== null && selection.endIdx !== undefined;
  const low = hasEnd
    ? Math.min(selection.startIdx, selection.endIdx)
    : selection.startIdx;
  const high = hasEnd
    ? Math.max(selection.startIdx, selection.endIdx)
    : selection.startIdx;

  return {
    segIndex: selection.segIndex,
    startIdx: low,
    endIdx: hasEnd ? high : null,
    complete: hasEnd,
    points: hasEnd ? high - low + 1 : 1,
  };
});

// ── Handlers ──────────────────────────────────────────
function handleAddWaypoint(lat, lng) {
  const added = editor.addWaypoint(lat, lng, {
    onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
  });
  if (!added && editor.totalPoints.value >= 100_000) {
    showToast("Point limit reached (100,000)", "error");
  }
}

function handleMoveWaypoint(segIndex, pointIndex, lat, lng) {
  const ok = editor.moveWaypoint(segIndex, pointIndex, lat, lng, {
    onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
  });
  if (!ok) {
    showToast(
      "Route not found. Add intermediate points or switch to manual mode.",
      "warning",
      5000
    );
  }
}

function handleDeleteWaypoint(segIndex, pointIndex) {
  const ok = editor.deleteWaypoint(segIndex, pointIndex, {
    onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
  });
  if (!ok) {
    showToast("Unable to delete this point in the segment.", "warning", 4000);
  }
}

function handleInsertWaypoint(segIndex, afterIndex, lat, lng) {
  const ok = editor.insertWaypoint(segIndex, afterIndex, lat, lng, {
    onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
  });
  if (!ok) {
    showToast(
      "Route not found. Add intermediate points or switch to manual mode.",
      "warning",
      5000
    );
  }
}

function handleCutSegment(segIndex, afterIndex, lat, lng) {
  const ok = editor.cutSegmentAt(segIndex, afterIndex, lat, lng, {
    onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
  });
  if (!ok) {
    showToast("Unable to cut segment at this point.", "warning", 4000);
  } else {
    showToast("Segment cut created.", "success");
  }
}

function handleReloadGraph() {
  editor.routing.ensureGraphLoaded();
}

function handleSwitchToManual() {
  editor.routing.setMode("manual");
}

async function handleSave() {
  const id = await editor.saveTrack();
  if (id) {
    showToast("Track saved", "success");
    router.push({ name: "Track", params: { id } });
  } else if (editor.error.value) {
    showToast(editor.error.value, "error", 5000);
  }
}

function handleRestoreDraft() {
  const ok = editor.restoreDraft();
  if (ok) {
    showDraftBanner.value = false;
    showToast("Draft restored", "success");
  } else {
    showToast("Failed to restore draft", "error");
  }
}

function handleDeleteDraft() {
  editor.deleteDraft();
  showDraftBanner.value = false;
  showToast("Draft deleted", "info");
}

async function handleAddPoi(lat, lng) {
  const name = window.prompt("POI name (optional):");
  const result = await editor.addPoi(lat, lng, name || "");
  if (!result?.ok) return;
  showToast("POI added", "success");
  if (result.warning) {
    showToast(result.warning, "warning", 5000);
  }
}

async function handleUpdatePoi(poiIndex, updates) {
  const result = await editor.updatePoi(poiIndex, updates);
  if (result?.ok) {
    showToast("POI updated", "success");
  } else {
    showToast(result?.error || "Unable to update POI", "error", 5000);
  }
}

async function handleDeletePoi(poiIndex) {
  const result = await editor.deletePoi(poiIndex);
  if (result?.ok) {
    showToast("POI deleted", "success");
  } else {
    showToast(result?.error || "Unable to delete POI", "error", 5000);
  }
}

function handleJoinSegments() {
  const idx = editor.activeSegmentIndex.value;
  const segCount = editor.segments.value.length;
  if (segCount < 2) {
    showToast("You need at least 2 segments to merge", "warning");
    return;
  }
  // Join active segment with next, or last two if active is the last
  const a = idx < segCount - 1 ? idx : idx - 1;
  editor.joinSegments(a, a + 1);
  showToast("Segments merged", "success");
}

function handleReverseSegmentMap(segIndex) {
  editor.reverseSegment(segIndex);
  showToast("Segment reversed", "success");
}

function handleJoinSegmentsVisual(originSegIdx, targetSegIdx) {
  const segCount = editor.segments.value.length;
  if (segCount < 2) {
    showToast("You need at least 2 segments to merge", "warning");
    return;
  }
  // Make segments adjacent by sorting indices
  const a = Math.min(originSegIdx, targetSegIdx);
  const b = Math.max(originSegIdx, targetSegIdx);
  if (b === a + 1) {
    // Already adjacent
    editor.joinSegments(a, b);
    showToast("Segments joined", "success");
  } else {
    // Non-adjacent: move target next to origin then join
    // For simplicity, join the two nearest: swap segments to make adjacent
    showToast("Can only join adjacent segments. Reorder first.", "warning");
  }
}

function handleShortcutBetweenPoints(segIdx, fromIdx, toIdx) {
  const ok = editor.shortcutBetweenPoints(segIdx, fromIdx, toIdx);
  if (ok) {
    showToast("Shortcut applied", "success");
  } else {
    showToast("Cannot apply shortcut here", "warning");
  }
}

function handleSelectFragmentPoint(segIdx, pointIdx) {
  if (editor.editorMode.value !== "fragment") return;
  editor.setFragmentPoint(segIdx, pointIdx);
}

function handleDeleteFragmentConnect() {
  const range = editor.getFragmentRange();
  if (!range) return;
  const ok = editor.deleteFragmentConnect(
    range.segIndex,
    range.startIdx,
    range.endIdx
  );
  if (!ok) {
    showToast("Select a fragment with at least 3 points.", "warning");
  } else {
    showToast("Fragment removed and connected.", "success");
  }
}

function handleDeleteFragmentSplit() {
  const range = editor.getFragmentRange();
  if (!range) return;
  const ok = editor.deleteFragmentSplit(
    range.segIndex,
    range.startIdx,
    range.endIdx
  );
  if (!ok) {
    showToast("Fragment split requires at least two valid parts.", "warning");
  } else {
    showToast("Fragment removed and split into two segments.", "success");
  }
}

function handleReverseFragment() {
  const range = editor.getFragmentRange();
  if (!range) return;
  const ok = editor.reverseFragment(
    range.segIndex,
    range.startIdx,
    range.endIdx
  );
  if (!ok) {
    showToast("Select a fragment with at least 2 points.", "warning");
  } else {
    showToast("Fragment reversed.", "success");
    editor.clearFragmentSelection();
  }
}

function handleRerouteFragment() {
  const range = editor.getFragmentRange();
  if (!range) return;
  const ok = editor.rerouteFragment(
    range.segIndex,
    range.startIdx,
    range.endIdx,
    {
      onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
    }
  );
  if (!ok) {
    showToast("Unable to reroute fragment.", "warning");
  } else {
    showToast("Fragment rerouted.", "success");
  }
}

function handleCloseLoop() {
  const ok = editor.closeLoop();
  if (!ok) {
    showToast(
      "Loop requires at least 3 points and a gap from the start.",
      "warning"
    );
  } else {
    showToast("Loop closed.", "success");
  }
}

function handleCloseLoopSameWay() {
  const ok = editor.closeLoopSameWay();
  if (!ok) {
    showToast(
      "Requires at least 2 points and a gap from the start.",
      "warning"
    );
  } else {
    showToast("Return path added (same way).", "success");
  }
}

function handleCloseLoopDifferentRoute() {
  const ok = editor.closeLoopDifferentRoute({
    onRoutingNotAvailable: () =>
      showToast("Routing data not loaded yet — try again.", "warning"),
  });
  if (!ok) {
    showToast(
      "Could not find a return route. Try manually or use 'Same way back'.",
      "warning"
    );
  } else {
    showToast("Return path added via different route.", "success");
  }
}

function handleExportFragment() {
  const ok = editor.exportFragment();
  if (!ok) {
    showToast("Select a fragment with at least 2 points first.", "warning");
  } else {
    showToast("Fragment exported as GPX.", "success");
  }
}

function handleReverseTrack() {
  const ok = editor.reverseTrack();
  if (!ok) {
    showToast("Track reverse requires at least 2 points.", "warning");
  } else {
    showToast("Track reversed.", "success");
  }
}

async function handleDuplicateTrack() {
  if (editor.isDirty.value) { showToast('Save your changes before making a copy.', 'warning'); return; }
  const result = await editor.duplicateTrack();
  if (!result?.ok) {
    showToast(result?.error || "Unable to duplicate track", "error", 5000);
    return;
  }
  showToast("Track duplicated", "success");
  router.push({ name: "Track", params: { id: result.id } });
}

async function handleNewTrackFromSegment(segIndex) {
  const result = await editor.createTrackFromSegment(segIndex);
  if (!result?.ok) {
    showToast(result?.error || "Unable to create track", "error", 5000);
    return;
  }
  showToast("New track created from segment", "success");
  router.push({ name: "Track", params: { id: result.id } });
}

function handleApplyOptimization() {
  const ok = editor.applyOptimizationPreview();
  if (!ok) {
    showToast("Optimization preview is not ready.", "warning");
  } else {
    showToast("Optimization applied.", "success");
  }
}

async function handleExport(format) {
  if (editor.isDirty.value) {
    showToast('Save your changes before exporting this track.', 'warning');
    return;
  }
  try {
    const exported = await editor.exportTrack(format);
    showToast(exported ? `Export ${format.toUpperCase()} started` : 'Export failed. Please retry.', exported ? 'success' : 'error');
  } catch {
    showToast("Export error", "error");
  }
}

// ── Elevation chart interactions ─────────────────────────
function getChartIndex(payload) {
  if (!payload) return null;
  return payload.coordinateIndex ?? payload.index ?? null;
}

function findSegmentPointByIndex(globalIndex) {
  if (globalIndex === null || globalIndex === undefined) return null;
  let offset = 0;
  for (let segIndex = 0; segIndex < editor.segments.value.length; segIndex++) {
    const seg = editor.segments.value[segIndex];
    if (globalIndex < offset + seg.points.length) {
      return { segIndex, pointIndex: globalIndex - offset };
    }
    offset += seg.points.length;
  }
  return null;
}

function findGlobalIndexBySegment(segIndex, pointIndex) {
  if (segIndex < 0 || pointIndex < 0) return null;
  let offset = 0;
  for (let i = 0; i < editor.segments.value.length; i++) {
    const seg = editor.segments.value[i];
    if (i === segIndex) {
      if (pointIndex >= seg.points.length) return null;
      return offset + pointIndex;
    }
    offset += seg.points.length;
  }
  return null;
}

function resolveLatLngForIndex(globalIndex) {
  if (globalIndex === null || globalIndex === undefined) return null;
  return editor.coordinateData.value?.[globalIndex] || null;
}

function setKeyboardFocusByIndex(globalIndex, { pan = true } = {}) {
  const latlng = resolveLatLngForIndex(globalIndex);
  if (!latlng) return false;
  selectedPointIndex.value = globalIndex;
  keyboardFocusMarker.value = { latlng };
  if (pan) {
    editorMap.value?.panTo(latlng);
  }
  return true;
}

function handleFocusWaypoint(segIndex, pointIndex) {
  const globalIndex = findGlobalIndexBySegment(segIndex, pointIndex);
  if (globalIndex === null) return;
  setKeyboardFocusByIndex(globalIndex, { pan: false });
}

function handleElevationPointHover(payload) {
  if (isChartPointFixed.value && !payload?.isFixed) return;
  const idx = getChartIndex(payload);
  const latlng = payload?.latlng || resolveLatLngForIndex(idx);
  if (!latlng) return;
  chartHoverMarker.value = {
    latlng,
    distanceKm: payload?.distanceKm,
    elevation: payload?.elevation,
  };
}

function handleElevationPointLeave(event) {
  if (event?.clearFixed) {
    isChartPointFixed.value = false;
    chartHoverMarker.value = null;
    return;
  }
  if (!isChartPointFixed.value) {
    chartHoverMarker.value = null;
  }
}

function handleElevationPointClick(payload) {
  isChartPointFixed.value = payload?.isFixed;
  if (!payload?.isFixed) {
    chartHoverMarker.value = null;
    return;
  }

  handleElevationPointHover({ ...payload, isFixed: true });

  const idx = getChartIndex(payload);
  if (idx !== null && idx !== undefined) {
    setKeyboardFocusByIndex(idx, { pan: false });
  }
  const segmentPoint = findSegmentPointByIndex(idx);
  if (segmentPoint) {
    editor.setFragmentPoint(segmentPoint.segIndex, segmentPoint.pointIndex);
  }

  const latlng = payload?.latlng || resolveLatLngForIndex(idx);
  if (latlng) {
    editorMap.value?.panTo(latlng);
  }
}

// ── Keyboard shortcuts ──────────────────────────────────
function onKeyDown(e) {
  // Ignore if user is typing in an input
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  // Mode shortcuts
  if (e.key === "F1") {
    e.preventDefault();
    editor.setMode("view");
  }
  if (e.key === "F2") {
    e.preventDefault();
    editor.setMode("edit");
  }
  if (e.key === "F3") {
    e.preventDefault();
    editor.setMode("fragment");
  }
  if (e.key === "F4") {
    e.preventDefault();
    editor.setMode("routing");
  }
  if (e.key === "t" || e.key === "T") {
    e.preventDefault();
    editor.setMode("trace");
  }

  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    editor.handleUndo();
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "y" || (e.key === "z" && e.shiftKey))
  ) {
    e.preventDefault();
    editor.handleRedo();
  }

  // Save
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
    e.preventDefault();
    handleSave();
  }

  // New segment
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
    e.preventDefault();
    editor.addSegment();
    showToast("New segment created", "info");
  }

  // Delete last point
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    editor.deleteLastPoint();
  }

  // Join segments (Ctrl+J)
  if ((e.ctrlKey || e.metaKey) && e.key === "j") {
    e.preventDefault();
    handleJoinSegments();
  }

  // Export (Ctrl+E)
  if ((e.ctrlKey || e.metaKey) && e.key === "e") {
    e.preventDefault();
    handleExport("gpx");
  }

  // Zoom in/out
  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    editorMap.value?.zoomIn?.();
  }
  if (e.key === "-") {
    e.preventDefault();
    editorMap.value?.zoomOut?.();
  }

  // Navigate points with arrows
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const total = editor.coordinateData.value?.length || 0;
    if (total === 0) return;
    const lastIndex = total - 1;
    if (e.key === "ArrowRight") {
      const next =
        selectedPointIndex.value === null
          ? 0
          : Math.min(selectedPointIndex.value + 1, lastIndex);
      setKeyboardFocusByIndex(next);
    } else {
      const prev =
        selectedPointIndex.value === null
          ? lastIndex
          : Math.max(selectedPointIndex.value - 1, 0);
      setKeyboardFocusByIndex(prev);
    }
  }

  // Confirm action (Enter) in fragment mode
  if (e.key === "Enter") {
    if (
      editor.editorMode.value === "fragment" &&
      selectedPointIndex.value !== null
    ) {
      e.preventDefault();
      const segmentPoint = findSegmentPointByIndex(selectedPointIndex.value);
      if (segmentPoint) {
        editor.setFragmentPoint(segmentPoint.segIndex, segmentPoint.pointIndex);
      }
    }
  }

  // Escape — exit POI mode or reset mode to view
  if (e.key === "Escape") {
    if (poiMode.value) {
      poiMode.value = false;
      showToast("POI mode disabled", "info");
    }
  }

  // Fit bounds
  if (e.key === "Home") {
    e.preventDefault();
    editorMap.value?.fitBounds();
  }
}

function checkBrowserSupport() {
  const hasFetch = typeof fetch === "function";
  const hasWasm = typeof WebAssembly !== "undefined";
  const hasURL = typeof URL !== "undefined";
  const hasPromise = typeof Promise !== "undefined";

  if (!hasFetch || !hasWasm || !hasURL || !hasPromise) {
    showToast(
      "Your browser is not supported. Please use a recent version of Chrome, Firefox, Safari, or Edge.",
      "error",
      8000
    );
  }
}

// ── Lifecycle ───────────────────────────────────────────
onMounted(async () => {
  document.addEventListener("keydown", onKeyDown);

  checkBrowserSupport();

  editor.routing.initialize();

  if (trackId.value) {
    // Editing existing track
    await editor.loadTrack(trackId.value);
    if (editor.error.value) return;
    if (!editor.isOwner.value) {
      showToast("You do not have permission to edit this track.", "error");
      router.replace({ name: "Track", params: { id: trackId.value } });
      return;
    }
    showDraftBanner.value = editor.hasDraft.value;
    // Fit map after load
    setTimeout(() => editorMap.value?.fitBounds(), 300);
  } else {
    // New track — check for draft
    if (editor.hasDraft.value) {
      showDraftBanner.value = true;
    }
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
});
</script>

<style scoped>
.track-editor-view { height:100vh; height:100dvh; overflow:hidden; }
.editor-map-stage { position:relative; flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 360px; }
.editor-map-region { min-width:0; min-height:0; position:relative; }
.editor-overlay-layer { display:contents; }
.editor-left-panel { min-height:0; min-width:0; background:var(--color-surface); border-left:1px solid var(--color-line); overflow:hidden; }
.editor-left-rail { position:absolute; z-index:500; top:12px; left:60px; max-width:calc(100% - 440px); }
.sheet-toggle { display:none; }
@media(max-width:900px) {
 .editor-map-stage { grid-template-columns:minmax(0,1fr); }
 .editor-left-rail { left:60px; right:12px; max-width:none; }
 .editor-left-panel { position:absolute; z-index:600; bottom:0; left:0; right:0; height:min(36%,280px); display:flex; flex-direction:column; border-top:1px solid var(--color-line); padding-bottom:env(safe-area-inset-bottom); }
 .editor-left-panel[data-sheet="collapsed"] { height:44px; }
 .editor-left-panel[data-sheet="full"] { height:calc(100% - 80px); }
 .sheet-toggle { display:block; flex-shrink:0; }
}
</style>
