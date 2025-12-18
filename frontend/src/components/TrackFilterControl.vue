<template>
  <div class="track-filter-wrapper">
    <!-- Compact button is always present to avoid flicker; just hidden while expanded -->
    <div
      class="filter-button-compact"
      :class="{ hidden: isOpen }"
      title="Show filters"
      role="button"
      tabindex="0"
      :aria-pressed="String(!isOpen)"
      :aria-expanded="String(!isOpen)"
      :aria-hidden="String(isOpen)"
      aria-controls="track-filter-panel"
      @click="toggleOpen"
      @keydown.enter.prevent="toggleOpen"
      @keydown.space.prevent="toggleOpen"
    >
      <!-- Funnel icon for filters (collapsed state) -->
      <svg class="filter-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 5h18v2H3V5zm3 6h12v2H6v-2zm4 6h4v2h-4v-2z" />
      </svg>
    </div>

    <!-- Sliding panel when expanded -->
    <transition name="filter-slide-fade">
      <div
        v-show="isOpen"
        id="track-filter-panel"
        class="track-filter-control"
      >
        <div class="panel-header">
          <span class="panel-title">Filters</span>
          <div class="header-controls">
            <button
              class="filter-options-btn"
              type="button"
              title="Filter options"
              aria-label="Toggle filter options"
              @click="showFilterOptions = !showFilterOptions"
            >
              <svg class="options-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" />
              </svg>
            </button>
            <button
              class="collapse-btn"
              type="button"
              title="Collapse"
              aria-label="Collapse filters"
              @click="toggleOpen"
            >
              <svg class="collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <!-- Same arrow as UploadForm and TrackDetailPanel -->
                <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Filter options dropdown -->
        <div v-if="showFilterOptions" class="filter-options-panel">
          <div class="options-header">
            <span class="options-title">Show filters</span>
          </div>
          <div class="options-checkboxes">
            <div class="checkbox-item">
              <input
                id="show-categories"
                v-model="showCategories"
                type="checkbox"
                class="option-checkbox"
              />
              <label for="show-categories" class="checkbox-label">Categories</label>
            </div>
            <div class="checkbox-item">
              <input
                id="show-length"
                v-model="showLength"
                type="checkbox"
                class="option-checkbox"
              />
              <label for="show-length" class="checkbox-label">Track length</label>
            </div>
            <div class="checkbox-item">
              <input
                id="show-elevation"
                v-model="showElevation"
                type="checkbox"
                class="option-checkbox"
                :disabled="!hasElevationData"
              />
              <label for="show-elevation" class="checkbox-label" :class="{ disabled: !hasElevationData }">
                Elevation gain
                <span v-if="!hasElevationData" class="disabled-hint">(no data)</span>
              </label>
            </div>
            <div class="checkbox-item">
              <input
                id="show-slope"
                v-model="showSlope"
                type="checkbox"
                class="option-checkbox"
                :disabled="!hasSlopeData"
              />
              <label for="show-slope" class="checkbox-label" :class="{ disabled: !hasSlopeData }">
                Slope
                <span v-if="!hasSlopeData" class="disabled-hint">(no data)</span>
              </label>
            </div>

          </div>
        </div>
        <!-- Show filters when there are tracks in the area -->
        <template v-if="hasTracksInArea">
          <!-- My tracks checkbox is always shown -->
          <div class="filter-section my-tracks-section">
            <label>Ownership</label>
            <div class="checkbox-item">
              <input
                id="show-my-tracks"
                v-model="showMyTracks"
                type="checkbox"
                class="option-checkbox"
              />
              <label for="show-my-tracks" class="checkbox-label">My tracks</label>
            </div>
          </div>

          <!-- Other filters shown only when there are actual tracks in viewport -->
          <template v-if="hasTracksInViewport">
            <div v-if="showCategories" class="filter-section">
              <label>Categories</label>
              <div class="category-checkboxes" @touchstart.stop @touchmove.stop @touchend.stop>
                <div 
                  v-for="category in stableCategories" 
                  :key="category" 
                  class="checkbox-item"
                >
                  <input
                    :id="`category-${category}`"
                    v-model="selectedCategories"
                    type="checkbox"
                    :value="category"
                    class="category-checkbox"
                  />
                  <label :for="`category-${category}`" class="checkbox-label">
                      {{ capitalize(category) }}
                  </label>
                </div>
              </div>
            </div>

            <div v-if="showLength" class="filter-section">
              <label>Track length (km):</label>
              <Slider
                v-model="lengthRange"
                :min="stableMinLength"
                :max="stableMaxLength"
                :step="0.1"
                :tooltip="true"
                :lazy="true"
                :format="val => val.toFixed(2)"
                :range="true"
              />
            </div>
            <div v-if="showElevation && hasElevationData" class="filter-section">
              <label>Elevation gain (m):</label>
              <Slider
                v-model="elevationGainRange"
                :min="stableMinElevationGain"
                :max="stableMaxElevationGain"
                :step="10"
                :tooltip="true"
                :lazy="true"
                :format="val => `${Math.round(val)}m`"
                :range="true"
              />
            </div>
            <div v-if="showSlope && hasSlopeData" class="filter-section">
              <label>Slope (%):</label>
              <Slider
                v-model="slopeRange"
                :min="stableMinSlope"
                :max="stableMaxSlope"
                :step="0.1"
                :tooltip="true"
                :lazy="true"
                :format="val => `${val.toFixed(1)}%`"
                :range="true"
              />
            </div>
            <div class="filter-actions">
              <button @click="resetFilters">Reset</button>
            </div>
          </template>
          
          <!-- Show message when My tracks is active but no tracks found -->
          <div v-else-if="showMyTracks" class="no-tracks-placeholder">
            <div class="placeholder-icon">🔍</div>
            <div class="placeholder-text">
              <h3>No matching tracks</h3>
              <p>Try disabling "My tracks" filter</p>
            </div>
          </div>
        </template>

        <!-- Show placeholder when no tracks in area -->
        <div v-else class="no-tracks-placeholder">
          <div class="placeholder-icon">📍</div>
          <div class="placeholder-text">
            <h3>No tracks in this area yet</h3>
            <p>Wanna add one?</p>
          </div>
        </div>
      </div>
    </transition>
  </div>
  
