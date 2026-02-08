<template>
  <div class="track-editor-sidebar">
    <!-- Draft recovery banner -->
    <div v-if="showDraftBanner" class="draft-banner" data-testid="draft-banner">
      <p>Обнаружен несохранённый черновик. Восстановить?</p>
      <div class="draft-actions">
        <button class="btn-primary btn-sm" @click="$emit('restoreDraft')">
          Восстановить
        </button>
        <button class="btn-secondary btn-sm" @click="$emit('deleteDraft')">
          Удалить
        </button>
      </div>
    </div>

    <!-- Error display -->
    <div v-if="error" class="error-banner" data-testid="error-banner">
      <p>{{ error }}</p>
    </div>

    <!-- Metadata form -->
    <section class="sidebar-section">
      <h3 class="section-title">Метаданные трека</h3>
      <div class="form-group">
        <label for="track-name" class="form-label">
          Название <span class="required">*</span>
        </label>
        <input
          id="track-name"
          type="text"
          class="form-input"
          :value="trackName"
          maxlength="255"
          placeholder="Введите название трека"
          data-testid="track-name-input"
          @input="$emit('update:trackName', $event.target.value)"
        />
        <span class="char-count">{{ trackName.length }} / 255</span>
      </div>

      <div class="form-group">
        <label for="track-desc" class="form-label">Описание</label>
        <textarea
          id="track-desc"
          class="form-input form-textarea"
          :value="trackDescription"
          maxlength="5000"
          rows="3"
          placeholder="Описание маршрута (опционально)"
          data-testid="track-desc-input"
          @input="$emit('update:trackDescription', $event.target.value)"
        />
        <span class="char-count">{{ trackDescription.length }} / 5000</span>
      </div>

      <div class="form-group">
        <label class="form-label">Категории</label>
        <div class="category-chips">
          <label
            v-for="cat in availableCategories"
            :key="cat.id"
            class="category-chip"
            :class="{ selected: trackCategories.includes(cat.id) }"
          >
            <input
              type="checkbox"
              :value="cat.id"
              :checked="trackCategories.includes(cat.id)"
              @change="handleCategoryToggle(cat.id)"
            />
            <span>{{ cat.icon }} {{ cat.label }}</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Segments list -->
    <section class="sidebar-section">
      <div class="section-header">
        <h3 class="section-title">Сегменты</h3>
        <button
          class="btn-icon"
          title="Новый сегмент (Ctrl+S)"
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
          :class="{ active: i === activeSegmentIndex }"
          data-testid="segment-item"
          @click="$emit('setActiveSegment', i)"
        >
          <span class="segment-color" :style="{ background: stat.color }" />
          <span class="segment-info">
            Сегмент {{ i + 1 }}
            <small
              >{{ stat.pointCount }} точек ·
              {{ formatDistance(stat.distanceKm) }}</small
            >
          </span>
          <div class="segment-actions">
            <button
              v-if="i < segmentStats.length - 1"
              class="btn-icon-sm"
              title="Объединить со следующим (Ctrl+J)"
              data-testid="join-segment-btn"
              @click.stop="$emit('joinSegments', i, i + 1)"
            >
              ⇋
            </button>
            <button
              class="btn-icon-sm"
              title="Развернуть"
              @click.stop="$emit('reverseSegment', i)"
            >
              ↔
            </button>
            <button
              class="btn-icon-sm danger"
              title="Удалить сегмент"
              @click.stop="$emit('deleteSegment', i)"
            >
              ✕
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- POI list -->
    <section
      v-if="pois.length > 0"
      class="sidebar-section"
      data-testid="poi-section"
    >
      <div class="section-header">
        <h3 class="section-title">POI ({{ pois.length }})</h3>
      </div>
      <ul class="poi-list">
        <li
          v-for="(poi, i) in pois"
          :key="i"
          class="poi-item"
          data-testid="poi-item"
        >
          <span class="poi-icon">📍</span>
          <span class="poi-info">
            {{ poi.name || `POI ${i + 1}` }}
            <small v-if="poi.description">{{ poi.description }}</small>
            <small v-if="poi.distFromStart"
              >📏 {{ formatDistanceM(poi.distFromStart) }} от старта</small
            >
            <small v-if="poi.isFarFromTrack" class="poi-warning"
              >⚠️ >1 км от трека</small
            >
          </span>
          <button
            class="btn-icon-sm danger"
            title="Удалить POI"
            @click.stop="$emit('deletePoi', i)"
          >
            ✕
          </button>
        </li>
      </ul>
    </section>

    <!-- Elevation profile -->
    <section class="sidebar-section" data-testid="elevation-section">
      <div class="section-header">
        <h3 class="section-title">Профиль высот</h3>
      </div>
      <div v-if="elevationLoading" class="elevation-status">
        Загрузка профиля...
      </div>
      <div v-else-if="elevationError" class="elevation-status error">
        {{ elevationError }}
      </div>
      <ElevationChart
        v-else
        :elevationData="elevationProfile"
        :elevationStats="elevationStats"
        :totalDistance="totalDistanceKm"
        :coordinateData="coordinateData"
        chartMode="elevation"
      />
    </section>

    <!-- Summary -->
    <section
      class="sidebar-section summary-section"
      data-testid="track-summary"
    >
      <div class="summary-row">
        <span>Дистанция</span>
        <strong>{{ formatDistance(totalDistanceKm) }}</strong>
      </div>
      <div class="summary-row">
        <span>Время (оценка)</span>
        <strong>{{ timeDisplay }}</strong>
      </div>
      <div class="summary-row">
        <span>Точки</span>
        <strong>{{ totalPoints }}</strong>
      </div>
      <div class="summary-row">
        <span>Сегменты</span>
        <strong>{{ segmentStats.length }}</strong>
      </div>
      <div v-if="pois.length > 0" class="summary-row">
        <span>POI</span>
        <strong>{{ pois.length }}</strong>
      </div>
    </section>
  </div>
