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
      @setMode="editor.setMode"
      @undo="editor.handleUndo"
      @redo="editor.handleRedo"
      @save="handleSave"
      @toggleRouting="editor.routing.toggleMode"
    />

    <!-- Main content: map + sidebar -->
    <div class="editor-body">
      <TrackEditorMap
        ref="editorMap"
        :segments="editor.segments.value"
        :activeSegmentIndex="editor.activeSegmentIndex.value"
        :editorMode="editor.editorMode.value"
        :totalPoints="editor.totalPoints.value"
        @addWaypoint="handleAddWaypoint"
        @moveWaypoint="editor.moveWaypoint"
        @deleteWaypoint="editor.deleteWaypoint"
        @insertWaypoint="editor.insertWaypoint"
        @splitSegment="editor.splitSegment"
        @setActiveSegment="editor.setActiveSegment"
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
        @update:trackName="editor.trackName.value = $event"
        @update:trackDescription="editor.trackDescription.value = $event"
        @update:trackCategories="editor.trackCategories.value = $event"
        @addSegment="editor.addSegment"
        @deleteSegment="editor.deleteSegment"
        @reverseSegment="editor.reverseSegment"
        @setActiveSegment="editor.setActiveSegment"
        @restoreDraft="handleRestoreDraft"
        @deleteDraft="handleDeleteDraft"
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

// ── Handlers ──────────────────────────────────────────
function handleAddWaypoint(lat, lng) {
  const added = editor.addWaypoint(lat, lng, {
    onRoutingNotAvailable: (msg) => showToast(msg, "warning", 5000),
  });
  if (!added && editor.totalPoints.value >= 100_000) {
    showToast("Достигнут лимит точек (100 000)", "error");
  }
}

async function handleSave() {
  const id = await editor.saveTrack();
  if (id) {
    showToast("Трек сохранён", "success");
    // Navigate to track view
    router.push({ name: "Track", params: { id } });
  } else if (editor.error.value) {
    showToast(editor.error.value, "error", 5000);
  }
}

function handleRestoreDraft() {
  const ok = editor.restoreDraft();
  if (ok) {
    showDraftBanner.value = false;
    showToast("Черновик восстановлен", "success");
  } else {
    showToast("Не удалось восстановить черновик", "error");
  }
}

function handleDeleteDraft() {
  editor.deleteDraft();
  showDraftBanner.value = false;
  showToast("Черновик удалён", "info");
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
    // Ctrl+S for new segment (as per spec)
    e.preventDefault();
    editor.addSegment();
    showToast("Новый сегмент создан", "info");
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

  if (trackId.value) {
    // Editing existing track
    await editor.loadTrack(trackId.value);
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
