<template>
  <div class="track-detail-flyout" :class="{ 'closing': isClosing, 'collapsed': isCollapsed }" @wheel="handleWheel">
    <!-- Panel Controls "Tab" - только когда свернута -->
    <div class="panel-controls-tab" v-show="isCollapsed">
      <button class="collapse-toggle-btn" @click="toggleCollapse" 
              title="Expand panel"
              aria-label="Expand panel">
        <!-- Arrow pointing up for expand -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.59,15.42L12,10.83L7.41,15.42L6,14L12,8L18,14L16.59,15.42Z" />
        </svg>
      </button>
    </div>
    
    <div class="flyout-content" ref="flyoutContent" @wheel="handleContentWheel">
      <!-- Collapsible content -->
      <div class="collapsible-content" v-show="!isCollapsed">
      
      <!-- Track Header -->
      <div class="track-header">
        <!-- Name Edit Mode -->
        <div v-if="isEditingName" class="name-edit-block" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop>
          <input 
            ref="nameInput"
            v-model="editedName" 
            class="edit-name-input" 
            placeholder="Enter track name..."
            @keydown.enter="saveName"
            @keydown.esc="cancelEditName"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @dblclick.stop
            maxlength="255"
          />
          <div class="edit-name-actions" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop>
            <button 
              @click="saveName" 
              :disabled="savingName"
              class="save-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              {{ savingName ? 'Saving...' : 'Save' }}
            </button>
            <button 
              @click="cancelEditName" 
              :disabled="savingName"
              class="cancel-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Cancel
            </button>
          </div>
          <div v-if="nameError" class="edit-name-error">{{ nameError }}</div>
        </div>

        <!-- Name Display Mode -->
        <div v-else class="track-name-block" :class="{ 'editable': isOwner }">
          <div class="title-with-edit">
            <h2>{{ track.name || 'Unnamed Track' }}</h2>
            <button v-if="isOwner" class="edit-name-btn" @click="startEditName" title="Edit track name">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          </div>
          <div class="header-actions grouped">
            <div class="action-group track-actions" aria-label="Track actions">
              <button 
                class="share-track-btn" 
                @click="shareTrack" 
                :disabled="copyingLink"
                :title="copyingLink ? 'Copying...' : 'Copy shareable link'"
                aria-label="Share track"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.53 1.53"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.53-1.53"></path>
                </svg>
              </button>
              <button 
                class="export-gpx-btn" 
                @click="exportTrack" 
                :disabled="exportingTrack"
                :title="exportingTrack ? 'Exporting...' : 'Export track as GPX file'"
                aria-label="Export GPX"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7,10 12,15 17,10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button v-if="isOwner" class="delete-track-btn" @click="confirmDelete" title="Delete track permanently" aria-label="Delete track">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
            <div class="divider" aria-hidden="true"></div>
            <div class="action-group panel-actions" aria-label="Panel layout controls">
              <button class="collapse-toggle-btn" @click="toggleCollapse" 
                      title="Collapse panel"
                      aria-label="Collapse panel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
                </svg>
              </button>
              <button class="close-button" @click="handleClose" title="Close panel" aria-label="Close panel">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Description Edit Mode -->
        <div v-if="isEditingDescription" class="description-edit-block" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop>
          <textarea 
            ref="descriptionTextarea"
            v-model="editedDescription" 
            class="edit-description-input" 
            placeholder="Add a description for this track..."
            @keydown.ctrl.enter="saveDescription"
            @keydown.esc="cancelEditDescription"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @dblclick.stop
          />
          <div class="edit-description-actions" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop>
            <button 
              @click="saveDescription" 
              :disabled="savingDescription"
              class="save-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              {{ savingDescription ? 'Saving...' : 'Save' }}
            </button>
            <button 
              @click="cancelEditDescription" 
              :disabled="savingDescription"
              class="cancel-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Cancel
            </button>
          </div>
          <div v-if="descriptionError" class="edit-description-error">{{ descriptionError }}</div>
        </div>
        
        <!-- Description Display Mode -->
        <div v-else-if="track.description || isOwner" class="track-description-block" :class="{ 'editable': isOwner, 'empty': !track.description && isOwner }">
          <div class="description-content">
            <p v-if="track.description" class="track-description-text">{{ track.description }}</p>
            <p v-else-if="isOwner" class="track-description-placeholder">No description added yet</p>
          </div>
          <button v-if="isOwner" class="edit-description-btn" @click="startEditDescription" :title="track.description ? 'Edit description' : 'Add description'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>

      </div>

      <!-- Categories -->
      <div class="stats-section" v-if="track.categories && track.categories.length > 0">
        <div class="section-header-with-tooltip">
          <h3>Categories</h3>
          <span class="info-icon" title="Categories that were added by the user during track upload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </span>
        </div>
        <div class="categories">
          <span v-for="category in track.categories" :key="category" class="category-tag">
            {{ formatCategory(category) }}
          </span>
        </div>
      </div>

      <!-- Auto Classifications -->
      <div class="stats-section" v-if="track.auto_classifications && track.auto_classifications.length > 0">
        <div class="section-header-with-tooltip">
          <h3>Auto classifications</h3>
          <span class="info-icon" title="Track types automatically classified by the system based on track characteristics">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </span>
        </div>
        <div class="auto-classifications">
          <span v-for="classification in track.auto_classifications" :key="classification" class="classification-tag">
            {{ formatClassification(classification) }}
          </span>
        </div>
      </div>

      <!-- Basic Track Info -->
      <div class="stats-section">
        <div class="section-header">
          <h3>Basic info</h3>
          <div class="header-actions">
            <div class="unit-toggles">
              <button 
                class="unit-toggle" 
                :class="{ active: speedUnit === 'kmh' }"
                @click="setSpeedUnit('kmh')"
              >
                km
              </button>
              <button 
                class="unit-toggle" 
                :class="{ active: speedUnit === 'mph' }"
                @click="setSpeedUnit('mph')"
              >
                miles
              </button>
            </div>
          </div>
        </div>
        <div class="basic-info-grid">
          <div class="stat-item">
            <span class="stat-label">Distance</span>
            <span class="stat-value">{{ formattedDistance }}</span>
          </div>
          <div class="stat-item" v-if="track.duration_seconds !== undefined && track.duration_seconds !== null && track.duration_seconds > 0">
            <span class="stat-label">Duration</span>
            <span class="stat-value">{{ formattedDuration }}</span>
          </div>
        </div>
      </div>
      

      <!-- Speed and Pace Section -->
      <div class="stats-section" v-if="hasSpeedData">
        <h3>Statistics</h3>
        <div class="speed-pace-grid">
          <div class="stat-item" v-if="track.moving_avg_speed !== undefined && track.moving_avg_speed !== null">
            <span class="stat-label">Average moving speed</span>
            <span class="stat-value">{{ formattedMovingAvgSpeed }}</span>
          </div>
          <div class="stat-item" v-if="track.moving_avg_pace !== undefined && track.moving_avg_pace !== null">
            <span class="stat-label">Average moving pace</span>
            <span class="stat-value">{{ formattedMovingAvgPace }}</span>
          </div>
          <div class="stat-item" v-if="track.moving_time !== undefined && track.moving_time !== null">
            <span class="stat-label">Moving time</span>
            <span class="stat-value">{{ utilFormatDuration(track.moving_time) }}</span>
          </div>
          <div class="stat-item" v-if="track.pause_time !== undefined && track.pause_time !== null">
            <span class="stat-label">Pause time</span>
            <span class="stat-value">{{ utilFormatDuration(track.pause_time) }}</span>
          </div>
          <div class="stat-item" v-if="track.avg_hr !== undefined && track.avg_hr !== null">
            <span class="stat-label">Average HR</span>
            <span class="stat-value">{{ Math.round(track.avg_hr) }} bpm</span>
          </div>
          <div class="stat-item" v-if="track.hr_min !== undefined && track.hr_min !== null">
            <span class="stat-label">Minimum HR</span>
            <span class="stat-value">{{ Math.round(track.hr_min) }} bpm</span>
          </div>
          <div class="stat-item" v-if="track.hr_max !== undefined && track.hr_max !== null">
            <span class="stat-label">Maximum HR</span>
            <span class="stat-value">{{ Math.round(track.hr_max) }} bpm</span>
          </div>
        </div>
      </div>

      <!-- Elevation Stats with Chart -->
      <div class="stats-section" v-if="hasElevationOrHeartRateData">
        <div class="section-header">
          <h3>Elevation</h3>
          <div class="chart-toggles" v-if="hasElevationData || hasHeartRateData || hasTemperatureData">
            <button 
              v-if="hasElevationData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'elevation' }"
              @click="chartMode = 'elevation'"
            >
              Elevation
            </button>
            <button 
              v-if="hasHeartRateData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'pulse' }"
              @click="chartMode = 'pulse'"
            >
              Heart rate
            </button>
            <button 
              v-if="hasTemperatureData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'temperature' }"
              @click="chartMode = 'temperature'"
            >
              Temperature
            </button>
            <button 
              v-if="(hasHeartRateData || hasTemperatureData) && hasElevationData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'both' }"
              @click="chartMode = 'both'"
            >
              Both
            </button>
          </div>
        </div>
        
        <!-- Elevation Chart -->
        <div class="chart-section" v-if="hasElevationData || hasHeartRateData || hasTemperatureData">
          <ElevationChart 
            :elevationData="track.elevation_profile"
            :heartRateData="track.hr_data"
            :temperatureData="track.temp_data"
            :trackName="chartTitle"
            :totalDistance="track.length_km"
            :chartMode="chartMode"
          />
        </div>
        
        <!-- Elevation Statistics -->
        <div class="elevation-stats" v-if="hasElevationData">
          <div class="stat-item" v-if="track.elevation_up !== undefined && track.elevation_up !== null">
            <span class="stat-label">Total ascent</span>
            <span class="stat-value">{{ track.elevation_up.toFixed(0) }} m</span>
          </div>
          <div class="stat-item" v-if="track.elevation_down !== undefined && track.elevation_down !== null">
            <span class="stat-label">Total descent</span>
            <span class="stat-value">{{ Math.abs(track.elevation_down).toFixed(0) }} m</span>
          </div>
          <div class="stat-item" v-if="elevationGain">
            <span class="stat-label">Net elevation</span>
            <span class="stat-value">{{ elevationGain }} m</span>
          </div>
        </div>
      </div>

      <!-- Track Metadata -->
      <div class="track-metadata">
        <h3>Track info</h3>
        <div class="metadata-grid">
          <div class="metadata-item" v-if="track.recorded_at">
            <span class="metadata-label">Recorded</span>
            <span class="metadata-value">{{ formatDate(track.recorded_at) }}</span>
          </div>
          <div class="metadata-item" v-if="track.created_at">
            <span class="metadata-label">Added</span>
            <span class="metadata-value">{{ formatDate(track.created_at) }}</span>
          </div>
          <div class="metadata-item" v-if="track.updated_at">
            <span class="metadata-label">Modified</span>
            <span class="metadata-value">{{ formatDate(track.updated_at) }}</span>
          </div>
        </div>
      </div>
      
      </div> <!-- End collapsible-content -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, shallowRef, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ElevationChart from './ElevationChart.vue';
