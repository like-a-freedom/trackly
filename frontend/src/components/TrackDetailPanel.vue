<template>
  <div class="track-detail-flyout" :class="{ 'closing': isClosing, 'collapsed': isCollapsed }" @wheel="handleWheel" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop @selectstart.stop @dragstart.prevent>
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
    
    <div class="flyout-content" ref="flyoutContent" @wheel="handleContentWheel" @mousedown.stop @mouseup.stop @selectstart.stop @dragstart.prevent>
      <!-- Collapsible content -->
      <div class="collapsible-content" v-show="!isCollapsed">
      
      <!-- Track Header -->
      <div class="track-header">
        <!-- Name Edit Mode -->
        <div v-if="isEditingName" class="name-edit-block" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop @selectstart.stop @dragstart.prevent>
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
            @selectstart.stop
            @dragstart.prevent
            maxlength="255"
          />
          <div class="edit-name-actions" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop @selectstart.stop @dragstart.prevent>
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
        <div v-if="isEditingDescription" class="description-edit-block" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop @selectstart.stop @dragstart.prevent>
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
            @selectstart.stop
            @dragstart.prevent
          />
          <div class="edit-description-actions" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop @selectstart.stop @dragstart.prevent>
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
            <p v-if="track.description" class="track-description-text" v-html="processedDescription"></p>
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
          <div class="header-actions">
            <!-- Force Update Elevation Button -->
            <button 
              v-if="isOwner && hasElevationData"
              class="force-update-btn" 
              @click="forceEnrichElevation"
              :disabled="enrichingElevation"
              title="Force update elevation data from external service"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
              </svg>
            </button>
            
            <!-- Stop Polling Button (only shown when polling is active) -->
            <button 
              v-if="isPollingForElevation" 
              class="stop-polling-btn-header" 
              @click="stopElevationPolling"
              title="Stop automatic elevation data polling"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
              </svg>
            </button>
            
            <div class="chart-toggles" v-if="hasElevationData || hasHeartRateData || hasTemperatureData || hasPaceData || hasSlopeData">
            <button 
              v-if="hasElevationData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'elevation' }"
              @click="() => { chartMode = 'elevation'; console.log('[TrackDetailPanel] Changed to elevation mode'); }"
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
              v-if="hasPaceData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'pace' }"
              @click="chartMode = 'pace'"
            >
              Pace
            </button>
            <button 
              v-if="hasSlopeData && hasElevationData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'elevation-with-slope' }"
              @click="() => { chartMode = 'elevation-with-slope'; console.log('[TrackDetailPanel] Changed to elevation-with-slope mode'); }"
              title="Elevation profile with slope gradient overlay"
              data-testid="elevation-slope-toggle"
            >
              Elevation + Slope
            </button>
            <button 
              v-if="(hasHeartRateData || hasTemperatureData || hasPaceData) && hasElevationData"
              class="chart-toggle" 
              :class="{ active: chartMode === 'both' }"
              @click="chartMode = 'both'"
            >
              Both
            </button>
            </div>
          </div>
        </div>
        
        <!-- Elevation Chart -->
        <div class="chart-section" v-if="hasElevationData || hasHeartRateData || hasTemperatureData || hasPaceData || hasSlopeData">
          <ElevationChart 
            :key="`chart-${track.id}-${track.elevation_enriched_at || track.updated_at || 'default'}-${chartMode}-${chartUpdateKey}`"
            :elevationData="track.elevation_profile"
            :heartRateData="track.hr_data"
            :temperatureData="track.temp_data"
            :slopeData="track.slope_segments"
            :speedData="track.speed_data"
            :coordinateData="track.geom_geojson?.coordinates"
            :timeData="parsedTimeData"
            :avgSpeed="track.avg_speed"
            :movingAvgSpeed="track.moving_avg_speed"
            :trackName="chartTitle"
            :totalDistance="track.length_km"
            :chartMode="chartMode"
            :distanceUnit="getDistanceUnit()"
            :elevationStats="{ 
              gain: track.elevation_gain, 
              loss: track.elevation_loss, 
              min: track.elevation_min, 
              max: track.elevation_max,
              enriched: track.elevation_enriched,
              dataset: track.elevation_dataset
            }"
          />
        </div>
        
        <!-- Elevation Statistics -->
        <div class="elevation-stats" v-if="hasElevationData">
          <div class="stat-item" v-if="track.elevation_gain !== undefined && track.elevation_gain !== null">
            <span class="stat-label">Total ascent</span>
            <span class="stat-value">{{ track.elevation_gain.toFixed(0) }} m</span>
          </div>
          <div class="stat-item" v-if="track.elevation_loss !== undefined && track.elevation_loss !== null">
            <span class="stat-label">Total descent</span>
            <span class="stat-value">{{ Math.abs(track.elevation_loss).toFixed(0) }} m</span>
          </div>
          <div class="stat-item" v-if="elevationGain">
            <span class="stat-label">Net elevation</span>
            <span class="stat-value">{{ elevationGain }} m</span>
          </div>
          <div class="stat-item" v-if="track.elevation_dataset">
            <span class="stat-label">Data source</span>
            <span class="stat-value">{{ formatDataset(track.elevation_dataset) }}</span>
          </div>
        </div>
      </div>
      
      <!-- Slope Analysis Section -->
      <div class="stats-section" v-if="hasSlopeData" data-testid="slope-section">
        <h3 data-testid="slope-analysis-title">Slope Analysis</h3>
        <div class="slope-stats-grid" data-testid="slope-stats-grid">
          <div class="stat-item" v-if="track.slope_max !== undefined && track.slope_max !== null" data-testid="max-uphill-slope">
            <span class="stat-label">Max uphill slope</span>
            <span class="stat-value">+{{ Math.abs(track.slope_max).toFixed(1) }}%</span>
          </div>
          <div class="stat-item" v-if="track.slope_min !== undefined && track.slope_min !== null" data-testid="max-downhill-slope">
            <span class="stat-label">Max downhill slope</span>
            <span class="stat-value">{{ track.slope_min.toFixed(1) }}%</span>
          </div>
          <div class="stat-item" v-if="track.slope_avg !== undefined && track.slope_avg !== null" data-testid="avg-slope">
            <span class="stat-label">Avg slope</span>
            <span class="stat-value">{{ track.slope_avg >= 0 ? '+' : '' }}{{ track.slope_avg.toFixed(1) }}%</span>
          </div>
          <div class="stat-item" v-if="slopeDistributionStats.uphillPercent !== undefined" data-testid="uphill-distance">
            <span class="stat-label">Uphill distance</span>
            <span class="stat-value">{{ slopeDistributionStats.uphillPercent.toFixed(1) }}%</span>
          </div>
          <div class="stat-item" v-if="slopeDistributionStats.steepUphillPercent !== undefined" data-testid="steep-uphill">
            <span class="stat-label">Steep uphill (>8%)</span>
            <span class="stat-value">{{ slopeDistributionStats.steepUphillPercent.toFixed(1) }}%</span>
          </div>
          <div class="stat-item" v-if="slopeDistributionStats.steepDownhillPercent !== undefined" data-testid="steep-downhill">
            <span class="stat-label">Steep downhill (&lt;-8%)</span>
            <span class="stat-value">{{ slopeDistributionStats.steepDownhillPercent.toFixed(1) }}%</span>
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
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import ElevationChart from './ElevationChart.vue';
import { 
  formatDuration as utilFormatDuration,
  formatDistance,
  convertUrlsToLinks
} from '../utils/format';
import { validateSpeedData, formatSpeed, formatPace, calculatePaceFromSpeed } from '../composables/useTracks';
import { useUnits } from '../composables/useUnits';
import { useMemoizedComputed } from '../composables/useMemoization';
import { clearCacheByPattern } from '../composables/useMemoization';
import { useAdvancedDebounce } from '../composables/useAdvancedDebounce';
import { useToast } from '../composables/useToast';
import { useConfirm } from '../composables/useConfirm';

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
// Use toast notifications
const { showToast } = useToast();
// Use confirm dialogs
const { showConfirm } = useConfirm();
const chartMode = ref('elevation');
const chartUpdateKey = ref(Date.now()); // Force chart updates
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
  
  // Auto-start polling for tracks without elevation data on mount
  if (props.track) {
    const hasNoElevationData = !props.track.elevation_enriched && 
                              !props.track.elevation_gain && 
                              !props.track.elevation_loss &&
                              !props.track.elevation_profile;
    
    if (hasNoElevationData && props.track.length_km > 0 && !isPollingForElevation.value) {
      console.info(`[TrackDetailPanel] Track ${props.track.id} has no elevation data on mount, starting auto-polling`);
      startElevationPolling(props.track.id);
    }
  }
});

