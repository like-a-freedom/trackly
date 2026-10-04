<template>
  <div
    v-if="isVisible"
    class="search-overlay"
    @click.self="closeSearch"
    @keydown.esc.stop="closeSearch"
  >
    <div
      ref="searchModal"
      class="search-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-dialog-title"
      @keydown.tab="trapFocus"
    >
      <h2
        id="search-dialog-title"
        class="visually-hidden"
      >
        Search tracks
      </h2>
      <div class="search-input-container">
        <div class="search-icon"
             aria-hidden="true">
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
        </div>
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search tracks..."
          class="search-input"
          aria-label="Search tracks by name"
          @keydown.enter="onEnter"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @input="onInputChange"
        >
        <button
          v-if="searchQuery"
          class="clear-button"
          type="button"
          aria-label="Clear search query"
          @click="clearSearch"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            />
          </svg>
        </button>
      </div>

      <div
        v-if="isLoading"
        class="search-loading"
      >
        <div class="loading-spinner" />
        <span>Searching...</span>
      </div>

      <div
        v-else-if="searchResults.length > 0"
        class="search-results"
        role="listbox"
        :aria-activedescendant="activeResultId || undefined"
        aria-label="Search results"
        @touchstart.stop
        @touchmove.stop
        @touchend.stop
      >
        <div
          v-for="(track, index) in searchResults"
          :id="`search-result-${track.id}`"
          :key="track.id"
          class="search-result-item"
          :class="{ 'is-active': index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @click="selectTrack(track)"
          @mousemove="activeIndex = index"
        >
          <div class="track-info">
            <h3 class="track-name">
              {{ track.name }}
            </h3>
            <p
              v-if="track.description"
              class="track-description"
            >
              {{ track.description }}
            </p>
            <div class="track-meta">
              <span class="track-length">{{
                formatDistance(track.length_km ?? 0)
              }}</span>
              <span
                v-if="track.categories && track.categories.length > 0"
                class="track-categories"
              >
                {{ track.categories?.map(capitalize).join(", ") }}
              </span>
            </div>
          </div>
          <div class="track-arrow">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </div>
        </div>
      </div>

      <div
        v-else-if="searchQuery && !isLoading"
        class="no-results"
      >
        <div class="no-results-icon"
             aria-hidden="true">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
          >
            <circle
              cx="11"
              cy="11"
              r="8"
            />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <p>No tracks match "{{ searchQuery }}".</p>
        <p class="no-results-hint">
          Try a shorter name, or clear the search to browse the map.
        </p>
      </div>

      <!-- Announces result count to screen readers as the query narrows -->
      <div
        class="visually-hidden"
        role="status"
        aria-live="polite"
      >
        {{ statusMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { useSearchStore } from "../stores/search";
import { capitalize } from "../utils/string";

interface Track {
  id: string;
  name?: string;
  description?: string;
  length_km?: number;
  categories?: string[];
}

interface Props {
  isVisible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isVisible: false,
});

const emit = defineEmits<{
  close: [];
  "track-selected": [track: Track];
}>();

const searchInput = ref<HTMLInputElement | null>(null);
const searchModal = ref<HTMLElement | null>(null);
const isLoading = ref(false);
const searchTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const activeIndex = ref(-1);

// Use global search state
const searchStore = useSearchStore();
const { searchQuery } = storeToRefs(searchStore);
const searchResults = ref<Track[]>([]);
const { saveSearchState } = searchStore;
const hasSearchState = () => searchStore.hasSearchState;

const activeResultId = computed(() => {
  const track = searchResults.value[activeIndex.value];
  return track ? `search-result-${track.id}` : "";
});

const statusMessage = computed(() => {
  if (isLoading.value) return "Searching";
  if (!searchQuery.value.trim()) return "";
  const count = searchResults.value.length;
  if (count === 0) return `No tracks match ${searchQuery.value}`;
  return count === 1 ? "1 track found" : `${count} tracks found`;
});

// The element that opened the dialog, so focus can be handed back on close
let previouslyFocused: HTMLElement | null = null;

// Keep Tab and Shift+Tab inside the dialog. Without this, Tab walks into the
// map canvas behind the overlay and Escape stops reaching the close handler.
function trapFocus(event: KeyboardEvent): void {
  const modal = searchModal.value;
  if (!modal) return;

  const focusables = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);

  if (focusables.length === 0) return;

  const first = focusables[0] as HTMLElement;
  const last = focusables[focusables.length - 1] as HTMLElement;
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !modal.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

// Move the visual selection without moving DOM focus, so the caret in the
// input stays put while the option row is announced via aria-activedescendant.
function moveActive(delta: number): void {
  const count = searchResults.value.length;
  if (count === 0) return;
  const next = activeIndex.value + delta;
  activeIndex.value = next < 0 ? count - 1 : next >= count ? 0 : next;
}

// Watch for visibility to focus input and handle search restoration
watch(
  () => props.isVisible,
  (visible) => {
    if (visible) {
      // Safari does not focus a button on click, so body is a real outcome here.
      // Prefer the search trigger, and fall back to it when focus was on body.
      previouslyFocused = document.activeElement as HTMLElement | null;
      if (!previouslyFocused || previouslyFocused === document.body) {
        previouslyFocused =
          document.querySelector<HTMLElement>(".search-button") ?? null;
      }
      activeIndex.value = -1;
      nextTick(() => {
        searchInput.value?.focus();
        // If we have saved search state, perform search to restore results
        if (hasSearchState() && searchQuery.value.trim()) {
          performSearch();
        }
      });
    } else {
      // Return focus to whatever opened the dialog
      nextTick(() => {
        if (previouslyFocused?.isConnected) {
          previouslyFocused.focus();
        }
        previouslyFocused = null;
      });
    }
    // Don't clear search state when closing - preserve it for restoration
  },
);

const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
};