</template>

<script setup>
import { ref, reactive, watch, onMounted, onUnmounted, computed } from 'vue';
import Slider from '@vueform/slider';
import '@vueform/slider/themes/default.css';
// Import debouncing functionality to prevent excessive filter updates
import { useAdvancedDebounce } from '../composables/useAdvancedDebounce';
import { useUnits } from '../composables/useUnits';
import { capitalize } from '../utils/string';

const props = defineProps({
  categories: Array, // All available categories (viewport-based)
  minLength: Number, // Minimum track length in km (viewport-based)
  maxLength: Number, // Maximum track length in km (viewport-based)
  minElevationGain: Number, // Minimum elevation gain in meters (viewport-based)
  maxElevationGain: Number, // Maximum elevation gain in meters (viewport-based)
  minSlope: Number, // Minimum track slope in percent (viewport-based)
  maxSlope: Number, // Maximum track slope in percent (viewport-based)
  globalCategories: Array, // All session categories for reset functionality
  globalMinLength: Number, // Global session minimum track length for reset functionality
  globalMaxLength: Number, // Global session maximum track length for reset functionality
  globalMinElevationGain: Number, // Global session minimum elevation gain for reset functionality
  globalMaxElevationGain: Number, // Global session maximum elevation gain for reset functionality
  globalMinSlope: Number, // Global session minimum slope for reset functionality
  globalMaxSlope: Number, // Global session maximum slope for reset functionality
  hasTracksInViewport: Boolean, // Whether there are actual tracks in the current viewport
  hasElevationData: Boolean, // Whether any tracks in viewport have elevation data
  hasSlopeData: Boolean, // Whether any tracks in viewport have slope data
});

const emit = defineEmits(['update:filter']);

