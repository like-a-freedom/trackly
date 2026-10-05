<template>
  <section
    v-if="showDraftBanner || error || (totalPoints < 2 && !showDraftBanner)"
    class="track-editor-top-alert-strip"
    data-testid="top-alert-strip"
    aria-label="Editor alerts"
  >
    <div
      v-if="showDraftBanner"
      class="top-alert top-alert--draft"
      data-testid="top-alert-draft"
    >
      <div>
        <strong>Unsaved draft found</strong>
        <p>Restore your latest draft or remove it before starting fresh.</p>
      </div>
      <div class="top-alert-actions">
        <button
          class="top-alert-btn top-alert-btn--primary"
          data-testid="top-alert-restore-draft"
          @click="$emit('restoreDraft')"
        >
          Restore
        </button>
        <button
          class="top-alert-btn"
          data-testid="top-alert-delete-draft"
          @click="$emit('deleteDraft')"
        >
          Delete
        </button>
      </div>
    </div>

    <div
      v-if="error"
      class="top-alert top-alert--error"
      data-testid="top-alert-error"
      role="alert"
    >
      <strong>Editor error</strong>
      <p>{{ error }}</p>
    </div>

    <div
      v-if="totalPoints < 2"
      class="top-alert top-alert--info"
      data-testid="top-alert-tips"
    >
      <strong>Quick start</strong>
      <p>
        Click on the map to add points. Use F1–F4 to switch modes and Ctrl+Z/Y
        for undo/redo.
      </p>
    </div>
  </section>
</template>

<script setup>
defineProps({
  showDraftBanner: { type: Boolean, default: false },
  error: { type: String, default: null },
  totalPoints: { type: Number, default: 0 },
});

defineEmits(["restoreDraft", "deleteDraft"]);
</script>

<style scoped>
.track-editor-top-alert-strip {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  display: grid;
  gap: 6px;
}

.top-alert {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(14px);
}

.top-alert strong {
  display: block;
  margin-bottom: 2px;
  color: #0f172a;
}

.top-alert p {
  margin: 0;
  color: #475569;
  font-size: 0.86rem;
  line-height: 1.35;
}

.top-alert--draft {
  border-color: #fdba74;
  background: #fff7ed;
}

.top-alert--error {
  border-color: #fca5a5;
  background: #fef2f2;
}

.top-alert--info {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.top-alert--info strong {
  flex: 0 0 auto;
  margin-bottom: 0;
}

.top-alert--info p {
  flex: 1 1 auto;
}

.top-alert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.top-alert-btn {
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  padding: 7px 11px;
  cursor: pointer;
}

.top-alert-btn--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

@media (max-width: 768px) {
  .top-alert {
    flex-direction: column;
    align-items: flex-start;
  }

  .top-alert--info strong {
    margin-bottom: 2px;
  }
}

@media(max-width:900px) { .info-banner { padding:6px 12px; } .info-banner p { margin:0; font-size:13px; } .info-banner strong { display:none; } }

@media(max-width:900px) { .top-alert--info { padding:6px 12px; } .top-alert--info p { margin:0; font-size:13px; } .top-alert--info strong { display:none; } }
</style>