// Cleanup on unmount
onUnmounted(() => {
  stopElevationPolling();
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

// --- Elevation enrichment state ---
const enrichingElevation = ref(false);

// --- Elevation enrichment polling ---
const enrichmentPollingInterval = ref(null);
const isPollingForElevation = ref(false);

function startElevationPolling(trackId) {
  if (isPollingForElevation.value) return;
  
  isPollingForElevation.value = true;
  console.info(`[TrackDetailPanel] Starting elevation polling for track ${trackId}`);
  
  enrichmentPollingInterval.value = setInterval(async () => {
    await pollForElevationData(trackId);
  }, 3000); // Poll every 3 seconds
}

// Separate polling function for easier testing
async function pollForElevationData(trackId) {
  try {
    const response = await fetch(`/tracks/${trackId || props.track.id}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const updatedTrack = await response.json();
    
    // Check if elevation data has been updated
    const hasNewElevationData = 
      (updatedTrack.elevation_enriched && !track.value.elevation_enriched) ||
      (updatedTrack.elevation_gain !== track.value.elevation_gain) ||
      (updatedTrack.elevation_loss !== track.value.elevation_loss) ||
      (updatedTrack.elevation_min !== track.value.elevation_min) ||
      (updatedTrack.elevation_max !== track.value.elevation_max) ||
      (updatedTrack.slope_min !== track.value.slope_min) ||
      (updatedTrack.slope_max !== track.value.slope_max) ||
      (updatedTrack.slope_segments?.length !== track.value.slope_segments?.length);
    
    if (hasNewElevationData) {
      console.info(`[TrackDetailPanel] Elevation data updated for track ${trackId || props.track.id}`);
      
      // Force cache invalidation before updating track data
      clearCacheByPattern(`elevation_${trackId || props.track.id}`);
      clearCacheByPattern(`chartdata_`);
      chartUpdateKey.value = Date.now();
      
      // Update local track data - create new object to trigger reactivity
      track.value = {
        ...track.value,
        elevation_enriched: updatedTrack.elevation_enriched,
        elevation_gain: updatedTrack.elevation_gain,
        elevation_loss: updatedTrack.elevation_loss,
        elevation_min: updatedTrack.elevation_min,
        elevation_max: updatedTrack.elevation_max,
        elevation_dataset: updatedTrack.elevation_dataset,
        elevation_enriched_at: updatedTrack.elevation_enriched_at,
        elevation_profile: updatedTrack.elevation_profile,
        slope_min: updatedTrack.slope_min,
        slope_max: updatedTrack.slope_max,
        slope_avg: updatedTrack.slope_avg,
        slope_segments: updatedTrack.slope_segments,
        slope_histogram: updatedTrack.slope_histogram,
        // Add timestamp to force chart update
        _lastUpdated: Date.now()
      };
      
      // Dispatch global event for other components
      window.dispatchEvent(new CustomEvent('track-elevation-updated', { 
        detail: { 
          trackId: trackId || props.track.id,
          elevation_gain: updatedTrack.elevation_gain,
          elevation_loss: updatedTrack.elevation_loss,
          elevation_min: updatedTrack.elevation_min,
          elevation_max: updatedTrack.elevation_max,
          elevation_dataset: updatedTrack.elevation_dataset,
          elevation_profile: updatedTrack.elevation_profile,
          elevation_enriched_at: updatedTrack.elevation_enriched_at,
          slope_min: updatedTrack.slope_min,
          slope_max: updatedTrack.slope_max,
          slope_segments: updatedTrack.slope_segments
        } 
      }));
      
      // Force reactivity with nextTick
      await nextTick();
      
      // Stop polling
      stopElevationPolling();
      
      // Show success message
      showToast('Elevation data has been successfully updated!', 'success');
    }
  } catch (error) {
    console.error(`[TrackDetailPanel] Error polling elevation data: ${error.message}`);
    // Continue polling on error
    throw error; // Re-throw for test handling
  }
}

function stopElevationPolling() {
  if (enrichmentPollingInterval.value) {
    console.info(`[TrackDetailPanel] Stopping elevation polling`);
    clearInterval(enrichmentPollingInterval.value);
    enrichmentPollingInterval.value = null;
  }
  isPollingForElevation.value = false;
}

// Computed property to safely parse time data
const parsedTimeData = computed(() => {
  const timeData = track.value?.time_data;
  if (!timeData) return [];
  
  if (Array.isArray(timeData)) {
    return timeData;
  }
  
  if (typeof timeData === 'string') {
    try {
      const parsed = JSON.parse(timeData);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[TrackDetailPanel] Failed to parse time_data string:', e);
      return [];
    }
  }
  
  return [];
});
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
    const hasElevationGain = track?.elevation_gain !== undefined && 
                            track?.elevation_gain !== null && 
                            track?.elevation_gain > 0;
    const hasElevationLoss = track?.elevation_loss !== undefined && 
                            track?.elevation_loss !== null && 
                            Math.abs(track?.elevation_loss) > 0;
    
    return hasElevationGain || hasElevationLoss;
  },
  [() => props.track],
  {
    keyFn: (deps) => {
      const track = deps[0];
      if (!track) return 'elevation_null';
      const profileHash = track.elevation_profile ? `${track.elevation_profile.length}_${JSON.stringify(track.elevation_profile.slice(0, 2))}` : 'null';
      return `elevation_${track.id}_${profileHash}_${track.elevation_gain}_${track.elevation_loss}_${track.elevation_enriched}_${track.elevation_enriched_at}_${track._lastUpdated || '0'}`;
    }
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
    keyFn: (deps) => {
      const track = deps[0];
      if (!track) return 'hr_null';
      const hrDataHash = track.hr_data ? `${track.hr_data.length}_${JSON.stringify(track.hr_data.slice(0, 2))}` : 'null';
      return `hr_${track.id}_${hrDataHash}_${track.avg_hr}_${track.max_hr}`;
    }
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
    keyFn: (deps) => {
      const track = deps[0];
      if (!track) return 'temp_null';
      const tempDataHash = track.temp_data ? `${track.temp_data.length}_${JSON.stringify(track.temp_data.slice(0, 2))}` : 'null';
      return `temp_${track.id}_${tempDataHash}`;
    }
  }
);

const hasPaceData = useMemoizedComputed(
  (track, parsedTime) => {
    console.log('[TrackDetailPanel] Checking pace data for track:', track?.id, {
      speedData: track?.speed_data ? 'present' : 'missing',
      avgSpeed: track?.avg_speed,
      movingAvgSpeed: track?.moving_avg_speed,
      coordinates: track?.geom_geojson?.coordinates?.length || 0,
      timeData: parsedTime?.length || 0,
      durationsSeconds: track?.duration_seconds
    });
    
    // Check for direct speed data
    if (track?.speed_data && track?.speed_data.length > 0) {
      return track.speed_data.some(speed => speed !== null && speed !== undefined && typeof speed === 'number' && speed > 0);
    }
    
    // Check if we have aggregate speed data that we can use to estimate pace
    if (track?.avg_speed && track?.avg_speed > 0) {
      console.log('[TrackDetailPanel] Found avg_speed for pace calculation:', track.avg_speed);
      return true;
    }
    
    if (track?.moving_avg_speed && track?.moving_avg_speed > 0) {
      console.log('[TrackDetailPanel] Found moving_avg_speed for pace calculation:', track.moving_avg_speed);
      return true;
    }
    
    // Check if we can calculate pace from coordinate and time data
    if (track?.geom_geojson?.coordinates && parsedTime && 
        track.geom_geojson.coordinates.length > 1 && parsedTime.length > 1 &&
        track.geom_geojson.coordinates.length === parsedTime.length) {
      console.log('[TrackDetailPanel] Found coordinate and time data for pace calculation');
      return true;
    }
    
    console.log('[TrackDetailPanel] No suitable pace data found');
    return false;
  },
  [() => props.track, () => parsedTimeData.value],
  {
    keyFn: (deps) => {
      const [track, parsedTime] = deps;
      if (!track) return 'pace_null';
      const speedDataHash = track.speed_data ? `${track.speed_data.length}_${JSON.stringify(track.speed_data.slice(0, 2))}` : 'null';
      const coordDataHash = track.geom_geojson?.coordinates ? `${track.geom_geojson.coordinates.length}_${JSON.stringify(track.geom_geojson.coordinates.slice(0, 2))}` : 'null';
      const timeDataHash = parsedTime ? `${parsedTime.length}_${JSON.stringify(parsedTime.slice(0, 2))}` : 'null';
      return `pace_${track.id}_${speedDataHash}_${coordDataHash}_${timeDataHash}_${track.avg_speed}_${track.moving_avg_speed}`;
    }
  }
);

const hasSlopeData = computed(() => {
  const track = props.track;
  
  // Check for slope segments data
  if (track?.slope_segments && track?.slope_segments.length > 0) {
    const hasSlope = track.slope_segments.some(segment => 
      segment && typeof segment === 'object' && 
      typeof segment.slope_percent === 'number'
    );
    return hasSlope;
  }
  
  // Check if slope metrics are available
  const hasMetrics = track?.slope_min !== null && track?.slope_max !== null;
  return hasMetrics;
});

// Calculate slope distribution statistics from histogram
const slopeDistributionStats = computed(() => {
  const track = props.track;
  
  if (!track?.slope_histogram || !Array.isArray(track.slope_histogram)) {
    return {
      uphillPercent: undefined,
      steepUphillPercent: undefined,
      steepDownhillPercent: undefined
    };
  }
  
  let totalDistance = 0;
  let uphillDistance = 0;
  let steepUphillDistance = 0; // >8%
  let steepDownhillDistance = 0; // <-8%
  
  track.slope_histogram.forEach(bucket => {
    if (bucket && typeof bucket.distance_m === 'number') {
      const distance = bucket.distance_m;
      const bucketFrom = bucket.bucket_from || 0;
      const bucketTo = bucket.bucket_to || 0;
      
      totalDistance += distance;
      
      // Count uphill (positive slope)
      if (bucketFrom > 0 || bucketTo > 0) {
        uphillDistance += distance;
      }
      
      // Count steep uphill (>8%)
      if (bucketFrom > 8) {
        steepUphillDistance += distance;
      }
      
      // Count steep downhill (<-8%)
      if (bucketTo < -8) {
        steepDownhillDistance += distance;
      }
    }
  });
  
  if (totalDistance === 0) {
    return {
      uphillPercent: undefined,
      steepUphillPercent: undefined,
      steepDownhillPercent: undefined
    };
  }
  
  return {
    uphillPercent: (uphillDistance / totalDistance) * 100,
    steepUphillPercent: (steepUphillDistance / totalDistance) * 100,
    steepDownhillPercent: (steepDownhillDistance / totalDistance) * 100
  };
});

// Combined check for elevation section visibility
const hasElevationOrHeartRateData = computed(() => {
  return hasElevationData.value || hasHeartRateData.value || hasTemperatureData.value || hasPaceData.value || hasSlopeData.value;
});

// Dynamic chart title based on available data - memoized
const chartTitle = useMemoizedComputed(
  (hasElevation, hasHR, hasTemp, hasPace, trackName) => {
    const dataTypes = [];
    if (hasElevation) dataTypes.push('Elevation');
    if (hasHR) dataTypes.push('Heart Rate');
    if (hasTemp) dataTypes.push('Temperature');
    if (hasPace) dataTypes.push('Pace');
    
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
    () => hasPaceData.value,
    () => props.track?.name || 'Unnamed Track'
  ],
  {
    keyFn: (deps) => `charttitle_${deps.join('_')}`
  }
);

const track = ref(props.track);

// Watch for track changes
watch(() => props.track, (newTrack, oldTrack) => {
  track.value = newTrack;
  
  // Auto-start polling for tracks without elevation data
  if (newTrack && newTrack.id !== oldTrack?.id) {
    // Stop any existing polling first
    stopElevationPolling();
    
    // Check if track has no elevation data but should be enriched automatically
    const hasNoElevationData = !newTrack.elevation_enriched && 
                              !newTrack.elevation_gain && 
                              !newTrack.elevation_loss &&
                              !newTrack.elevation_profile;
    
    if (hasNoElevationData && newTrack.length_km > 0) {
      console.info(`[TrackDetailPanel] Track ${newTrack.id} has no elevation data, starting auto-polling`);
      startElevationPolling(newTrack.id);
    }
  }
});

// Watch for elevation data changes in the prop (for updates from parent)
watch(() => [
  props.track?.elevation_enriched,
  props.track?.elevation_gain,
  props.track?.elevation_loss,
  props.track?.elevation_profile,
  props.track?.slope_segments,
  props.track?.slope_min,
  props.track?.slope_max
], (newVals, oldVals) => {
  // Update local track if prop changed
  if (props.track && props.track !== track.value) {
    console.info(`[TrackDetailPanel] Data updated via prop for track ${props.track.id}`);
    
    // Force complete track update with new object reference
    track.value = { ...props.track };
    
    // Stop polling if elevation data is now available
    if (props.track.elevation_enriched && isPollingForElevation.value) {
      stopElevationPolling();
    }
  } else if (newVals && oldVals && JSON.stringify(newVals) !== JSON.stringify(oldVals)) {
    // If the reference is the same but data changed, force reactivity
    console.info(`[TrackDetailPanel] Data values changed for track ${props.track?.id}`);
    track.value = { ...props.track };
  }
}, { deep: false });

// Processed description with clickable links
const processedDescription = computed(() => {
  return track.value?.description ? convertUrlsToLinks(track.value.description) : '';
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
  (elevationGain, elevationLoss) => {
    if (elevationGain === undefined || elevationGain === null || elevationLoss === undefined || elevationLoss === null) {
      return null;
    }
    
    const gain = elevationGain - Math.abs(elevationLoss);
    return gain >= 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0);
  },
  [() => track.value?.elevation_gain, () => track.value?.elevation_loss],
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
  
  const proceed = await showConfirm({
    title: 'Delete Track',
    message: 'Delete track? This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });
  
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
      showToast('You are not allowed to delete this track.', 'error');
    } else if (res.status === 404) {
      showToast('Track not found or already deleted.', 'error');
    } else {
      showToast('Failed to delete track.', 'error');
    }
  } catch (err) {
    console.error('Delete track error', err);
    showToast('Error deleting track.', 'error');
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
    
    // Dispatch global event for other components (like HomeView tooltip)
    window.dispatchEvent(new CustomEvent('track-name-updated', { 
      detail: { 
        trackId: track.value.id, 
        newName: editedName.value.trim() 
      } 
    }));
    
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
    
    // Dispatch global event for other components (like HomeView tooltip)
    window.dispatchEvent(new CustomEvent('track-description-updated', { 
      detail: { 
        trackId: track.value.id, 
        newDescription: editedDescription.value 
      } 
    }));
    
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

function formatCategory(category) {
  // Format category with proper capitalization
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatClassification(classification) {
  // Format classification with proper capitalization
  return classification
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDataset(dataset) {
  if (!dataset) return 'Unknown';
  
  // Handle common dataset names
  const datasetNames = {
    'original_gpx': 'Original GPX',
    'original': 'Original',
    'aster30m': 'ASTER 30m',
    'srtm30m': 'SRTM 30m',
    'srtm90m': 'SRTM 90m',
    'mapzen': 'Mapzen',
    'eudem25m': 'EU-DEM 25m',
    'ned10m': 'NED 10m',
    'open-elevation': 'Open-Elevation'
  };
  
  return datasetNames[dataset] || dataset.charAt(0).toUpperCase() + dataset.slice(1);
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

// Force enrich elevation data
async function forceEnrichElevation() {
  if (!track.value?.id || enrichingElevation.value) return;
  
      // Show confirmation dialog if track already has elevation data
      if (hasElevationData.value) {
        const confirmed = await showConfirm({
          title: 'Update Elevation Data',
          message: 'This track already has elevation data. Updating will replace the existing data with new values from the external service. Continue?',
          confirmText: 'Continue',
          cancelText: 'Cancel'
        });
        if (!confirmed) return;
      }  enrichingElevation.value = true;
  try {
    const response = await fetch(`/tracks/${track.value.id}/enrich-elevation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: props.sessionId,
        force: true
      })
    });
    
    if (!response.ok) {
      if (response.status === 403) {
        showToast('You are not allowed to update this track.', 'error');
        return;
      } else if (response.status === 429) {
        showToast('API rate limit exceeded. Please try again later.', 'error');
        return;
      } else {
        throw new Error('Failed to update elevation data');
      }
    }
    
    const result = await response.json();
    
    // Update local track data with new elevation information
    if (result.elevation_gain !== undefined) track.value.elevation_gain = result.elevation_gain;
    if (result.elevation_loss !== undefined) track.value.elevation_loss = result.elevation_loss;
    if (result.elevation_min !== undefined) track.value.elevation_min = result.elevation_min;
    if (result.elevation_max !== undefined) track.value.elevation_max = result.elevation_max;
    if (result.elevation_dataset !== undefined) track.value.elevation_dataset = result.elevation_dataset;
    if (result.enriched_at !== undefined) track.value.elevation_enriched_at = result.enriched_at;
    track.value.elevation_enriched = true;
    
    // Fetch the complete updated track data to get elevation_profile and slope data
    console.info(`[TrackDetailPanel] Fetching updated track data after elevation enrichment`);
    try {
      const trackResponse = await fetch(`/tracks/${track.value.id}`);
      if (trackResponse.ok) {
        const updatedTrack = await trackResponse.json();
        
        // Force cache invalidation
        clearCacheByPattern(`elevation_${track.value.id}`);
        clearCacheByPattern(`chartdata_`);
        
        // Force chart update
        chartUpdateKey.value = Date.now();
        
        // Force complete track update with new object reference
        track.value = {
          ...track.value,
          elevation_profile: updatedTrack.elevation_profile,
          elevation_gain: updatedTrack.elevation_gain,
          elevation_loss: updatedTrack.elevation_loss,
          elevation_min: updatedTrack.elevation_min,
          elevation_max: updatedTrack.elevation_max,
          elevation_dataset: updatedTrack.elevation_dataset,
          elevation_enriched_at: updatedTrack.elevation_enriched_at,
          elevation_enriched: updatedTrack.elevation_enriched,
          slope_min: updatedTrack.slope_min,
          slope_max: updatedTrack.slope_max,
          slope_avg: updatedTrack.slope_avg,
          slope_segments: updatedTrack.slope_segments,
          slope_histogram: updatedTrack.slope_histogram,
          // Add timestamp to force chart update
          _lastUpdated: Date.now()
        };
        
        console.info(`[TrackDetailPanel] Track data updated successfully`);
        
        // Force reactivity with nextTick
        await nextTick();
      }
    } catch (fetchError) {
      console.error(`[TrackDetailPanel] Failed to fetch updated track data:`, fetchError);
      // Don't start polling - just show a message
      showToast('Elevation data was enriched, but failed to refresh the display. Please refresh the page to see the updated data.', 'error');
    }
    
    // Dispatch global event to update other components (like tooltip)
    window.dispatchEvent(new CustomEvent('track-elevation-updated', { 
      detail: { 
        trackId: track.value.id,
        elevation_gain: track.value.elevation_gain,
        elevation_loss: track.value.elevation_loss,
        elevation_min: track.value.elevation_min,
        elevation_max: track.value.elevation_max,
        elevation_dataset: track.value.elevation_dataset,
        elevation_profile: track.value.elevation_profile
      } 
    }));
    
    showToast('Elevation data updated successfully!', 'success');
    
  } catch (error) {
    console.error('Elevation enrichment failed:', error);
    showToast('Failed to update elevation data. Please try again.', 'error');
  } finally {
    enrichingElevation.value = false;
  }
}