// Debounced emit function to prevent excessive filter updates
const debouncedEmitFilter = useAdvancedDebounce((filterState) => {
  emit('update:filter', filterState);
}, 100, { leading: false, trailing: true });

// Track the previous myTracks value to detect changes
let previousMyTracksValue = false;

// Timeout for clearing pending state
let pendingClearTimeout = null;

// Also provide immediate emit for tests
const emitFilter = (filterState) => {
  // Check if myTracks filter specifically changed (this triggers server refetch)
  const myTracksChanged = filterState.myTracks !== previousMyTracksValue;
  previousMyTracksValue = filterState.myTracks;
  
  // If myTracks changed and we currently have tracks, mark as pending
  // to prevent flickering during data refresh
  if (myTracksChanged && props.hasTracksInViewport) {
    hadTracksBeforeFilter.value = true;
    isFilterPending.value = true;
    
    // Clear any existing timeout
    if (pendingClearTimeout) {
      clearTimeout(pendingClearTimeout);
    }
    
    // Auto-clear pending state after a reasonable time (in case watch doesn't fire)
    pendingClearTimeout = setTimeout(() => {
      isFilterPending.value = false;
    }, 1000);
  }
  
  if (import.meta.env.MODE === 'test') {
    // In test mode, emit immediately without debouncing
    emit('update:filter', filterState);
  } else {
    // In production, use debouncing
    debouncedEmitFilter(filterState);
  }
};

// Initialize global units (this ensures units are loaded on app startup)
useUnits();

// Track whether we're waiting for filter results to prevent flickering
// when toggling filters like "My tracks"
const isFilterPending = ref(false);
const hadTracksBeforeFilter = ref(false);

// Computed property to determine if there are tracks in the current area
// Uses grace period after filter changes to prevent flickering
const hasTracksInArea = computed(() => {
  // If we're in a pending filter state and had tracks before, keep showing filters
  // This prevents the "no tracks" placeholder from flickering during data refresh
  if (isFilterPending.value && hadTracksBeforeFilter.value) {
    return true;
  }
  
  // If we have stable categories (meaning data was loaded at some point), show filters
  // This prevents hiding filters when polylines temporarily becomes empty during updates
  if (stableCategories.value.length > 0) {
    return true;
  }
  
  // Use the prop passed from TrackMap that reflects actual tracks in viewport
  return props.hasTracksInViewport;
});

// Watch for changes in hasTracksInViewport to clear the pending state
// when the data has stabilized after a filter change
watch(() => props.hasTracksInViewport, (newValue, oldValue) => {
  // If we're in pending state and we get actual data (or stable empty state),
  // clear the pending flag after a brief delay to ensure data is settled
  if (isFilterPending.value) {
    // Clear any existing timeout
    if (pendingClearTimeout) {
      clearTimeout(pendingClearTimeout);
    }
    
    // Use a small timeout to allow for any rapid state changes to settle
    pendingClearTimeout = setTimeout(() => {
      isFilterPending.value = false;
      pendingClearTimeout = null;
      // Only reset hadTracksBeforeFilter when we're sure the state is stable
      if (!props.hasTracksInViewport) {
        hadTracksBeforeFilter.value = false;
      }
      // Now update stable values since data has settled
      updateStableValues();
    }, 150);
  }
});

// Update stable copies of props - only call when not in pending state
function updateStableValues() {
  // Update categories only if we have actual data, don't clear if empty
  if (props.categories && props.categories.length > 0) {
    stableCategories.value = [...props.categories];
  } else if (props.globalCategories && props.globalCategories.length > 0 && stableCategories.value.length === 0) {
    // If we have no stable categories yet, use global categories as fallback
    stableCategories.value = [...props.globalCategories];
  }
  
  if (typeof props.minLength === 'number') {
    stableMinLength.value = props.minLength;
  }
  if (typeof props.maxLength === 'number') {
    stableMaxLength.value = props.maxLength;
  }
  if (typeof props.minElevationGain === 'number') {
    stableMinElevationGain.value = props.minElevationGain;
  }
  if (typeof props.maxElevationGain === 'number') {
    stableMaxElevationGain.value = props.maxElevationGain;
  }
  if (typeof props.minSlope === 'number') {
    stableMinSlope.value = props.minSlope;
  }
  if (typeof props.maxSlope === 'number') {
    stableMaxSlope.value = props.maxSlope;
  }
}