import { 
  formatSpeed, 
  calculatePaceFromSpeed, 
  formatDuration as utilFormatDuration,
  formatDistance,
  validateSpeedData,
  formatPace
} from '../composables/useTracks';
import { useUnits } from '../composables/useUnits';
import { useMemoizedComputed } from '../composables/useMemoization';
import { useAdvancedDebounce } from '../composables/useAdvancedDebounce';

const props = defineProps({
  track: {
    type: Object,
    required: true
  },
  isOwner: {
    type: Boolean,
    default: false
  },
  sessionId: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'description-updated', 'name-updated', 'deleted']);
const route = useRoute();
const isClosing = ref(false);
const isCollapsed = ref(false);
// Use global unit management
const { speedUnit, setSpeedUnit, getDistanceUnit, getPaceUnit, convertPace } = useUnits();
const chartMode = ref('elevation');
const flyoutContent = ref(null);
const descriptionTextarea = ref(null);
const nameInput = ref(null);

// --- Name editing state ---
const isEditingName = ref(false);
const editedName = ref('');
const savingName = ref(false);
const nameError = ref('');

// Reset panel state on mount to fix re-opening issues
onMounted(() => {
  isClosing.value = false;
  isCollapsed.value = false;
});

// Reset panel state when track changes
watch(() => props.track?.id, () => {
  isClosing.value = false;
  isCollapsed.value = false;
});

