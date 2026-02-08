<template>
  <div class="track-editor-toolbar">
    <!-- Mode buttons -->
    <div class="toolbar-group">
      <button
        v-for="m in modes"
        :key="m.id"
        class="toolbar-btn"
        :class="{ active: mode === m.id }"
        :title="`${m.label} (${m.key})`"
        :data-testid="`mode-${m.id}`"
        @click="$emit('setMode', m.id)"
      >
        <span class="toolbar-btn-icon" v-html="m.icon" />
        <span class="toolbar-btn-label">{{ m.label }}</span>
      </button>
    </div>

    <!-- Divider -->
    <div class="toolbar-divider" />

    <!-- Undo / Redo -->
    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        :disabled="!canUndo"
        title="Отменить (Ctrl+Z)"
        data-testid="undo-btn"
        @click="$emit('undo')"
      >
        <span class="toolbar-btn-icon">&#8630;</span>
      </button>
      <button
        class="toolbar-btn"
        :disabled="!canRedo"
        title="Повторить (Ctrl+Y)"
        data-testid="redo-btn"
        @click="$emit('redo')"
      >
        <span class="toolbar-btn-icon">&#8631;</span>
      </button>
    </div>

    <div class="toolbar-divider" />

    <!-- Routing toggle -->
    <div class="toolbar-group">
      <label class="toolbar-toggle" title="Автопрокладка маршрута">
        <input
          type="checkbox"
          :checked="routingMode === 'auto'"
          data-testid="routing-toggle"
          @change="$emit('toggleRouting')"
        />
        <span class="toggle-label">Авто</span>
      </label>
    </div>

    <!-- Spacer -->
    <div class="toolbar-spacer" />

    <!-- Stats -->
    <div class="toolbar-stats" data-testid="toolbar-stats">
      <span class="stat-item" title="Дистанция">
        📏 {{ distanceDisplay }}
      </span>
      <span class="stat-item" title="Точки"> 📍 {{ totalPoints }} </span>
    </div>

    <!-- Save button -->
    <div class="toolbar-group">
      <button
        class="toolbar-btn save-btn"
        :disabled="!canSave || saving"
        title="Сохранить (Ctrl+Shift+S)"
        data-testid="save-btn"
        @click="$emit('save')"
      >
        {{ saving ? "Сохранение..." : "Сохранить" }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  mode: { type: String, default: "edit" },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  totalPoints: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  routingMode: { type: String, default: "manual" },
});

defineEmits(["setMode", "undo", "redo", "save", "toggleRouting"]);

const modes = [
  { id: "view", label: "Просмотр", key: "F1", icon: "👁" },
  { id: "edit", label: "Рисование", key: "F2", icon: "✏️" },
  { id: "fragment", label: "Фрагменты", key: "F3", icon: "✂️" },
  { id: "routing", label: "Маршрут", key: "F4", icon: "🗺️" },
];

const distanceDisplay = computed(() => {
  const km = props.totalDistanceKm;
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(2)} км`;
});
</script>

<style scoped>
.track-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  z-index: 1000;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.15s;
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  background: #e8f0fe;
  border-color: #1976d2;
}

.toolbar-btn.active {
  background: #1976d2;
  color: #fff;
  border-color: #1565c0;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn-icon {
  font-size: 16px;
  line-height: 1;
}

.toolbar-btn-label {
  font-size: 12px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e0e0e0;
  margin: 0 4px;
}

.toolbar-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #555;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #555;
  padding: 0 8px;
}

.stat-item {
  white-space: nowrap;
}

.save-btn {
  background: #1976d2;
  color: #fff;
  border-color: #1565c0;
  font-weight: 500;
}

.save-btn:hover:not(:disabled) {
  background: #1565c0;
}

.toggle-label {
  user-select: none;
}
</style>