// Watch props changes and update stable values only when NOT in pending state
watch(
  () => [props.categories, props.minLength, props.maxLength, props.minElevationGain, props.maxElevationGain, props.minSlope, props.maxSlope],
  () => {
    // Only update stable values if we're not waiting for filter results
    if (!isFilterPending.value) {
      updateStableValues();
    }
  },
  { deep: true }
);

const LOCAL_STORAGE_KEY = 'trackFiltersVue';
const LOCAL_UI_KEY = 'trackFiltersVueOpen';
const LOCAL_FILTER_OPTIONS_KEY = 'trackFilterOptions';

const selectedCategories = ref([]); // Will be set in onMounted
const lengthRange = ref([props.minLength, props.maxLength]);
const elevationGainRange = ref([props.minElevationGain, props.maxElevationGain]);
const slopeRange = ref([props.minSlope, props.maxSlope]);
const isOpen = ref(true);

// Stable local copies of props to prevent UI flickering during data refresh
// These are only updated when NOT in a pending filter state
const stableCategories = ref([]);
const stableMinLength = ref(0);
const stableMaxLength = ref(50);
const stableMinElevationGain = ref(0);
const stableMaxElevationGain = ref(2000);
const stableMinSlope = ref(0);
const stableMaxSlope = ref(20);

// Filter visibility options
const showFilterOptions = ref(false);
const showCategories = ref(true);
const showLength = ref(true);
const showElevation = ref(true);
const showSlope = ref(true);
// New option: show only tracks owned by current session
const showMyTracks = ref(false);

// Flag to track if values were restored from localStorage
const restoredFromLocalStorage = ref(false);

