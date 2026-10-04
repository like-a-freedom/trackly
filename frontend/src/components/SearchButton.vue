<template>
  <button
    class="search-button"
    title="Search tracks"
    @click="openSearch"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <circle
        cx="11"
        cy="11"
        r="8"
      />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  </button>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  "open-search": [];
}>();

const openSearch = () => {
  emit("open-search");
};
</script>

<style scoped>
.search-button {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  color: #666;
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
}

.search-button svg {
  stroke: #666;
  width: 20px;
  height: 20px;
  transition: stroke 0.2s;
}

.search-button:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.search-button:hover svg {
  stroke: #333;
}

.search-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Touch sizing keys on the input mode, not the viewport: a touch iPad is
   768px wide and still needs 44px targets. The width arm keeps a narrow
   desktop window correct. The solid background also replaces the
   backdrop blur, which Safari drops on a fixed element anyway. */
@media (max-width: 640px), (pointer: coarse) {
  .search-button {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .search-button svg {
    width: 22px;
    height: 22px;
    stroke: #666 !important;
  }
}
</style>
