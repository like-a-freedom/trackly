<template>
  <section
    class="track-editor-meta-card"
    data-testid="track-editor-meta-card"
  >
    <TrackEditorInspectorOverview
      :show-context-alerts="false"
      :track-name="trackName"
      :track-description="trackDescription"
      :track-categories="trackCategories"
      :total-points="totalPoints"
      @update:track-name="$emit('update:trackName', $event)"
      @update:track-description="$emit('update:trackDescription', $event)"
      @update:track-categories="$emit('update:trackCategories', $event)"
    />
  </section>
</template>

<script setup>
import TrackEditorInspectorOverview from "./TrackEditorInspectorOverview.vue";

defineProps({
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
  totalPoints: { type: Number, default: 0 },
});

defineEmits([
  "update:trackName",
  "update:trackDescription",
  "update:trackCategories",
]);
</script>

<style scoped>
.track-editor-meta-card {
  min-width: 0;
}
</style>