onMounted(() => {
  // Decide default open state (closed on mobile by default); guard against test env missing matchMedia
  let prefersClosed = false;
  try {
    const mm = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
    prefersClosed = !!(mm && typeof mm.matches === 'boolean' && mm.matches);
  } catch { /* ignore */ }
  isOpen.value = !prefersClosed;
  try {
    const savedOpen = localStorage.getItem(LOCAL_UI_KEY);
    if (savedOpen !== null) {
      isOpen.value = savedOpen === 'true';
    }
  } catch {}

  // Load filter visibility options
  try {
    const savedOptions = localStorage.getItem(LOCAL_FILTER_OPTIONS_KEY);
    if (savedOptions) {
      const options = JSON.parse(savedOptions);
      showCategories.value = options.showCategories ?? true;
      showLength.value = options.showLength ?? true;
      showElevation.value = options.showElevation ?? true;
      showSlope.value = options.showSlope ?? true;
      // Load the "my tracks" visibility option if present
      showMyTracks.value = options.showMyTracks ?? false;
    }
  } catch {}

  // Initialize with global session values if no saved preferences exist
  let initialCategories = props.globalCategories ? [...props.globalCategories] : [];
  let initialLengthRange = [props.globalMinLength, props.globalMaxLength];
  let initialElevationGainRange = [props.globalMinElevationGain || 0, props.globalMaxElevationGain || 2000];
  let initialSlopeRange = [props.globalMinSlope || 0, props.globalMaxSlope || 20];
  
  const savedFiltersRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedFiltersRaw) {
    try {
      const savedFilters = JSON.parse(savedFiltersRaw);
      if (Array.isArray(savedFilters.categories)) {
        // Use saved categories, they will be filtered by watchers if needed
        initialCategories = savedFilters.categories;
      }
      if (Array.isArray(savedFilters.lengthRange) && savedFilters.lengthRange.length === 2) {
        const [min, max] = savedFilters.lengthRange;
        // Validate that the range makes sense (min <= max)
        if (typeof min === 'number' && typeof max === 'number' && min <= max) {
          initialLengthRange = [...savedFilters.lengthRange];
          restoredFromLocalStorage.value = true;
        }
      }
      if (Array.isArray(savedFilters.elevationGainRange) && savedFilters.elevationGainRange.length === 2) {
        const [min, max] = savedFilters.elevationGainRange;
        // Validate that the range makes sense (min <= max)
        if (typeof min === 'number' && typeof max === 'number' && min <= max) {
          initialElevationGainRange = [...savedFilters.elevationGainRange];
          restoredFromLocalStorage.value = true;
        }
      }
      if (Array.isArray(savedFilters.slopeRange) && savedFilters.slopeRange.length === 2) {
        const [min, max] = savedFilters.slopeRange;
        // Validate that the range makes sense (min <= max)
        if (typeof min === 'number' && typeof max === 'number' && min <= max) {
          initialSlopeRange = [...savedFilters.slopeRange];
          restoredFromLocalStorage.value = true;
        }
      }
      if (typeof savedFilters.myTracks === 'boolean') {
        showMyTracks.value = savedFilters.myTracks;
      }
    } catch (e) {
      console.error('Failed to parse filter state from localStorage:', e);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }
  
  selectedCategories.value = initialCategories;
  lengthRange.value = initialLengthRange;
  elevationGainRange.value = initialElevationGainRange;
  slopeRange.value = initialSlopeRange;
  
  // Initialize stable values from props, preferring globalCategories to avoid empty state
  // Use categories if available and non-empty, otherwise use globalCategories
  if (props.categories && props.categories.length > 0) {
    stableCategories.value = [...props.categories];
  } else if (props.globalCategories && props.globalCategories.length > 0) {
    stableCategories.value = [...props.globalCategories];
  } else {
    stableCategories.value = [];
  }
  
  // For ranges, prefer current viewport values if available, otherwise use global defaults
  stableMinLength.value = typeof props.minLength === 'number' ? props.minLength : 
                           (typeof props.globalMinLength === 'number' ? props.globalMinLength : 0);
  stableMaxLength.value = typeof props.maxLength === 'number' ? props.maxLength : 
                           (typeof props.globalMaxLength === 'number' ? props.globalMaxLength : 50);
  stableMinElevationGain.value = typeof props.minElevationGain === 'number' ? props.minElevationGain : 
                                  (typeof props.globalMinElevationGain === 'number' ? props.globalMinElevationGain : 0);
  stableMaxElevationGain.value = typeof props.maxElevationGain === 'number' ? props.maxElevationGain : 
                                  (typeof props.globalMaxElevationGain === 'number' ? props.globalMaxElevationGain : 2000);
  stableMinSlope.value = typeof props.minSlope === 'number' ? props.minSlope : 
                          (typeof props.globalMinSlope === 'number' ? props.globalMinSlope : 0);
  stableMaxSlope.value = typeof props.maxSlope === 'number' ? props.maxSlope : 
                          (typeof props.globalMaxSlope === 'number' ? props.globalMaxSlope : 20);
  
  // Synchronize previousMyTracksValue with the initial showMyTracks state
  // to prevent false positive detection of "change" on first emit
  previousMyTracksValue = showMyTracks.value;

  // Emit initial filter state
  emitFilter({
    categories: selectedCategories.value,
    lengthRange: lengthRange.value,
    elevationGainRange: elevationGainRange.value,
    slopeRange: slopeRange.value,
    myTracks: showMyTracks.value,
  });
});

watch(isOpen, (val) => {
  try { localStorage.setItem(LOCAL_UI_KEY, String(val)); } catch {}
});

// Save filter visibility options
watch([showCategories, showLength, showElevation, showSlope], () => {
  try {
    localStorage.setItem(LOCAL_FILTER_OPTIONS_KEY, JSON.stringify({
      showCategories: showCategories.value,
      showLength: showLength.value,
      showElevation: showElevation.value,
      showSlope: showSlope.value,
      showMyTracks: showMyTracks.value,
    }));
  } catch {}
});

