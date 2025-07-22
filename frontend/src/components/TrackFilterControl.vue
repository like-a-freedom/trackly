<template>
  <div class="track-filter-control">
    <!-- Show filters when there are tracks in the area -->
    <template v-if="hasTracksInArea">
      <div class="filter-section">
        <label>Categories:</label>
        <div class="category-checkboxes">
          <div 
            v-for="category in categories" 
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
              {{ category }}
            </label>
          </div>
        </div>
      </div>
      <div class="filter-section">
        <label>Track length (km):</label>
        <Slider
          v-model="lengthRange"
          :min="minLength"
          :max="maxLength"
          :step="0.1"
          :tooltip="true"
          :lazy="true"
          :format="val => val.toFixed(2)"
          :range="true"
        />
      </div>
      <div class="filter-actions">
        <button @click="resetFilters">Reset</button>
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
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import Slider from '@vueform/slider';
import '@vueform/slider/themes/default.css';
import { useUnits } from '../composables/useUnits';

const props = defineProps({
  categories: Array, // All available categories (viewport-based)
  minLength: Number, // Minimum track length in km (viewport-based)
  maxLength: Number, // Maximum track length in km (viewport-based)
  globalCategories: Array, // All session categories for reset functionality
  globalMinLength: Number, // Global session minimum track length for reset functionality
  globalMaxLength: Number, // Global session maximum track length for reset functionality
  hasTracksInViewport: Boolean, // Whether there are actual tracks in the current viewport
});

const emit = defineEmits(['update:filter']);

// Initialize global units (this ensures units are loaded on app startup)
useUnits();

// Computed property to determine if there are tracks in the current area
const hasTracksInArea = computed(() => {
  // Use the prop passed from TrackMap that reflects actual tracks in viewport
  return props.hasTracksInViewport;
});

const LOCAL_STORAGE_KEY = 'trackFiltersVue';

const selectedCategories = ref([]); // Will be set in onMounted
const lengthRange = ref([props.minLength, props.maxLength]);

// Flag to track if values were restored from localStorage
const restoredFromLocalStorage = ref(false);

onMounted(() => {
  // Initialize with global session values if no saved preferences exist
  let initialCategories = props.globalCategories ? [...props.globalCategories] : [];
  let initialLengthRange = [props.globalMinLength, props.globalMaxLength];
  
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
    } catch (e) {
      console.error('Failed to parse filter state from localStorage:', e);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }
  
  selectedCategories.value = initialCategories;
  lengthRange.value = initialLengthRange;

  // Emit initial filter state
  emit('update:filter', {
    categories: selectedCategories.value,
    lengthRange: lengthRange.value,
  });
});

watch(() => props.categories, (newCategories) => {
  // Don't automatically change user selections based on viewport changes
  // But we need to re-emit so parent gets filtered values for the new viewport
  const validCategories = newCategories ? selectedCategories.value.filter(cat => newCategories.includes(cat)) : selectedCategories.value;
  
  emit('update:filter', {
    categories: validCategories,
    lengthRange: lengthRange.value,
  });
});

let prevMinLength = props.minLength;
let prevMaxLength = props.maxLength;

watch(
  () => [props.minLength, props.maxLength],
  ([newMin, newMax], [oldMin, oldMax]) => {
    // Don't automatically change user selections based on viewport changes
    // The main watcher will clamp values when emitting to parent
    prevMinLength = newMin;
    prevMaxLength = newMax;
  }
);

watch([selectedCategories, lengthRange], ([cats, range], [oldCats, oldRange]) => {
  // Emit validated values (filtered to what's available in current viewport)
  const validCategories = props.categories ? cats.filter(cat => props.categories.includes(cat)) : cats;
  let validRange = range;
  
  // Clamp range to current viewport bounds
  if (props.minLength !== undefined && props.maxLength !== undefined) {
    const [min, max] = range;
    const clampedMin = Math.max(props.minLength, Math.min(props.maxLength, min));
    const clampedMax = Math.max(props.minLength, Math.min(props.maxLength, max));
    if (clampedMin <= clampedMax) {
      validRange = [clampedMin, clampedMax];
    } else {
      validRange = [props.minLength, props.maxLength];
    }
  }
  
  emit('update:filter', {
    categories: validCategories,
    lengthRange: validRange,
  });
  
  // Always persist user's actual choice (not the clamped values)
  if (cats !== null && cats !== undefined && range && range.length === 2) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      categories: cats,
      lengthRange: range,
    }));
  }
}, { deep: true });

function resetFilters() {
  // Use global session values for reset instead of viewport-based props
  // This ensures that reset doesn't change when user zooms in/out
  selectedCategories.value = props.globalCategories ? [...props.globalCategories] : [];
  lengthRange.value = [props.globalMinLength || 0, props.globalMaxLength || 50];
  // Immediately persist reset state
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    categories: selectedCategories.value,
    lengthRange: lengthRange.value,
  }));
}
</script>

<style scoped>
.track-filter-control {
  position: absolute !important;
  top: 16px !important;
  right: 16px !important;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
  padding: 16px !important;
  z-index: 1002;
  min-width: 210px;
  max-width: 320px;
  width: 320px !important;
  transition: height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  box-sizing: border-box !important;
}
.filter-section {
  margin-bottom: 12px;
}
.filter-section label {
  display: block;
  margin-bottom: 12px;
  font-weight: 500;
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
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
}

.checkbox-label {
  font-size: 0.87rem;
  font-weight: 400;
  cursor: pointer;
  margin: 0;
  flex: 1;
  line-height: 1.2;
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
</style>
