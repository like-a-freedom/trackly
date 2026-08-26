<template>
  <nav
    class="track-editor-left-rail"
    aria-label="Editor tools"
  >
    <div class="left-rail-group">
      <button
        v-for="item in modeItems"
        :key="item.id"
        class="left-rail-btn"
        :class="{ active: mode === item.id }"
        :aria-pressed="mode === item.id ? 'true' : 'false'"
        :data-testid="`left-rail-mode-${item.id}`"
        :title="`${item.label} (${item.key})`"
        @click="$emit('setMode', item.id)"
      >
        <span class="left-rail-btn-icon">{{ item.icon }}</span>
        <span class="sr-only">{{ item.label }}</span>
      </button>
    </div>

    <div class="left-rail-divider" />

    <div class="left-rail-group">
      <button
        class="left-rail-btn"
        :disabled="!canUndo"
        data-testid="left-rail-undo"
        title="Undo"
        @click="$emit('undo')"
      >
        <span class="left-rail-btn-icon">↶</span>
        <span class="sr-only">Undo</span>
      </button>
      <button
        class="left-rail-btn"
        :disabled="!canRedo"
        data-testid="left-rail-redo"
        title="Redo"
        @click="$emit('redo')"
      >
        <span class="left-rail-btn-icon">↷</span>
        <span class="sr-only">Redo</span>
      </button>
    </div>

    <div class="left-rail-divider" />

    <div class="left-rail-group left-rail-group--footer">
      <button
        class="left-rail-btn"
        :class="{ active: poiMode }"
        :aria-pressed="poiMode ? 'true' : 'false'"
        data-testid="left-rail-poi-toggle"
        title="POI mode"
        @click="$emit('togglePoiMode')"
      >
        <span class="left-rail-btn-icon">📍</span>
        <span class="sr-only">Toggle POI mode</span>
      </button>
    </div>
  </nav>
</template>

<script setup>
const props = defineProps({
  mode: { type: String, default: "edit" },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  poiMode: { type: Boolean, default: false },
});

defineEmits(["setMode", "undo", "redo", "togglePoiMode"]);

const modeItems = [
  { id: "view", label: "View", key: "F1", icon: "👁" },
  { id: "edit", label: "Draw", key: "F2", icon: "✏️" },
  { id: "fragment", label: "Fragments", key: "F3", icon: "✂️" },
  { id: "routing", label: "Routing", key: "F4", icon: "🗺️" },
  { id: "trace", label: "Trace", key: "T", icon: "🖊️" },
];
</script>

<style scoped>
.track-editor-left-rail {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 8px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.left-rail-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  align-items: center;
}

.left-rail-group--footer {
  margin-top: auto;
}

.left-rail-divider {
  width: 28px;
  height: 1px;
  background: rgba(148, 163, 184, 0.5);
}

.left-rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease,
    transform 0.16s ease;
}

.left-rail-btn:hover:not(:disabled) {
  background: #eef4ff;
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.left-rail-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.left-rail-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.left-rail-btn-icon {
  font-size: 18px;
  line-height: 1;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .track-editor-left-rail {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    overflow-x: hidden;
    padding: 8px;
  }

  .left-rail-group {
    flex-direction: row;
    width: auto;
    flex-shrink: 0;
    gap: 6px;
  }

  .left-rail-group--footer {
    margin-top: 0;
    margin-left: 0;
  }

  .left-rail-divider {
    width: 1px;
    height: 20px;
    flex-shrink: 0;
  }

  .left-rail-btn {
    width: 36px;
    height: 36px;
    border-radius: 12px;
  }

  .left-rail-btn-icon {
    font-size: 16px;
  }
}
</style>
