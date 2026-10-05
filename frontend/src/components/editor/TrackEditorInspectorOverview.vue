<template>
  <div
    class="track-editor-inspector-overview"
    data-testid="track-editor-inspector-overview"
  >
    <div
      v-if="showContextAlerts && showDraftBanner"
      class="draft-banner"
      data-testid="draft-banner"
    >
      <p>An unsaved draft was found. Restore it?</p>
      <div class="draft-actions">
        <button
          class="btn-primary btn-sm ui-primary"
          data-testid="overview-restore-draft"
          @click="$emit('restoreDraft')"
        >
          Restore
        </button>
        <button
          class="btn-secondary btn-sm ui-secondary"
          data-testid="overview-delete-draft"
          @click="$emit('deleteDraft')"
        >
          Delete
        </button>
      </div>
    </div>

    <div
      v-if="showContextAlerts && error"
      class="error-banner"
      data-testid="error-banner"
    >
      <p>{{ error }}</p>
    </div>

    <div
      v-if="showContextAlerts && totalPoints < 2"
      class="info-banner"
      data-testid="editor-tips"
    >
      <p>
        Click on the map to add points. Use F1–F4 to switch modes and Ctrl+Z/Y
        for undo/redo.
      </p>
    </div>

    <section class="sidebar-section">
      <h3 class="section-title">
        Track metadata
      </h3>
      <div class="form-group">
        <label
          for="track-name"
          class="form-label"
        >
          Name <span class="required">*</span>
        </label>
        <input
          id="track-name"
          type="text"
          class="form-input ui-field"
          :value="trackName"
          maxlength="255"
          placeholder="Enter track name"
          data-testid="track-name-input"
          @input="$emit('update:trackName', $event.target.value)"
        >
        <span class="char-count">{{ trackName.length }} / 255</span>
      </div>

      <div class="form-group">
        <label
          for="track-desc"
          class="form-label"
        >Description</label>
        <textarea
          id="track-desc"
          class="form-input form-textarea ui-field"
          :value="trackDescription"
          maxlength="5000"
          rows="3"
          placeholder="Route description (optional)"
          data-testid="track-desc-input"
          @input="$emit('update:trackDescription', $event.target.value)"
        />
        <span class="char-count">{{ trackDescription.length }} / 5000</span>
      </div>

      <div class="form-group">
        <TrackCategoryPicker :model-value="trackCategories" @update:model-value="$emit('update:trackCategories', $event)" />
      </div>
    </section>
  </div>
</template>

<script setup>
import TrackCategoryPicker from "../TrackCategoryPicker.vue";
const props = defineProps({
  showContextAlerts: { type: Boolean, default: true },
  showDraftBanner: { type: Boolean, default: false },
  error: { type: String, default: null },
  totalPoints: { type: Number, default: 0 },
  trackName: { type: String, default: "" },
  trackDescription: { type: String, default: "" },
  trackCategories: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "restoreDraft",
  "deleteDraft",
  "update:trackName",
  "update:trackDescription",
  "update:trackCategories",
]);

</script>

<style scoped>
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

.info-banner {
  background: #e8f0fe;
  border-bottom: 1px solid #c7d7fb;
  padding: 10px 12px;
  font-size: 12px;
  color: #1a4fa3;
}

.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink);
  margin: 0 0 8px;
}

.form-group {
  margin-bottom: 10px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted);
  margin-bottom: 4px;
}

.required {
  color: #d32f2f;
}

.form-input { box-sizing: border-box; }

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 11px;
  color: var(--color-muted);
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
  position:absolute; width:1px; height:1px; opacity:0;
}
.category-chip:focus-within { outline:3px solid var(--color-action); outline-offset:2px; }

.category-chip:hover {
  border-color: var(--accent);
}

.category-chip.selected {
  background: #e8f0fe;
  border-color: var(--accent);
  color: #1565c0;
}

.btn-sm {
  padding: 4px 10px;
}
</style>