</template>

<script setup>
const props = defineProps({
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
  segmentStats: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  estimatedTimeMinutes: { type: Number, default: 0 },
  error: { type: String, default: null },
  showDraftBanner: { type: Boolean, default: false },
  pois: { type: Array, default: () => [] },
  elevationProfile: { type: Array, default: () => [] },
  elevationStats: { type: Object, default: () => ({}) },
  elevationLoading: { type: Boolean, default: false },
  elevationError: { type: String, default: null },
  coordinateData: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "update:trackName",
  "update:trackDescription",
  "update:trackCategories",
  "addSegment",
  "deleteSegment",
  "reverseSegment",
  "setActiveSegment",
  "joinSegments",
  "restoreDraft",
  "deleteDraft",
  "deletePoi",
]);

const availableCategories = [
  { id: "hiking", label: "Пеший", icon: "🥾" },
  { id: "walking", label: "Прогулка", icon: "🚶" },
  { id: "running", label: "Бег", icon: "🏃" },
  { id: "cycling", label: "Велосипед", icon: "🚴" },
];

function handleCategoryToggle(catId) {
  const current = [...props.trackCategories];
  const index = current.indexOf(catId);
  if (index >= 0) {
    current.splice(index, 1);
  } else {
    current.push(catId);
  }
  emit("update:trackCategories", current);
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(2)} км`;
}

function formatDistanceM(meters) {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

import { computed } from "vue";
import ElevationChart from "./ElevationChart.vue";

const timeDisplay = computed(() => {
  const mins = props.estimatedTimeMinutes;
  if (mins <= 0) return "0 мин";
  if (mins < 60) return `${Math.round(mins)} мин`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
});
</script>

<style scoped>
.track-editor-sidebar {
  width: 320px;
  min-width: 280px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.draft-banner {
  background: #fff3e0;
  border-bottom: 1px solid #ffe0b2;
  padding: 10px 12px;
}

.draft-banner p {
  margin: 0 0 8px;
  font-size: 13px;
  color: #e65100;
}

.draft-actions {
  display: flex;
  gap: 8px;
}

.error-banner {
  background: #fce4ec;
  border-bottom: 1px solid #ef9a9a;
  padding: 10px 12px;
  color: #c62828;
}

.error-banner p {
  margin: 0;
}

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

.form-group {
  margin-bottom: 10px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #555;
  margin-bottom: 4px;
}

.required {
  color: #d32f2f;
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

.form-input:focus {
  outline: none;
  border-color: #1976d2;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.category-chip input {
  display: none;
}

.category-chip:hover {
  border-color: #1976d2;
}

.category-chip.selected {
  background: #e8f0fe;
  border-color: #1976d2;
  color: #1565c0;
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

.btn-primary {
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-secondary {
  background: #eee;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-sm {
  padding: 4px 10px;
}

.summary-section {
  background: #fafafa;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  color: #555;
}

.summary-row strong {
  color: #333;
}

.poi-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.poi-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.poi-item:hover {
  background: #f5f5f5;
}

.poi-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.poi-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.poi-info small {
  display: block;
  color: #888;
  font-size: 11px;
}

.poi-warning {
  color: #d32f2f;
  font-weight: 600;
}

.elevation-status {
  font-size: 12px;
  color: #555;
  padding: 6px 0;
}

.elevation-status.error {
  color: #c62828;
}

@media (max-width: 640px) {
  .track-editor-sidebar {
    width: 100%;
    min-width: 0;
    border-left: none;
    border-top: 1px solid #e0e0e0;
    max-height: 40vh;
  }
}
</style>
