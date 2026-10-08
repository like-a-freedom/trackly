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
  background: oklch(100% 0 none / 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid oklch(0% 0 none / 0.08);
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px oklch(0% 0 none / 0.08);
  color: var(--color-muted);
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
}

.search-button svg {
  stroke: oklch(51% 0 none);
  width: 20px;
  height: 20px;
  transition: stroke 0.2s var(--ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .search-button:hover {
    background: oklch(100% 0 none);
    box-shadow: 0 4px 12px oklch(0% 0 none / 0.12);
    transform: translateY(-1px);
  }

  .search-button:hover svg {
    stroke: oklch(32.1% 0 none);
  }
}

.search-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px oklch(0% 0 none / 0.08);
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
    background: var(--color-surface);
    backdrop-filter: none;
    border: 1px solid oklch(0% 0 none / 0.12);
    box-shadow: 0 4px 12px oklch(0% 0 none / 0.15);
  }

  .search-button svg {
    width: 22px;
    height: 22px;
    stroke: oklch(51% 0 none) !important;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .search-button {
    transition: background-color 0.2s var(--ease-out, ease-out),
      box-shadow 0.2s var(--ease-out, ease-out),
      transform 0.2s var(--ease-out, ease-out);
  }
}
</style>