watch(() => props.categories, (newCategories) => {
  // Don't re-emit during pending filter state to prevent flickering
  if (isFilterPending.value) {
    return;
  }
  
  // Don't automatically change user selections based on viewport changes
  // But we need to re-emit so parent gets filtered values for the new viewport
  const validCategories = newCategories ? selectedCategories.value.filter(cat => newCategories.includes(cat)) : selectedCategories.value;
  
  emitFilter({
    categories: validCategories,
    lengthRange: lengthRange.value,
    elevationGainRange: elevationGainRange.value,
    slopeRange: slopeRange.value,
    myTracks: showMyTracks.value,
  });
});

let prevMinLength = props.minLength;
let prevMaxLength = props.maxLength;
let prevMinElevationGain = props.minElevationGain;
let prevMaxElevationGain = props.maxElevationGain;
let prevMinSlope = props.minSlope;
let prevMaxSlope = props.maxSlope;

watch(
  () => [props.minLength, props.maxLength, props.minElevationGain, props.maxElevationGain, props.minSlope, props.maxSlope],
  ([newMinLength, newMaxLength, newMinElevationGain, newMaxElevationGain, newMinSlope, newMaxSlope], [oldMinLength, oldMaxLength, oldMinElevationGain, oldMaxElevationGain, oldMinSlope, oldMaxSlope]) => {
    // Don't automatically change user selections based on viewport changes
    // The main watcher will clamp values when emitting to parent
    prevMinLength = newMinLength;
    prevMaxLength = newMaxLength;
    prevMinElevationGain = newMinElevationGain;
    prevMaxElevationGain = newMaxElevationGain;
    prevMinSlope = newMinSlope;
    prevMaxSlope = newMaxSlope;
  }
);

watch([selectedCategories, lengthRange, elevationGainRange, slopeRange, showMyTracks], ([cats, lengthRange, elevationGainRange, slopeRange, myTracks], [oldCats, oldLengthRange, oldElevationGainRange, oldSlopeRange, oldMyTracks]) => {
  // Emit validated values (filtered to what's available in current viewport)
  const validCategories = props.categories ? cats.filter(cat => props.categories.includes(cat)) : cats;
  let validLengthRange = lengthRange;
  let validElevationGainRange = elevationGainRange;
  let validSlopeRange = slopeRange;
  
  // Clamp length range to current viewport bounds
  if (props.minLength !== undefined && props.maxLength !== undefined) {
    const [min, max] = lengthRange;
    const clampedMin = Math.max(props.minLength, Math.min(props.maxLength, min));
    const clampedMax = Math.max(props.minLength, Math.min(props.maxLength, max));
    if (clampedMin <= clampedMax) {
      validLengthRange = [clampedMin, clampedMax];
    } else {
      validLengthRange = [props.minLength, props.maxLength];
    }
  }
  
  // Clamp elevation gain range to current viewport bounds
  if (props.minElevationGain !== undefined && props.maxElevationGain !== undefined) {
    const [min, max] = elevationGainRange;
    const clampedMin = Math.max(props.minElevationGain, Math.min(props.maxElevationGain, min));
    const clampedMax = Math.max(props.minElevationGain, Math.min(props.maxElevationGain, max));
    if (clampedMin <= clampedMax) {
      validElevationGainRange = [clampedMin, clampedMax];
    } else {
      validElevationGainRange = [props.minElevationGain, props.maxElevationGain];
    }
  }
  
  // Clamp slope range to current viewport bounds
  if (props.minSlope !== undefined && props.maxSlope !== undefined) {
    const [min, max] = slopeRange;
    const clampedMin = Math.max(props.minSlope, Math.min(props.maxSlope, min));
    const clampedMax = Math.max(props.minSlope, Math.min(props.maxSlope, max));
    if (clampedMin <= clampedMax) {
      validSlopeRange = [clampedMin, clampedMax];
    } else {
      validSlopeRange = [props.minSlope, props.maxSlope];
    }
  }
  
  emitFilter({
    categories: validCategories,
    lengthRange: validLengthRange,
    elevationGainRange: validElevationGainRange,
    slopeRange: validSlopeRange,
    myTracks: showMyTracks.value,
  });
  
  // Always persist user's actual choice (not the clamped values)
  if (cats !== null && cats !== undefined && lengthRange && lengthRange.length === 2 && elevationGainRange && elevationGainRange.length === 2 && slopeRange && slopeRange.length === 2) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      categories: cats,
      lengthRange: lengthRange,
      elevationGainRange: elevationGainRange,
      slopeRange: slopeRange,
      myTracks: showMyTracks.value,
    }));
  }
}, { deep: true });