// Reset panel state when returning to track view (handles same track re-opening)
watch(() => route.path, (newPath) => {
  if (newPath && newPath.startsWith('/track/')) {
    isClosing.value = false;
    isCollapsed.value = false;
  }
});

// --- Description editing state ---
const isEditingDescription = ref(false);
const editedDescription = ref('');
const savingDescription = ref(false);
const descriptionError = ref('');

// --- Export state ---
const exportingTrack = ref(false);
const deletingTrack = ref(false);

// --- Share state ---
const copyingLink = ref(false);
const linkCopied = ref(false);

// Computed properties for data validation and formatting - memoized for performance
const hasSpeedData = useMemoizedComputed(
  (track) => {
    return (track?.avg_speed !== undefined && track?.avg_speed !== null) ||
           (track?.max_speed !== undefined && track?.max_speed !== null);
  },
  [() => props.track],
  {
    keyFn: (deps) => `speed_${deps[0]?.id}_${deps[0]?.avg_speed}_${deps[0]?.max_speed}`
  }
);

const hasElevationData = useMemoizedComputed(
  (track) => {
    // Check for elevation profile data (most important)
    if (track?.elevation_profile && track?.elevation_profile.length > 0) {
      return true;
    }
    
    // Check for meaningful elevation stats (not just zeros)
    const hasElevationUp = track?.elevation_up !== undefined && 
                          track?.elevation_up !== null && 
                          track?.elevation_up > 0;
    const hasElevationDown = track?.elevation_down !== undefined && 
                            track?.elevation_down !== null && 
                            Math.abs(track?.elevation_down) > 0;
    
    return hasElevationUp || hasElevationDown;
  },
  [() => props.track],
  {
    keyFn: (deps) => `elevation_${deps[0]?.id}_${deps[0]?.elevation_profile?.length}_${deps[0]?.elevation_up}_${deps[0]?.elevation_down}`
  }
);

