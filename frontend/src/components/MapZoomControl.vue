<template>
  <div
    class="zoom-control"
    role="group"
    aria-label="Map zoom"
  >
    <button
      class="zoom-btn"
      type="button"
      title="Zoom in"
      aria-label="Zoom in"
      @click="zoomBy(1)"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
    <button
      class="zoom-btn"
      type="button"
      title="Zoom out"
      aria-label="Zoom out"
      @click="zoomBy(-1)"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Map } from "leaflet";

// The map arrives as a prop rather than an injection: this control sits in
// HomeView's overlay layer, outside TrackMap, so TrackMap's provide() would
// never reach it. HomeView already holds the instance from onMapReady.
const props = defineProps<{ map?: Map | null }>();

const MAX_ZOOM = 19;

function zoomBy(delta: number): void {
  const map = props.map;
  if (!map || typeof map.getZoom !== "function") return;
  const next = Math.min(MAX_ZOOM, map.getZoom() + delta);
  map.setZoom(next);
}

defineExpose({ zoomBy });
</script>

<style scoped>
/* The parent .map-controls-overlay owns placement; this control is just
   another item in that vertical stack. */
.zoom-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.zoom-btn {
  pointer-events: auto;
  background: var(--control-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--control-border);
  border-radius: var(--control-radius);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s, color 0.2s;
  box-shadow: var(--control-shadow);
  color: var(--control-icon);
}

.zoom-btn svg {
  stroke: var(--control-icon);
  transition: stroke 0.2s;
}

.zoom-btn:hover {
  background: var(--control-bg-solid);
  box-shadow: var(--control-shadow-hover);
}

.zoom-btn:hover svg {
  stroke: var(--control-icon-hover);
}

.zoom-btn:active {
  box-shadow: var(--control-shadow);
}

/* Touch sizing keys on the input mode, not the viewport — a touch iPad is
   768px wide and still needs 44px targets. */
@media (max-width: 640px), (pointer: coarse) {
  .zoom-btn {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid var(--control-border-strong);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .zoom-btn svg {
    width: 22px;
    height: 22px;
  }
}
</style>