function resetFilters() {
  // Use global session values for reset instead of viewport-based props
  // This ensures that reset doesn't change when user zooms in/out
  selectedCategories.value = props.globalCategories ? [...props.globalCategories] : [];
  lengthRange.value = [props.globalMinLength || 0, props.globalMaxLength || 50];
  elevationGainRange.value = [props.globalMinElevationGain || 0, props.globalMaxElevationGain || 2000];
  slopeRange.value = [props.globalMinSlope || 0, props.globalMaxSlope || 20];
  showMyTracks.value = false;
  // Immediately persist reset state
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    categories: selectedCategories.value,
    lengthRange: lengthRange.value,
    elevationGainRange: elevationGainRange.value,
    slopeRange: slopeRange.value,
    myTracks: showMyTracks.value,
  }));
  // Also persist options (visibility checkbox state)
  try {
    localStorage.setItem(LOCAL_FILTER_OPTIONS_KEY, JSON.stringify({
      showCategories: showCategories.value,
      showLength: showLength.value,
      showElevation: showElevation.value,
      showSlope: showSlope.value,
      showMyTracks: showMyTracks.value,
    }));
  } catch (e) {
    // ignore
  }
}

function toggleOpen() {
  isOpen.value = !isOpen.value;
  // Close filter options when collapsing the panel
  if (!isOpen.value) {
    showFilterOptions.value = false;
  }
}

// Close filter options when clicking outside
function handleClickOutside(event) {
  if (showFilterOptions.value && !event.target.closest('.filter-options-panel') && !event.target.closest('.filter-options-btn')) {
    showFilterOptions.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  // Clean up debounced function
  if (debouncedEmitFilter && debouncedEmitFilter.cancel) {
    debouncedEmitFilter.cancel();
  }
  // Clean up pending timeout
  if (pendingClearTimeout) {
    clearTimeout(pendingClearTimeout);
  }
});
</script>

<style scoped>
.track-filter-wrapper {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1300; /* Higher than SearchButton's 1200 */
}

.filter-button-compact {
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  color: #666;
  border: 1px solid rgba(0, 0, 0, 0.08);
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
}

.filter-button-compact:hover {
  transform: translateY(-1px);
  color: #333;
}

.filter-button-compact.hidden {
  pointer-events: none;
  opacity: 0;
}

.filter-icon { 
  width: 20px; 
  height: 20px; 
}

.track-filter-control {
  position: relative !important;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
  padding: 16px !important;
  z-index: 1300; /* Same as wrapper */
  min-width: 210px;
  max-width: 320px;
  width: 320px !important;
  transition: height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  box-sizing: border-box !important;
  margin-top: 8px; /* space from button */
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -8px -8px 8px -8px; /* pull to edges visually */
  padding: 8px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
}

.filter-options-btn,
.collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: #666;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s, color 0.2s;
}

.filter-options-btn:hover,
.collapse-btn:hover { 
  background: #f5f5f5; 
  color: #333; 
  transform: translateY(-1px); 
}

.options-icon,
.collapse-icon { 
  display: block;
  flex-shrink: 0;
}

/* Filter options panel */
.filter-options-panel {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  animation: fadeInDown 0.2s ease;
}

.options-header {
  margin-bottom: 10px;
}

.options-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: #495057;
}