const hasHeartRateData = useMemoizedComputed(
  (track) => {
    // Check for heart rate profile data
    if (track?.hr_data && track?.hr_data.length > 0) {
      return true;
    }
    
    // Check for meaningful heart rate stats (not just zeros)
    const hasAvgHr = track?.avg_hr !== undefined && 
                    track?.avg_hr !== null && 
                    track?.avg_hr > 0;
    const hasMaxHr = track?.max_hr !== undefined && 
                    track?.max_hr !== null && 
                    track?.max_hr > 0;
    
    return hasAvgHr || hasMaxHr;
  },
  [() => props.track],
  {
    keyFn: (deps) => `hr_${deps[0]?.id}_${deps[0]?.hr_data?.length}_${deps[0]?.avg_hr}_${deps[0]?.max_hr}`
  }
);

const hasTemperatureData = useMemoizedComputed(
  (track) => {
    // Check for temperature profile data
    if (track?.temp_data && track?.temp_data.length > 0) {
      return track.temp_data.some(temp => temp !== null && temp !== undefined && typeof temp === 'number');
    }
    return false;
  },
  [() => props.track],
  {
    keyFn: (deps) => `temp_${deps[0]?.id}_${deps[0]?.temp_data?.length}_${JSON.stringify(deps[0]?.temp_data?.slice(0, 5))}`
  }
);

// Combined check for elevation section visibility
const hasElevationOrHeartRateData = computed(() => {
  return hasElevationData.value || hasHeartRateData.value || hasTemperatureData.value;
});

// Dynamic chart title based on available data - memoized
const chartTitle = useMemoizedComputed(
  (hasElevation, hasHR, hasTemp, trackName) => {
    const dataTypes = [];
    if (hasElevation) dataTypes.push('Elevation');
    if (hasHR) dataTypes.push('Heart Rate');
    if (hasTemp) dataTypes.push('Temperature');
    
    if (dataTypes.length > 1) {
      return `${trackName} - ${dataTypes.join(' & ')}`;
    } else if (dataTypes.length === 1) {
      return `${trackName} - ${dataTypes[0]} Profile`;
    } else {
      return `${trackName} - Profile`;
    }
  },
  [
    () => hasElevationData.value,
    () => hasHeartRateData.value, 
    () => hasTemperatureData.value,
    () => props.track?.name || 'Unnamed Track'
  ],
  {
    keyFn: (deps) => `charttitle_${deps.join('_')}`
  }
);

const track = shallowRef(props.track);

// Watch for track changes
watch(() => props.track, (newTrack) => {
  track.value = newTrack;
});

// Distance formatting - memoized
const formattedDistance = useMemoizedComputed(
  (lengthKm, distanceUnit) => {
    if (lengthKm === undefined || lengthKm === null) {
      return 'N/A';
    }
    return formatDistance(lengthKm, distanceUnit);
  },
  [() => track.value?.length_km, () => getDistanceUnit()],
  {
    keyFn: (deps) => `distance_${deps[0]}_${deps[1]}`
  }
);

// Duration formatting - memoized
const formattedDuration = useMemoizedComputed(
  (durationSeconds) => {
    return utilFormatDuration(durationSeconds);
  },
  [() => track.value?.duration_seconds],
  {
    keyFn: (deps) => `duration_${deps[0]}`
  }
);

// Speed formatting - memoized
const formattedAvgSpeed = useMemoizedComputed(
  (avgSpeed, speedUnitValue) => {
    if (!validateSpeedData(avgSpeed)) return 'N/A';
    return formatSpeed(avgSpeed, speedUnitValue);
  },
  [() => track.value?.avg_speed, () => speedUnit.value],
  {
    keyFn: (deps) => `avgspeed_${deps[0]}_${deps[1]}`
  }
);

const formattedMaxSpeed = useMemoizedComputed(
  (maxSpeed, speedUnitValue) => {
    if (!validateSpeedData(maxSpeed)) return 'N/A';
    return formatSpeed(maxSpeed, speedUnitValue);
  },
  [() => track.value?.max_speed, () => speedUnit.value],
  {
    keyFn: (deps) => `maxspeed_${deps[0]}_${deps[1]}`
  }
);

// Pace formatting - memoized
const formattedAvgPace = useMemoizedComputed(
  (avgSpeed, paceUnit) => {
    if (!validateSpeedData(avgSpeed)) return 'N/A';
    return calculatePaceFromSpeed(avgSpeed, paceUnit);
  },
  [() => track.value?.avg_speed, () => getPaceUnit()],
  {
    keyFn: (deps) => `avgpace_${deps[0]}_${deps[1]}`
  }
);

const formattedBestPace = useMemoizedComputed(
  (maxSpeed, paceUnit) => {
    if (!validateSpeedData(maxSpeed)) return 'N/A';
    return calculatePaceFromSpeed(maxSpeed, paceUnit);
  },
  [() => track.value?.max_speed, () => getPaceUnit()],
  {
    keyFn: (deps) => `bestpace_${deps[0]}_${deps[1]}`
  }
);

// Moving speed and pace formatting - memoized
const formattedMovingAvgSpeed = useMemoizedComputed(
  (movingAvgSpeed, speedUnitValue) => {
    if (!validateSpeedData(movingAvgSpeed)) return 'N/A';
    return formatSpeed(movingAvgSpeed, speedUnitValue);
  },
  [() => track.value?.moving_avg_speed, () => speedUnit.value],
  {
    keyFn: (deps) => `movingavgspeed_${deps[0]}_${deps[1]}`
  }
);

