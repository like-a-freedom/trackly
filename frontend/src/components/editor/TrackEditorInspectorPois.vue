<template>
  <section
    v-if="pois.length > 0"
    class="sidebar-section"
    data-testid="poi-section"
  >
    <div class="section-header">
      <h3 class="section-title">
        POI ({{ pois.length }})
      </h3>
    </div>
    <ul class="poi-list">
      <li
        v-for="(poi, i) in pois"
        :key="i"
        class="poi-item"
        data-testid="poi-item"
      >
        <span class="poi-icon">📍</span>
        <span
          v-if="poiEditIndex !== i"
          class="poi-info"
        >
          {{ poi.name || `POI ${i + 1}` }}
          <small v-if="poi.description">{{ poi.description }}</small>
          <small v-if="poi.distFromStart">📏 {{ formatDistanceM(poi.distFromStart) }} from start</small>
          <small
            v-if="poi.isFarFromTrack"
            class="poi-warning"
          >⚠️ >1 km from track</small>
        </span>
        <div
          v-else
          class="poi-edit"
        >
          <input
            v-model="poiEditDraft.name"
            class="form-input"
            type="text"
            maxlength="80"
            placeholder="POI name"
            data-testid="poi-edit-name"
          >
          <textarea
            v-model="poiEditDraft.description"
            class="form-input form-textarea"
            rows="2"
            maxlength="500"
            placeholder="Description (optional)"
            data-testid="poi-edit-description"
          />
          <select
            v-model="poiEditDraft.category"
            class="form-input"
            data-testid="poi-edit-category"
          >
            <option value="">
              Category: none
            </option>
            <option
              v-for="cat in poiCategories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.icon }} {{ cat.label }}
            </option>
          </select>
          <div class="poi-edit-actions">
            <button
              class="btn-secondary btn-sm"
              data-testid="poi-save-btn"
              @click.stop="savePoiEdit"
            >
              Save
            </button>
            <button
              class="btn-secondary btn-sm"
              data-testid="poi-cancel-btn"
              @click.stop="cancelPoiEdit"
            >
              Cancel
            </button>
          </div>
        </div>
        <button
          v-if="poiEditIndex !== i"
          class="btn-icon-sm"
          title="Edit POI"
          data-testid="poi-edit-btn"
          @click.stop="startPoiEdit(i)"
        >
          ✎
        </button>
        <button
          v-if="poiEditIndex !== i"
          class="btn-icon-sm danger"
          title="Delete POI"
          data-testid="poi-delete-btn"
          @click.stop="$emit('deletePoi', i)"
        >
          ✕
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  pois: { type: Array, default: () => [] },
});

const emit = defineEmits(["deletePoi", "updatePoi"]);

const poiCategories = [
  { id: "water", label: "Water", icon: "💧" },
  { id: "camping", label: "Camping", icon: "⛺" },
  { id: "viewpoint", label: "Viewpoint", icon: "📷" },
  { id: "danger", label: "Danger", icon: "⚠️" },
  { id: "food", label: "Food", icon: "🍽️" },
  { id: "shelter", label: "Shelter", icon: "🏠" },
  { id: "other", label: "Other", icon: "📍" },
];

const poiEditIndex = ref(null);
const poiEditDraft = ref({
  name: "",
  description: "",
  category: "",
});

function formatDistanceM(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function startPoiEdit(index) {
  const poi = props.pois?.[index];
  if (!poi) return;
  poiEditIndex.value = index;
  poiEditDraft.value = {
    name: poi.name || "",
    description: poi.description || "",
    category: poi.category || "",
  };
}

function cancelPoiEdit() {
  poiEditIndex.value = null;
}

function savePoiEdit() {
  if (poiEditIndex.value === null || poiEditIndex.value === undefined) return;
  emit("updatePoi", poiEditIndex.value, {
    name: poiEditDraft.value.name,
    description: poiEditDraft.value.description,
    category: poiEditDraft.value.category,
  });
  poiEditIndex.value = null;
}

watch(
  () => props.pois.length,
  (nextLength) => {
    if (poiEditIndex.value !== null && poiEditIndex.value >= nextLength) {
      poiEditIndex.value = null;
    }
  }
);
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

.poi-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.poi-edit-actions {
  display: flex;
  gap: 6px;
}

.poi-warning {
  color: #d32f2f;
  font-weight: 600;
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
</style>
