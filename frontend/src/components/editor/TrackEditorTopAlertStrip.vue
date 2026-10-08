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
  border: 1px solid oklch(92.9% 0.0126 255.5 / 0.9);
  background: oklch(100% 0 none / 0.96);
  box-shadow: 0 8px 20px oklch(20.8% 0.0398 265.8 / 0.06);
  backdrop-filter: blur(14px);
}

.top-alert strong {
  display: block;
  margin-block-end: 2px;
  color: oklch(20.8% 0.0398 265.8);
}

.top-alert p {
  margin: 0;
  color: oklch(44.6% 0.0374 257.3);
  font-size: 0.86rem;
  line-height: 1.35;
}

.top-alert--draft {
  border-color: oklch(83.7% 0.1165 66.3);
  background: oklch(98% 0.0158 73.7);
}

.top-alert--error {
  border-color: oklch(80.8% 0.1035 19.6);
  background: oklch(97.1% 0.0129 17.4);
}

.top-alert--info {
  border-color: oklch(88.2% 0.0571 254.1);
  background: oklch(97% 0.0142 254.6);
}

.top-alert--info strong {
  flex: 0 0 auto;
  margin-block-end: 0;
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
  border: 1px solid oklch(86.9% 0.0198 252.9 / 0.9);
  border-radius: 12px;
  background: var(--color-surface);
  color: oklch(20.8% 0.0398 265.8);
  padding: 7px 11px;
  cursor: pointer;
}

.top-alert-btn:active {
  transform: scale(0.97);
}

.top-alert-btn--primary {
  background: oklch(54.6% 0.2152 262.9);
  border-color: oklch(54.6% 0.2152 262.9);
  color: var(--color-surface);
}

@media (max-width: 768px) {
  .top-alert {
    flex-direction: column;
    align-items: flex-start;
  }

  .top-alert--info strong {
    margin-block-end: 2px;
  }
}

@media(max-width:900px) { .info-banner { padding:6px 12px; } .info-banner p { margin:0; font-size:13px; } .info-banner strong { display:none; } }

@media(max-width:900px) { .top-alert--info { padding:6px 12px; } .top-alert--info p { margin:0; font-size:13px; } .top-alert--info strong { display:none; } }
</style>
