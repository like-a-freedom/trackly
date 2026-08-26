<template>
  <div
    class="track-editor-inspector"
    data-testid="track-editor-inspector"
  >
    <section
      class="inspector-card"
      data-testid="inspector-context-card"
    >
      <div class="inspector-header">
        <span class="inspector-eyebrow">Inspector</span>
        <span class="inspector-mode">{{ modeLabel }}</span>
      </div>

      <div class="inspector-stack">
        <div
          v-if="poiMode"
          class="inspector-banner inspector-banner--accent"
        >
          <strong>POI mode is active</strong>
          <p>Click on the map to add POIs. Existing POIs stay editable here.</p>
        </div>

        <div
          v-if="fragmentInfo"
          class="inspector-banner inspector-banner--neutral"
        >
          <strong>Fragment selection</strong>
          <p>
            Segment {{ fragmentInfo.segIndex + 1 }} ·
            {{ fragmentInfo.points }} points
            <span v-if="!fragmentInfo.complete">
              · pick the end point to unlock actions</span>
          </p>
        </div>

        <div
          v-if="activeSegment"
          class="inspector-panel"
          data-testid="active-segment-summary"
        >
          <span class="inspector-kicker">Active segment</span>
          <strong>{{ activeSegment.displayName }}</strong>
          <p>
            {{ activeSegment.pointCount }} points ·
            {{ formatDistance(activeSegment.distanceKm) }}
          </p>
        </div>

        <div
          v-if="showQuickHelp"
          class="inspector-panel"
        >
          <span class="inspector-kicker">Quick help</span>
          <strong>{{ contextualHeadline }}</strong>
          <p>{{ contextualBody }}</p>
        </div>
      </div>
    </section>

    <TrackEditorInspectorPois
      :pois="pois"
      @delete-poi="$emit('deletePoi', $event)"
      @update-poi="$emit('updatePoi', ...$event)"
    />
  </div>
</template>

<script setup>
import { computed } from "vue";
import TrackEditorInspectorPois from "./TrackEditorInspectorPois.vue";

const props = defineProps({
  editorMode: { type: String, default: "edit" },
  totalPoints: { type: Number, default: 0 },
  poiMode: { type: Boolean, default: false },
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  pois: { type: Array, default: () => [] },
  fragmentInfo: { type: Object, default: null },
});

defineEmits(["deletePoi", "updatePoi"]);

const modeCopy = {
  view: {
    label: "View",
    headline: "Inspect and validate the route",
    body: "Review the map, metrics, and nearby POIs without changing the route.",
  },
  edit: {
    label: "Draw",
    headline: "Add or adjust route points",
    body: "Click the map to place points and use the bottom deck for the heavy editing controls.",
  },
  fragment: {
    label: "Fragments",
    headline: "Work with the current fragment",
    body: "Select fragment points on the map, then use the bottom deck for reroute, split, reverse, or export actions.",
  },
  routing: {
    label: "Routing",
    headline: "Routing controls stay close by",
    body: "Use the top context overflow for routing options and the deck for broader route edits.",
  },
  trace: {
    label: "Trace",
    headline: "Trace over an existing line",
    body: "Stay focused on the map surface while the deck keeps the detailed editing modules ready below.",
  },
};

const modeLabel = computed(() => modeCopy[props.editorMode]?.label || "Editor");
const contextualHeadline = computed(
  () => modeCopy[props.editorMode]?.headline || modeCopy.edit.headline
);
const contextualBody = computed(
  () => modeCopy[props.editorMode]?.body || modeCopy.edit.body
);
const activeSegment = computed(
  () => props.segmentStats?.[props.activeSegmentIndex] || null
);
const showQuickHelp = computed(
  () => props.totalPoints >= 2 || props.editorMode !== "edit"
);

function formatDistance(km) {
  if (km === null || km === undefined) return "0 m";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}
</script>

<style scoped>
.track-editor-inspector {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.inspector-card {
  box-sizing: border-box;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
  padding: 16px;
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.inspector-eyebrow,
.inspector-kicker {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}

.inspector-mode {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.82rem;
  font-weight: 600;
}

.inspector-stack {
  display: grid;
  gap: 10px;
}

.inspector-banner,
.inspector-panel {
  border-radius: 16px;
  padding: 12px;
}

.inspector-banner strong,
.inspector-panel strong {
  display: block;
  margin-bottom: 4px;
  color: #0f172a;
}

.inspector-banner p,
.inspector-panel p {
  margin: 0;
  color: #475569;
  font-size: 0.9rem;
}

.inspector-banner--accent {
  background: #eff6ff;
}

.inspector-banner--neutral,
.inspector-panel {
  background: #f8fafc;
}

@media (max-width: 1180px) {
  .track-editor-inspector {
    max-width: none;
  }
}

@media (max-width: 768px) {
  .inspector-card {
    padding: 14px;
  }

  .inspector-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
