<template>
  <div class="track-editor-view">
    <!-- Toolbar -->
    <TrackEditorToolbar
      :mode="editor.editorMode.value"
      :canUndo="editor.canUndo.value"
      :canRedo="editor.canRedo.value"
      :canSave="editor.canSave.value"
      :saving="editor.saving.value"
      :totalPoints="editor.totalPoints.value"
      :totalDistanceKm="editor.totalDistanceKm.value"
      :routingMode="editor.routing.mode.value"
      :graphLoading="editor.routing.graphLoading.value"
      :graphError="editor.routing.graphError.value"
      :graphProgress="editor.routing.graphProgress.value"
      :estimatedTimeMinutes="editor.estimatedTimeMinutes.value"
      :poiMode="poiMode"
      :savedTrackId="editor.savedTrackId.value"
      @setMode="editor.setMode"
      @undo="editor.handleUndo"
      @redo="editor.handleRedo"
      @save="handleSave"
      @toggleRouting="editor.routing.toggleMode"
      @togglePoiMode="poiMode = !poiMode"
      @export="handleExport"
    />

    <!-- Main content: map + sidebar -->
    <div class="editor-body">
      <TrackEditorMap
        ref="editorMap"
        :segments="editor.segments.value"
        :activeSegmentIndex="editor.activeSegmentIndex.value"
        :editorMode="editor.editorMode.value"
        :totalPoints="editor.totalPoints.value"
        :pois="editor.pois.value"
        :poiMode="poiMode"
        @addWaypoint="handleAddWaypoint"
        @moveWaypoint="handleMoveWaypoint"
        @deleteWaypoint="handleDeleteWaypoint"
        @insertWaypoint="handleInsertWaypoint"
        @splitSegment="editor.splitSegment"
        @setActiveSegment="editor.setActiveSegment"
        @promoteToWaypoint="editor.promoteToWaypoint"
        @addPoi="handleAddPoi"
        @deletePoi="editor.deletePoi"
      />

      <TrackEditorSidebar
        :trackName="editor.trackName.value"
        :trackDescription="editor.trackDescription.value"
        :trackCategories="editor.trackCategories.value"
        :segmentStats="editor.segmentStats.value"
        :activeSegmentIndex="editor.activeSegmentIndex.value"
        :totalDistanceKm="editor.totalDistanceKm.value"
        :totalPoints="editor.totalPoints.value"
        :error="editor.error.value"
        :showDraftBanner="showDraftBanner"
        :estimatedTimeMinutes="editor.estimatedTimeMinutes.value"
        :pois="editor.pois.value"
        :elevationProfile="editor.elevationProfile.value"
        :elevationStats="editor.elevationStats.value"
        :elevationLoading="editor.elevationLoading.value"
        :elevationError="editor.elevationError.value"
        :coordinateData="editor.coordinateData.value"
        @update:trackName="editor.trackName.value = $event"
        @update:trackDescription="editor.trackDescription.value = $event"
        @update:trackCategories="editor.trackCategories.value = $event"
        @addSegment="editor.addSegment"
        @deleteSegment="editor.deleteSegment"
        @reverseSegment="editor.reverseSegment"
        @setActiveSegment="editor.setActiveSegment"
        @restoreDraft="handleRestoreDraft"
        @deleteDraft="handleDeleteDraft"
        @joinSegments="handleJoinSegments"
        @deletePoi="editor.deletePoi"
      />
    </div>

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
import { useRoute, useRouter } from "vue-router";
import { useTrackEditor } from "../composables/useTrackEditor";
import { useToast } from "../composables/useToast";
import TrackEditorToolbar from "../components/TrackEditorToolbar.vue";
import TrackEditorMap from "../components/TrackEditorMap.vue";
import TrackEditorSidebar from "../components/TrackEditorSidebar.vue";
import Toast from "../components/Toast.vue";

const route = useRoute();
const router = useRouter();
const { showToast, toast } = useToast();

// Determine if editing existing track
const trackId = computed(() => route.params.id ?? null);
const editor = useTrackEditor({ trackId: trackId.value });

const editorMap = ref(null);
const showDraftBanner = ref(false);
const poiMode = ref(false);

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

async function handleExport(format) {
  try {
    await editor.exportTrack(format);
    showToast(`Export ${format.toUpperCase()} started`, "success");
  } catch {
    showToast("Export error", "error");
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

// ── Lifecycle ───────────────────────────────────────────
onMounted(async () => {
  document.addEventListener("keydown", onKeyDown);

  editor.routing.initialize();

  if (trackId.value) {
    // Editing existing track
    await editor.loadTrack(trackId.value);
    if (!editor.isOwner.value) {
      showToast("You do not have permission to edit this track.", "error");
      router.replace({ name: "Track", params: { id: trackId.value } });
      return;
    }
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
.track-editor-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Responsive: sidebar below map on small screens */
@media (max-width: 768px) {
  .editor-body {
    flex-direction: column;
  }
}
</style>
