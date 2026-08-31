<template>
  <section
    v-if="fragmentInfo"
    class="sidebar-section"
    data-testid="fragment-section"
  >
    <div class="section-header">
      <h3 class="section-title">
        Fragment tools
      </h3>
      <button
        class="btn-icon-sm"
        title="Clear selection"
        data-testid="fragment-clear-btn"
        @click="$emit('clearFragment')"
      >
        ✕
      </button>
    </div>
    <p class="fragment-meta">
      Segment {{ fragmentInfo.segIndex + 1 }} · Points:
      {{ fragmentInfo.points }}
      <span v-if="!fragmentInfo.complete"> · Select end point</span>
    </p>
    <div
      v-if="fragmentInfo.complete"
      class="fragment-actions"
    >
      <button
        class="btn-secondary btn-sm"
        data-testid="fragment-reroute-btn"
        @click="$emit('rerouteFragment')"
      >
        Reroute
      </button>
      <button
        class="btn-secondary btn-sm"
        data-testid="fragment-delete-connect-btn"
        @click="$emit('deleteFragmentConnect')"
      >
        Delete + Connect
      </button>
      <button
        class="btn-secondary btn-sm"
        data-testid="fragment-delete-split-btn"
        @click="$emit('deleteFragmentSplit')"
      >
        Delete + Split
      </button>
      <button
        class="btn-secondary btn-sm"
        data-testid="fragment-reverse-btn"
        @click="$emit('reverseFragment')"
      >
        Reverse
      </button>
      <button
        class="btn-secondary btn-sm"
        data-testid="fragment-export-btn"
        @click="$emit('exportFragment')"
      >
        Export GPX
      </button>
    </div>
  </section>
</template>

<script setup>
defineProps({
  fragmentInfo: { type: Object, default: null },
});

defineEmits([
  "clearFragment",
  "rerouteFragment",
  "deleteFragmentConnect",
  "deleteFragmentSplit",
  "reverseFragment",
  "exportFragment",
]);
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

.fragment-meta {
  font-size: 12px;
  color: #555;
  margin: 4px 0 8px;
}

.fragment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