const formattedMovingAvgPace = useMemoizedComputed(
  (movingAvgPace, paceUnit) => {
    if (movingAvgPace === undefined || movingAvgPace === null || movingAvgPace <= 0) return 'N/A';
    const convertedPace = convertPace(movingAvgPace);
    if (convertedPace === null) return 'N/A';
    return formatPace(convertedPace, paceUnit);
  },
  [() => track.value?.moving_avg_pace, () => getPaceUnit()],
  {
    keyFn: (deps) => `movingavgpace_${deps[0]}_${deps[1]}`
  }
);

// Elevation calculations - memoized
const elevationGain = useMemoizedComputed(
  (elevationUp, elevationDown) => {
    if (elevationUp === undefined || elevationUp === null || elevationDown === undefined || elevationDown === null) {
      return null;
    }
    
    const gain = elevationUp - Math.abs(elevationDown);
    return gain >= 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0);
  },
  [() => track.value?.elevation_up, () => track.value?.elevation_down],
  {
    keyFn: (deps) => `elevgain_${deps[0]}_${deps[1]}`
  }
);

// Debounced API functions to prevent excessive requests
const debouncedSaveName = useAdvancedDebounce(async (trackId, name, sessionId) => {
  const response = await fetch(`/tracks/${trackId}/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: name.trim(), session_id: sessionId })
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('You are not allowed to edit this track name.');
    } else {
      throw new Error('Failed to update track name.');
    }
  }
}, 500, { leading: false, trailing: true });

const debouncedSaveDescription = useAdvancedDebounce(async (trackId, description, sessionId) => {
  const response = await fetch(`/tracks/${trackId}/description`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description, session_id: sessionId })
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('You are not allowed to edit this description.');
    } else {
      throw new Error('Failed to update description.');
    }
  }
}, 500, { leading: false, trailing: true });

function startEditName() {
  isEditingName.value = true;
  editedName.value = track.value.name || '';
  nameError.value = '';
  
  // Auto-focus on next tick
  nextTick(() => {
    if (nameInput.value) {
      nameInput.value.focus();
      nameInput.value.select(); // Select all text for easy replacement
    }
  });
}
async function confirmDelete() {
  if (deletingTrack.value) return;
  if (!track.value?.id) return;
  const proceed = window.confirm('Delete track? This action cannot be undone.');
  if (!proceed) return;
  try {
    deletingTrack.value = true;
    const res = await fetch(`/tracks/${track.value.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: track.value.name || '', session_id: props.sessionId })
    });
    if (res.status === 204) {
      const deletedId = track.value.id; // preserve before close
      // Emit locally
      emit('deleted', deletedId);
      // Also dispatch global event so views (e.g., HomeView) can react if this panel is on another route
      window.dispatchEvent(new CustomEvent('track-deleted', { detail: { id: deletedId } }));
      emit('close');
    } else if (res.status === 403) {
      alert('You are not allowed to delete this track.');
    } else if (res.status === 404) {
      alert('Track not found or already deleted.');
    } else {
      alert('Failed to delete track.');
    }
  } catch (err) {
    console.error('Delete track error', err);
    alert('Error deleting track.');
  } finally {
    deletingTrack.value = false;
  }
}

function cancelEditName() {
  isEditingName.value = false;
  nameError.value = '';
}

async function saveName() {
  if (!editedName.value.trim()) {
    nameError.value = 'Track name cannot be empty.';
    return;
  }

  savingName.value = true;
  nameError.value = '';
  
  try {
    await debouncedSaveName(track.value.id, editedName.value, props.sessionId);
    
    // Update local track object immediately for reactive UI
    track.value.name = editedName.value.trim();
    emit('name-updated', editedName.value.trim());
    isEditingName.value = false;
  } catch (err) {
    nameError.value = err.message || 'Network error.';
  } finally {
    savingName.value = false;
  }
}

function startEditDescription() {
  isEditingDescription.value = true;
  editedDescription.value = track.value.description || '';
  descriptionError.value = '';
  
  // Auto-focus and auto-resize on next tick
  nextTick(() => {
    if (descriptionTextarea.value) {
      descriptionTextarea.value.focus();
      autoResizeTextarea();
    }
  });
}

function autoResizeTextarea() {
  if (descriptionTextarea.value) {
    descriptionTextarea.value.style.height = 'auto';
    descriptionTextarea.value.style.height = Math.min(descriptionTextarea.value.scrollHeight, 300) + 'px';
  }
}

function cancelEditDescription() {
  isEditingDescription.value = false;
  descriptionError.value = '';
}
async function saveDescription() {
  savingDescription.value = true;
  descriptionError.value = '';
  
  try {
    await debouncedSaveDescription(track.value.id, editedDescription.value, props.sessionId);
    
    // Update local track object immediately for reactive UI
    track.value.description = editedDescription.value;
    emit('description-updated', editedDescription.value);
    isEditingDescription.value = false;
  } catch (err) {
    descriptionError.value = err.message || 'Network error.';
  } finally {
    savingDescription.value = false;
  }
}