function handleClose() {
  isClosing.value = true;
  // Stop any ongoing polling
  stopElevationPolling();
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
    const hasPace = hasPaceData.value;
    const hasSlope = hasSlopeData.value;
    
    if (import.meta.env.DEV) {
      console.log('[TrackDetailPanel] Chart mode logic:', {
        currentMode: chartMode.value,
        hasElevation,
        hasSlope,
        hasHR,
        hasTemp,
        hasPace
      });
    }
    
    if (hasElevation && (hasHR || hasTemp || hasPace)) {
      // If elevation and at least one other type are available, keep current mode or default to 'both'
      if (!['elevation', 'pulse', 'temperature', 'pace', 'elevation-with-slope', 'both'].includes(chartMode.value)) {
        chartMode.value = 'both';
      }
    } else if (hasElevation && hasSlope) {
      // If we have both elevation and slope, only set elevation-with-slope if no valid mode is set
      if (!['elevation', 'elevation-with-slope'].includes(chartMode.value)) {
        chartMode.value = 'elevation-with-slope';
      }
    } else if (hasElevation) {
      if (!['elevation'].includes(chartMode.value)) {
        chartMode.value = 'elevation';
      }
    } else if (hasHR) {
      chartMode.value = 'pulse';
    } else if (hasTemp) {
      chartMode.value = 'temperature';
    } else if (hasPace) {
      chartMode.value = 'pace';
    }
    
    if (import.meta.env.DEV) {
      console.log('[TrackDetailPanel] Final chart mode:', chartMode.value);
    }
  }
}, { immediate: true });

// Expose methods for testing
defineExpose({
  pollForElevationData,
  startElevationPolling,
  stopElevationPolling,
  isPollingForElevation,
  enrichmentPollingInterval
});
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

/* Header Actions Container */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Force Update Button */
.force-update-btn {
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
  box-sizing: border-box;
}

.force-update-btn:hover:not(:disabled) {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
  transform: scale(1.05);
}

.force-update-btn:active {
  transform: scale(0.95);
}

.force-update-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.force-update-btn svg {
  transition: transform 0.3s ease;
}

.force-update-btn:hover:not(:disabled) svg {
  transform: rotate(180deg);
}

/* Stop Polling Button in Header */
.stop-polling-btn-header {
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
  box-sizing: border-box;
}

.stop-polling-btn-header:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  transform: scale(1.05);
}

.stop-polling-btn-header:active {
  transform: scale(0.95);
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
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

/* Slope Stats Grid */
.slope-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
  
  .elevation-stats {
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
  
  .header-actions {
    align-self: flex-end;
    width: 100%;
    justify-content: flex-end;
  }
  
  .unit-toggles {
    align-self: flex-end;
  }
}

@media (max-width: 500px) {
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