const onInputChange = () => {
  // Clear previous timeout
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }

  // Set new timeout for debounced search
  if (searchQuery.value.trim()) {
    searchTimeout.value = setTimeout(() => {
      performSearch();
    }, 300);
  } else {
    searchResults.value = [];
  }
  // A new query invalidates the previous selection
  activeIndex.value = -1;
};

// Enter selects the highlighted result if there is one, otherwise it searches.
const onEnter = (): void => {
  const track = searchResults.value[activeIndex.value];
  if (track) {
    selectTrack(track);
    return;
  }
  performSearch();
};

const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    activeIndex.value = -1;
    return;
  }

  isLoading.value = true;

  try {
    const response = await fetch(
      `/api/tracks/search?query=${encodeURIComponent(searchQuery.value)}`,
    );
    if (response.ok) {
      const results = await response.json();
      searchResults.value = results;
      activeIndex.value = results.length > 0 ? 0 : -1;
      // Save search state for potential restoration
      saveSearchState(searchQuery.value, results);
    } else {
      console.error("Search failed:", response.status);
      searchResults.value = [];
      activeIndex.value = -1;
    }
  } catch (error) {
    console.error("Search error:", error);
    searchResults.value = [];
    activeIndex.value = -1;
  } finally {
    isLoading.value = false;
  }
};

const selectTrack = (track: Track): void => {
  emit("track-selected", track);
};

const clearSearch = () => {
  searchQuery.value = "";
  searchResults.value = [];
  activeIndex.value = -1;
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
  // Keep focus in the field so clearing doesn't strand a keyboard user
  searchInput.value?.focus();
  // Don't clear saved search state here - only clear current search
};

const closeSearch = () => {
  emit("close");
};

onBeforeUnmount(() => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
});
</script>

<style scoped>
.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
}

.search-modal {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: 90%;
  max-width: 600px;
  max-height: 70vh;
  overflow: hidden;
  /* Prevent touch actions from propagating to map */
  touch-action: none;
}

.search-input-container {
  position: relative;
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.search-icon {
  color: #666;
  margin-inline-end: 12px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  /* 16px, not a scale step: anything smaller makes iOS Safari zoom the
     viewport on focus, which tears the dialog off screen. */
  font-size: 1rem;
  line-height: var(--leading-snug);
  background: transparent;
  color: #333;
  min-width: 0;
}

/* The field is borderless by design, so focus needs an explicit ring.
   It used to be `outline: none` with nothing in its place. */
.search-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}

.search-input::placeholder {
  color: #999;
}

.clear-button {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-inline-start: 8px;
}

.clear-button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.search-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #666;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top: 2px solid #666;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-inline-end: 12px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
  /* Allow vertical scrolling only within search results */
  touch-action: pan-y;
  /* Enable momentum scrolling on iOS */
  -webkit-overflow-scrolling: touch;
}

.search-result-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  transition: background-color 0.2s;
}

.search-result-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Keyboard selection. Distinguished by a left bar as well as the tint,
   so it never depends on colour alone. */
.search-result-item.is-active {
  background: rgba(25, 118, 210, 0.08);
  box-shadow: inset 3px 0 0 var(--accent);
}

.search-result-item:last-child {
  border-bottom: none;
}

.track-info {
  flex: 1;
  min-width: 0; /* lets a long name truncate instead of stretching the row */
}

/* hook */
.track-name {
  font-size: var(--text-md);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  margin: 0 0 4px 0;
  color: #333;
  text-wrap: balance;
}

/* bridge */
.track-description {
  font-size: var(--text-sm);
  color: #666;
  margin: 0 0 8px 0;
  line-height: var(--leading-normal);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-wrap: pretty;
}

/* detail */
.track-meta {
  display: flex;
  gap: 12px;
  font-size: var(--text-xs);
  color: #888;
}

.track-length {
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
}

.track-categories {
  opacity: 0.8;
}

.track-arrow {
  color: #ccc;
  margin-inline-start: 12px;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
  text-align: center;
}

.no-results-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-results p {
  margin: 0;
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  color: #333;
  text-wrap: balance;
}

.no-results-hint {
  margin-top: 8px !important;
  font-size: var(--text-sm) !important;
  font-weight: var(--weight-normal) !important;
  line-height: var(--leading-normal) !important;
  color: #777 !important;
  max-width: 40ch;
  text-wrap: pretty;
}

/* Available to assistive tech, absent from the visual layout */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  /* The h2 carries UA default type that would still be read aloud, so it is
     pinned to the base step rather than left at the browser's 2em heading. */
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
}

/* Force light theme for consistency with the rest of the interface */
</style>