// Utility functions - memoized for performance
// Date formatting function

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    // Create Date object and check if it's valid
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return 'Invalid Date';
    }
    
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    };
    
    return date.toLocaleString(undefined, options);
  } catch (error) {
    console.error('Error formatting date:', dateString, error);
    return 'Invalid Date';
  }
}

function formatClassification(classification) {
  // Convert snake_case to human-readable format
  return classification
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCategory(category) {
  // Format category with proper capitalization
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Export track as GPX
async function exportTrack() {
  if (!track.value?.id) return;
  
  exportingTrack.value = true;
  try {
    const response = await fetch(`/tracks/${track.value.id}/export`);
    if (!response.ok) {
      throw new Error('Failed to export track');
    }
    
    // Get the GPX content as blob
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Let the browser use the filename from Content-Disposition header
    // If that fails, use track name as fallback
    const trackName = track.value.name || 'Unnamed Track';
    const sanitizedName = trackName.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_');
    link.download = `${sanitizedName}.gpx`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    // You could emit an error event here or show a toast notification
  } finally {
    exportingTrack.value = false;
  }
}

// Share track link
async function shareTrack() {
  if (!track.value?.id) return;
  
  copyingLink.value = true;
  try {
    // Create the shareable URL
    const trackUrl = `${window.location.origin}/track/${track.value.id}`;
    
    // Copy to clipboard
    await navigator.clipboard.writeText(trackUrl);
    
    // Show success feedback
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy link:', error);
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = `${window.location.origin}/track/${track.value.id}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      linkCopied.value = true;
      setTimeout(() => {
        linkCopied.value = false;
      }, 2000);
    } catch (fallbackError) {
      console.error('Fallback copy failed:', fallbackError);
    }
  } finally {
    copyingLink.value = false;
  }
}

function handleClose() {
  isClosing.value = true;
  setTimeout(() => {
    emit('close');
  }, 300); // Match this with CSS transition duration
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

// Prevent scroll propagation to the map behind
function handleWheel(event) {
  // Allow wheel events to bubble up only if the flyout-content can't scroll
  if (!flyoutContent.value) return;
  
  const { scrollTop, scrollHeight, clientHeight } = flyoutContent.value;
  const isAtTop = scrollTop === 0;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight;
  
  // Prevent propagation if scrolling within bounds
  if ((!isAtTop && event.deltaY < 0) || (!isAtBottom && event.deltaY > 0)) {
    event.stopPropagation();
  }
}

function handleContentWheel(event) {
  // Always stop propagation for content area
  event.stopPropagation();
}

// Watch for changes in editedDescription to auto-resize textarea
watch(editedDescription, () => {
  nextTick(() => {
    autoResizeTextarea();
  });
});

// Watch for track changes to set appropriate chart mode
watch(() => props.track, (newTrack) => {
  if (newTrack) {
    // Set chart mode based on available data
    const hasElevation = hasElevationData.value;
    const hasHR = hasHeartRateData.value;
    const hasTemp = hasTemperatureData.value;
    
    if (hasElevation && (hasHR || hasTemp)) {
      // If elevation and at least one other type are available, keep current mode or default to 'both'
      if (!['elevation', 'pulse', 'temperature', 'both'].includes(chartMode.value)) {
        chartMode.value = 'both';
      }
    } else if (hasElevation) {
      chartMode.value = 'elevation';
    } else if (hasHR) {
      chartMode.value = 'pulse';
    } else if (hasTemp) {
      chartMode.value = 'temperature';
    }
  }
}, { immediate: true });
</script>

<style scoped>
.track-detail-flyout {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  background: rgba(255,255,255,0.98);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.18);
  padding: 24px 0 0 0;
  width: 100vw;
  min-width: 100vw;
  max-width: 100vw;
  margin: 0;
  min-height: 220px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  color: #333;
  box-sizing: border-box;
  transition: transform 0.3s cubic-bezier(.4,1.4,.6,1), opacity 0.3s ease;
}

.track-detail-flyout.closing {
  transform: translateY(100%);
  opacity: 0;
}

.track-detail-flyout.collapsed {
  min-height: 0px;
  max-height: 0px;
  padding: 0;
  overflow: visible;
}

.flyout-content {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0 20px 32px 20px;
  box-sizing: border-box;
  overflow-y: auto;
  flex: 1;
  scroll-behavior: smooth;
}

.track-detail-flyout.collapsed .flyout-content {
  padding: 0;
  overflow: hidden;
  max-height: 0;
  min-height: 0;
  height: 0;
  opacity: 0;
}

.track-detail-flyout.collapsed .flyout-content * {
  margin: 0 !important;
  padding: 0 !important;
}

/* Custom scrollbar styling */
.flyout-content::-webkit-scrollbar {
  width: 6px;
}

.flyout-content::-webkit-scrollbar-track {
  background: transparent;
}

.flyout-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.flyout-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.panel-controls-tab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1300; /* Same as TrackFilterControl */
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-controls-tab:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.collapse-toggle-btn {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.collapse-toggle-btn:hover {
  color: #333;
}

.collapse-toggle-btn:active {
  transform: scale(0.95);
}

.close-button {
  background: none;
  border: none;
  cursor: pointer;
  color: #dc2626;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  box-sizing: border-box;
}

.close-button:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  transform: scale(1.05);
}

.collapse-toggle-btn:hover {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
  transform: scale(1.05);
}

.collapse-toggle-btn:active {
  transform: scale(0.95);
}

.close-button:active {
  transform: scale(0.95);
}

/* Track Header */
.track-header {
  margin-bottom: 20px;
  position: relative;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions.grouped {
  gap: 16px;
}

.header-actions .action-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions .divider {
  width: 1px;
  align-self: stretch;
  background: linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.15), rgba(0,0,0,0.08));
  border-radius: 1px;
}

.share-track-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  font-size: 13px;
  gap: 6px;
}

.share-track-btn:hover {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
  transform: scale(1.05);
}

.share-track-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.export-gpx-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

.export-gpx-btn:hover {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
  transform: scale(1.05);
}

.export-gpx-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.delete-track-btn {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

.delete-track-btn:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  transform: scale(1.05);
}

.delete-track-btn:active { transform: scale(0.95); }

.delete-track-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.track-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.6em;
  color: #1a1a1a;
  font-weight: 600;
}

/* Track Name */
.track-name-block {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.title-with-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-header .title-with-edit h2 {
  margin: 0;
  line-height: 1.2;
  font-size: 1.6em;
  color: #1a1a1a;
  font-weight: 600;
}

.track-name-block .header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-name-block.editable:hover .edit-name-btn {
  opacity: 1;
}

.edit-name-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
}

.edit-name-btn:hover {
  background: #f0f0f0;
  color: #2196f3;
  transform: scale(1.05);
}

/* Name Edit Mode */
.name-edit-block {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin: 0 0 18px 0;
  border: 2px solid #e3f2fd;
  box-shadow: 0 4px 16px rgba(33, 150, 243, 0.08);
}

.edit-name-input {
  width: 100%;
  font-size: 1.6em;
  font-weight: 600;
  color: #1a1a1a;
  background: #fff;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  transition: all 0.2s ease;
  font-family: inherit;
  box-sizing: border-box;
}

.edit-name-input:focus {
  outline: none;
  border-color: #2196f3;
  background: #fcfdff;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
}

.edit-name-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 0;
}

.edit-name-actions button {
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 90px;
  justify-content: center;
}

.edit-name-error {
  color: #d32f2f;
  font-size: 0.9em;
  margin-top: 8px;
  padding: 8px 12px;
  background: #ffebee;
  border-radius: 6px;
  border-left: 4px solid #d32f2f;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Track Description */
.track-description-block {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px 20px;
  margin: 0 0 18px 0;
  position: relative;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.track-description-block.editable {
  cursor: pointer;
}

.track-description-block.editable:hover {
  background: #f0f4f8;
  border-color: #e3f2fd;
  transform: translateY(-1px);
  box-shadow: 0 3px 12px rgba(33, 150, 243, 0.08);
}

.track-description-block.empty {
  border: 2px dashed #d0d0d0;
  background: #fafafa;
}

.track-description-block.empty:hover {
  border-color: #2196f3;
  background: #f8fbff;
}

.description-content {
  padding-right: 50px; /* Space for edit button */
}

.track-description-text {
  color: #444;
  font-size: 1.08em;
  line-height: 1.6;
  margin: 0;
  word-break: break-word;
  white-space: pre-wrap;
}

.track-description-placeholder {
  color: #888;
  font-size: 1.08em;
  line-height: 1.6;
  margin: 0;
  font-style: italic;
}

.edit-description-btn {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  background: rgba(33, 150, 243, 0.1);
  color: #1565c0;
  border: none;
  border-radius: 6px;
  padding: 6px;
  font-size: 0;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

.edit-description-btn:hover {
  background: rgba(33, 150, 243, 0.2);
  opacity: 1;
  transform: translateY(-50%) scale(1.05);
}

.description-edit-block {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin: 0 0 18px 0;
  border: 2px solid #e3f2fd;
  box-shadow: 0 4px 16px rgba(33, 150, 243, 0.08);
}

.edit-description-input {
  width: 100%;
  min-height: 80px;
  max-height: 300px;
  border-radius: 8px;
  border: 2px solid #ddd;
  padding: 12px 16px;
  font-size: 1.08em;
  margin-bottom: 16px;
  resize: none;
  background: #fff;
  color: #222;
  font-family: inherit;
  box-sizing: border-box;
  transition: all 0.2s ease;
  line-height: 1.5;
  overflow-y: auto;
}

.edit-description-input:focus {
  outline: none;
  border-color: #2196f3;
  background: #fcfdff;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
}

.edit-description-input::placeholder {
  color: #999;
  font-style: italic;
}

.edit-description-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 0;
}

.edit-description-actions button {
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 90px;
  justify-content: center;
}

.save-btn {
  background: #2196f3;
  color: #fff;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.save-btn:disabled {
  background: #b3d6f7;
  color: #eee;
  cursor: not-allowed;
  box-shadow: none;
}

.save-btn:not(:disabled):hover {
  background: #1976d2;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
  border: 2px solid #ddd;
}

.cancel-btn:disabled {
  background: #f9f9f9;
  color: #ccc;
  cursor: not-allowed;
}

.cancel-btn:not(:disabled):hover {
  background: #eeeeee;
  border-color: #bbb;
  color: #444;
}

.edit-description-error {
  color: #d32f2f;
  font-size: 0.9em;
  margin-top: 8px;
  padding: 8px 12px;
  background: #ffebee;
  border-radius: 6px;
  border-left: 4px solid #d32f2f;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Stats Sections */
.stats-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.stats-section:last-of_type {
  border-bottom: none;
}

.stats-section h3 {
  margin: 0 0 12px 0;
  font-size: 1.3em;
  color: #1a1a1a;
  font-weight: 600;
}

.section-header-with-tooltip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-header-with-tooltip h3 {
  margin: 0;
  font-size: 1.3em;
  color: #1a1a1a;
  font-weight: 600;
}

.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #555;
  cursor: help;
  opacity: 0.8;
  transition: all 0.2s ease;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  position: relative;
  margin-left: 8px;
}

.info-icon:hover {
  opacity: 1;
  color: #2196f3;
  background-color: rgba(33, 150, 243, 0.1);
  transform: scale(1.1);
}

/* Ensure tooltips work correctly */
.info-icon[title] {
  position: relative;
}

.info-icon svg {
  pointer-events: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

/* Unit Toggles */
.unit-toggles {
  display: flex;
  background: #f0f0f0;
  border-radius: 6px;
  padding: 2px;
}

.unit-toggle {
  background: transparent;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #666;
}

.unit-toggle.active {
  background: #fff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.unit-toggle:hover:not(.active) {
  background: rgba(255,255,255,0.7);
}

/* Chart Toggles */
.chart-toggles {
  display: flex;
  background: #f0f0f0;
  border-radius: 6px;
  padding: 2px;
}

.chart-toggle {
  background: transparent;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #666;
}

.chart-toggle.active {
  background: #fff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.chart-toggle:hover:not(.active):not(:disabled) {
  background: rgba(255,255,255,0.7);
}

.chart-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Speed/Pace Grid */
.speed-pace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Basic Info Grid */
.basic-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 0.85em;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 1.1em;
  font-weight: 600;
  color: #1a1a1a;
}

/* Elevation Stats */
.elevation-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

/* Chart Section within stats */
.stats-section .chart-section {
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
}

/* Heart Rate Stats */
.hr-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Categories */
.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-tag {
  background: #e3f2fd;
  color: #1565c0;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 500;
}

.auto-classifications {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.classification-tag {
  background: #f3e5f5;
  color: #7b1fa2;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 500;
}

/* Chart Section */
.chart-section {
  margin: 20px 0;
}

/* Chart Section within stats sections has different spacing */
.stats-section .chart-section {
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
}

.elevation-profile-placeholder {
  height: 150px;
  background-color: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #777;
  font-style: italic;
}

/* Track Metadata */
.track-metadata {
  margin-top: 24px;
}

.track-metadata h3 {
  margin: 0 0 16px 0;
  font-size: 1.3em;
  color: #1a1a1a;
  font-weight: 600;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.metadata-item {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metadata-label {
  font-size: 0.85em;
  color: #666;
  font-weight: 500;
}

.metadata-value {
  font-size: 1.1em;
  font-weight: 600;
  color: #1a1a1a;
}

/* Panel controls responsive adjustments */
@media (max-width: 640px) {
  .panel-controls-tab {
    bottom: 12px;
    right: 12px;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    /* Solid background for better visibility on mobile */
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .collapse-toggle-btn svg {
    width: 20px;
    height: 20px;
  }
}

/* Mobile responsiveness */
@media (max-width: 700px) {
  .track-detail-flyout {
    border-radius: 16px 16px 0 0;
    padding: 18px 0 0 0;
  }
  
  .flyout-content {
    padding: 0 16px 28px 16px;
  }
  
  .speed-pace-grid {
    grid-template-columns: 1fr;
  }
  
  .basic-info-grid {
    grid-template-columns: 1fr;
  }
  
  .hr-stats {
    grid-template-columns: 1fr;
  }
  
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .unit-toggles {
    align-self: flex-end;
  }
}

@media (max-width: 500px) {
  .elevation-stats {
    grid-template-columns: 1fr;
  }
  
  .metadata-grid {
    grid-template-columns: 1fr;
  }
}

/* Safari-specific mobile fixes */
@supports (-webkit-appearance: none) {
  @media (max-width: 640px) {
    .panel-controls-tab {
      background: #ffffff !important;
      backdrop-filter: none !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
  }
}
</style>
