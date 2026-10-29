<template>
  <section
    class="sidebar-section"
    data-testid="inspector-segments"
  >
    <div class="section-header">
      <h3 class="section-title">
        Segments
      </h3>
      <button
        class="btn-icon"
        v-tooltip="'New segment (Ctrl+S)'" :aria-label="'New segment (Ctrl+S)'"
        data-testid="add-segment-btn"
        @click="$emit('addSegment')"
      >
        ＋
      </button>
    </div>

    <ul class="segment-list">
      <li
        v-for="(stat, i) in segmentStats"
        :key="i"
        class="segment-item"
        :class="{
          active: i === activeSegmentIndex,
          highlighted: i === highlightedSegmentIndex,
        }"
        data-testid="segment-item"
        tabindex="0"
        :aria-label="`Select ${stat.displayName}`"
        @keydown.enter.self="$emit('setActiveSegment', i)"
        @keydown.space.self.prevent="$emit('setActiveSegment', i)"
        @click="$emit('setActiveSegment', i)"
        @mouseenter="$emit('hoverSegment', i)"
        @mouseleave="$emit('leaveSegment')"
      >
        <span
          class="segment-color"
          :style="{ background: stat.color }"
        />
        <span class="segment-info">
          {{ stat.displayName }}
          <small>{{ stat.pointCount }} points ·
            {{ formatDistance(stat.distanceKm) }}</small>
          <div class="segment-meta">
            <input
              class="form-input segment-name-input ui-field"
              type="text"
              :value="stat.name"
              :aria-label="`Segment ${i + 1} name`"
              :placeholder="`Day ${i + 1}`"
              maxlength="80"
              @click.stop
              @input="$emit('updateSegmentName', i, $event.target.value)"
            >
            <input
              class="segment-color-input"
              type="color"
              :aria-label="`Segment ${i + 1} color`"
              :value="stat.color"
              @click.stop
              @input="$emit('updateSegmentColor', i, $event.target.value)"
            >
          </div>
        </span>
        <div class="segment-actions">
          <button
            v-if="i < segmentStats.length - 1"
            class="btn-icon-sm"
            v-tooltip="'Merge with next (Ctrl+J)'" :aria-label="'Merge with next (Ctrl+J)'"
            data-testid="join-segment-btn"
            @click.stop="$emit('joinSegments', i, i + 1)"
          >
            ⇋
          </button>
          <button
            class="btn-icon-sm"
            v-tooltip="'New track from segment'" :aria-label="'New track from segment'"
            data-testid="new-track-from-segment-btn"
            @click.stop="$emit('newTrackFromSegment', i)"
          >
            🧭
          </button>
          <button
            class="btn-icon-sm"
            v-tooltip="'Reverse'" :aria-label="'Reverse'"
            @click.stop="$emit('reverseSegment', i)"
          >
            ↔
          </button>
          <button
            class="btn-icon-sm danger"
            v-tooltip="'Delete segment'" :aria-label="'Delete segment'"
            @click.stop="$emit('deleteSegment', i)"
          >
            ✕
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
defineProps({
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  highlightedSegmentIndex: { type: Number, default: null },
});

defineEmits([
  "addSegment",
  "setActiveSegment",
  "hoverSegment",
  "leaveSegment",
  "updateSegmentName",
  "updateSegmentColor",
  "joinSegments",
  "newTrackFromSegment",
  "reverseSegment",
  "deleteSegment",
]);

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}
</script>

<style scoped>
.sidebar-section {
  padding: 12px;
  border-block-end: 1px solid oklch(95.5% 0 none);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink);
  margin: 0 0 8px;
}

.segment-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.segment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s var(--ease-out, ease-out);
}

.segment-item:active {
  background: oklch(94.9% 0 none);
}

@media (hover: hover) and (pointer: fine) {
  .segment-item:hover {
    background: oklch(97% 0 none);
  }
}

.segment-item.active {
  background: oklch(95.3% 0.0207 261.8);
}

.segment-item.highlighted {
  background: oklch(97.4% 0.0682 102.2);
  outline: 2px solid oklch(59.2% 0.1211 88.9);
  outline-offset: -2px;
}

.segment-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.segment-info {
  flex: 1;
  min-width: 0;
}

.segment-info small {
  display: block;
  color: var(--color-muted);
  font-size: 11px;
}

.segment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-block-start: 6px;
}



.segment-name-input {
  padding: 4px 6px;
  font-size: 11px;
}

.segment-color-input {
  width: 26px;
  height: 26px;
  border: 1px solid oklch(89.8% 0 none);
  border-radius: 6px;
  padding: 0;
  background: var(--color-surface);
}

.segment-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s var(--ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .segment-item:hover .segment-actions {
    opacity: 1;
  }
}

/* Touch devices have no hover: keep the actions visible there and whenever a
   control inside the row holds focus, so they are never invisible yet tappable. */
.segment-item:focus-within .segment-actions {
  opacity: 1;
}

@media (pointer: coarse) {
  .segment-actions {
    opacity: 1;
  }
}

.btn-icon {
  border: 1px solid oklch(89.8% 0 none);
  border-radius: 4px;
  background: oklch(98.5% 0 none);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  line-height: 1;
}

.btn-icon:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .btn-icon:hover {
    background: oklch(95.3% 0.0207 261.8);
  }
}

.btn-icon-sm {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 2px;
  color: var(--color-muted);
}

.btn-icon-sm:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .btn-icon-sm:hover {
    background: oklch(90.7% 0 none);
  }

  .btn-icon-sm.danger:hover {
    background: oklch(94.1% 0.0282 355.4);
    color: var(--color-danger);
  }
}
</style>