.options-checkboxes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.option-checkbox,
.category-checkbox {
  width: 16px;
  height: 16px;
  margin: 0 !important;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  top: 2px; /* Align checkbox center with text center */
}

.option-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.checkbox-label.disabled {
  color: #999;
  cursor: not-allowed;
}

.disabled-hint {
  font-size: 0.75rem;
  color: #999;
  font-style: italic;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.filter-section {
  margin-bottom: 12px;
}
.filter-section label {
  display: block;
  margin-bottom: 12px;
  font-weight: 500;
}

/* Space before actions for consistency with other sections */
.filter-actions {
  margin-top: 12px;
}

/* Add padding for the slider inside the filter-section */
.filter-section .slider-target {
  display: block;
  width: 95%;
  min-width: 0;
  box-sizing: border-box;
  padding-left: 15px;
  padding-right: 15px;
  margin-left: auto;
  margin-right: auto;
  margin-top: 40px;
  margin-bottom: 20px;
}

/* Make slider tooltips smaller and more compact */
:deep(.slider-tooltip) {
  font-size: 0.87rem !important; /* Harmonize with form text */
  font-weight: 500 !important;
  min-width: 14px !important;
  padding: 2px 4px !important;
  border-radius: 3px !important;
  line-height: 1.1 !important;
  --slider-tooltip-font-size: 0.87rem;
  --slider-tooltip-line-height: 1.1;
  --slider-tooltip-font-weight: 500;
  --slider-tooltip-min-width: 14px;
  --slider-tooltip-py: 0px;
  --slider-tooltip-px: 4px;
  --slider-tooltip-radius: 3px;
}

/* Harmonize checkbox styling with form text */
.category-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  max-height: 200px;
  overflow-y: auto;
  /* Allow vertical scrolling only within this container */
  touch-action: pan-y;
  /* Enable momentum scrolling on iOS */
  -webkit-overflow-scrolling: touch;
}

.checkbox-item {
  display: flex;
  align-items: flex-start; /* Align to top, then adjust checkbox manually */
  gap: 8px;
  min-height: 24px;
  position: relative;
}

.checkbox-label {
  font-size: 0.87rem;
  font-weight: 400;
  cursor: pointer;
  margin: 0;
  padding: 0;
  flex: 1;
  line-height: 1.4; /* Natural line height for better readability */
  padding-top: 0;
}

.track-filter-control,
.filter-section label,
button {
  font-size: 0.87rem;
}

.filter-actions {
  text-align: right;
}
button {
  background: #eee;
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.2s;
}
button:hover {
  background: #ddd;
}

.no-tracks-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 16px;
  color: #666;
  width: 100%;
  box-sizing: border-box;
  min-height: 120px;
}

.placeholder-icon {
  font-size: 2rem;
  margin-bottom: 12px;
  opacity: 0.7;
}

.placeholder-text h3 {
  font-size: 0.9rem;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: #555;
}

.placeholder-text p {
  font-size: 0.8rem;
  margin: 0;
  color: #777;
  font-weight: 400;
}

/* Transition for panel */
.filter-slide-fade-enter-active,
.filter-slide-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.filter-slide-fade-enter-from,
.filter-slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Mobile adjustments */
@media (max-width: 640px) {
  .track-filter-wrapper {
    top: 12px;
    right: 12px;
  }
  .filter-button-compact {
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    /* Solid background for better visibility */
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .filter-icon {
    width: 22px;
    height: 22px;
  }
  
  .track-filter-control {
    width: calc(100vw - 24px) !important;
    max-width: calc(100vw - 24px);
  }
  .collapse-btn {
    width: 36px;
    height: 36px;
  }
}

/* Safari-specific fixes for mobile */
@supports (-webkit-appearance: none) {
  @media (max-width: 640px) {
    .filter-button-compact {
      /* Ensure visibility in Safari with stronger visual styling */
      background: #ffffff !important;
      backdrop-filter: none !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    
    .track-filter-control {
      /* Stronger shadow for Safari */
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
      border: 1px solid rgba(0, 0, 0, 0.05);
    }
  }
}
</style>
