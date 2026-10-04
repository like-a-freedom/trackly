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
        title="New segment (Ctrl+S)"
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
              class="form-input segment-name-input"
              type="text"
              :value="stat.name"
              :placeholder="`Day ${i + 1}`"
              maxlength="80"
              @click.stop
              @input="$emit('updateSegmentName', i, $event.target.value)"
            >
            <input
              class="segment-color-input"
              type="color"
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
            title="Merge with next (Ctrl+J)"
            data-testid="join-segment-btn"
            @click.stop="$emit('joinSegments', i, i + 1)"
          >
            ⇋
          </button>
          <button
            class="btn-icon-sm"
            title="New track from segment"
            data-testid="new-track-from-segment-btn"
            @click.stop="$emit('newTrackFromSegment', i)"
          >
            🧭
          </button>
          <button
            class="btn-icon-sm"
            title="Reverse"
            @click.stop="$emit('reverseSegment', i)"
          >
            ↔
          </button>
          <button
            class="btn-icon-sm danger"
            title="Delete segment"
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
  border-bottom: 1px solid #f0f0f0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
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
  transition: background 0.15s;
}

.segment-item:hover {
  background: #f5f5f5;
}

.segment-item.active {
  background: #e8f0fe;
}

.segment-item.highlighted {
  background: #fff9c4;
  box-shadow: inset 3px 0 0 #ffd600;
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
  color: #888;
  font-size: 11px;
}

.segment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.form-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  color: #333;
  box-sizing: border-box;
}

.form-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.18);
}

.segment-name-input {
  padding: 4px 6px;
  font-size: 11px;
}

.segment-color-input {
  width: 26px;
  height: 26px;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0;
  background: #fff;
}

.segment-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.segment-item:hover .segment-actions {
  opacity: 1;
}

.btn-icon {
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  line-height: 1;
}

.btn-icon:hover {
  background: #e8f0fe;
}

.btn-icon-sm {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 2px;
  color: #666;
}

.btn-icon-sm:hover {
  background: #e0e0e0;
}

.btn-icon-sm.danger:hover {
  background: #fce4ec;
  color: #c62828;
}
</style>
