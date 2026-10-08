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
  background: oklch(96.9% 0.0282 79.5);
  border-block-end: 1px solid oklch(92.1% 0.0687 77.5);
  padding: 10px 12px;
}

.draft-banner p {
  margin: 0 0 8px;
  font-size: 13px;
  color: oklch(63.1% 0.197 40.3);
}

.draft-actions {
  display: flex;
  gap: 8px;
}

.error-banner {
  background: oklch(94.1% 0.0282 355.4);
  border-block-end: 1px solid oklch(77.2% 0.1024 19.7);
  padding: 10px 12px;
  color: var(--color-danger);
}

.error-banner p {
  margin: 0;
}

.info-banner {
  background: oklch(95.3% 0.0207 261.8);
  border-block-end: 1px solid oklch(87.9% 0.0528 266.4);
  padding: 10px 12px;
  font-size: 12px;
  color: oklch(44.4% 0.147 259.6);
}

.sidebar-section {
  padding: 12px;
  border-block-end: 1px solid oklch(95.5% 0 none);
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink);
  margin: 0 0 8px;
}

.form-group {
  margin-block-end: 10px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted);
  margin-block-end: 4px;
}

.required {
  color: oklch(56.8% 0.2002 26.4);
}

.form-input { box-sizing: border-box; }

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.char-count {
  display: block;
  text-align: end;
  font-size: 11px;
  color: var(--color-muted);
  margin-block-start: 2px;
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
  border: 1px solid oklch(89.8% 0 none);
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 0.15s var(--ease-out, ease-out),
    border-color 0.15s var(--ease-out, ease-out),
    color 0.15s var(--ease-out, ease-out);
  user-select: none;
}

.category-chip input {
  position:absolute; width:1px; height:1px; opacity:0;
}
.category-chip:focus-within { outline:3px solid var(--color-action); outline-offset:2px; }

@media (hover: hover) and (pointer: fine) {
  .category-chip:hover {
    border-color: var(--accent);
  }
}

.category-chip:active {
  transform: scale(0.97);
}

.category-chip.selected {
  background: oklch(95.3% 0.0207 261.8);
  border-color: var(--accent);
  color: oklch(51.3% 0.1603 255.7);
}

.btn-sm {
  padding: 4px 10px;
}
</style>
