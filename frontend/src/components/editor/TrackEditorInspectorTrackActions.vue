<template>
  <section
    class="sidebar-section"
    data-testid="track-actions"
  >
    <div class="section-header">
      <h3 class="section-title">
        Track actions
      </h3>
    </div>
    <div class="track-actions">
      <button
        class="btn-secondary btn-sm"
        data-testid="duplicate-track-btn"
        @click="$emit('duplicateTrack')"
      >
        Duplicate track
      </button>
      <button
        class="btn-secondary btn-sm"
        data-testid="reverse-track-btn"
        @click="$emit('reverseTrack')"
      >
        Reverse track
      </button>
    </div>
  </section>
</template>

<script setup>
defineEmits(["duplicateTrack", "reverseTrack"]);
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

.track-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
