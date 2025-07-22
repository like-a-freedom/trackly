<template>
  <div 
    v-if="isVisible" 
    class="search-overlay"
    @click.self="closeSearch"
  >
    <div class="search-modal">
      <div class="search-input-container">
        <div class="search-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
        </div>
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search tracks..."
          class="search-input"
          @keydown.enter="performSearch"
          @keydown.escape="closeSearch"
          @input="onInputChange"
        />
        <button 
          v-if="searchQuery"
          @click="clearSearch"
          class="clear-button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div v-if="isLoading" class="search-loading">
        <div class="loading-spinner"></div>
        <span>Searching...</span>
      </div>
      
      <div v-else-if="searchResults.length > 0" class="search-results">
        <div 
          v-for="track in searchResults" 
          :key="track.id"
          class="search-result-item"
          @click="selectTrack(track)"
        >
          <div class="track-info">
            <h3 class="track-name">{{ track.name }}</h3>
            <p v-if="track.description" class="track-description">{{ track.description }}</p>
            <div class="track-meta">
              <span class="track-length">{{ formatDistance(track.length_km) }}</span>
              <span v-if="track.categories.length > 0" class="track-categories">
                {{ track.categories.join(', ') }}
              </span>
            </div>
          </div>
          <div class="track-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9,18 15,12 9,6"></polyline>
            </svg>
          </div>
        </div>
      </div>
      
      <div v-else-if="searchQuery && !isLoading" class="no-results">
        <div class="no-results-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
        </div>
        <p>No tracks found. Please, refine your query.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useSearchState } from '../composables/useSearchState'

const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'track-selected'])

const searchInput = ref(null)
const isLoading = ref(false)
const searchTimeout = ref(null)

// Use global search state
const { searchQuery, searchResults, saveSearchState, hasSearchState } = useSearchState()

// Watch for visibility to focus input and handle search restoration
watch(() => props.isVisible, (visible) => {
  if (visible) {
    nextTick(() => {
      searchInput.value?.focus()
      // If we have saved search state, perform search to restore results
      if (hasSearchState() && searchQuery.value.trim()) {
        performSearch()
      }
    })
  }
  // Don't clear search state when closing - preserve it for restoration
})

const formatDistance = (km) => {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`
  }
  return `${km.toFixed(1)}km`
}

const onInputChange = () => {
  // Clear previous timeout
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }
  
  // Set new timeout for debounced search
  if (searchQuery.value.trim()) {
    searchTimeout.value = setTimeout(() => {
      performSearch()
    }, 300)
  } else {
    searchResults.value = []
  }
}

const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  isLoading.value = true
  
  try {
    const response = await fetch(`/tracks/search?query=${encodeURIComponent(searchQuery.value)}`)
    if (response.ok) {
      const results = await response.json()
      searchResults.value = results
      // Save search state for potential restoration
      saveSearchState(searchQuery.value, results)
    } else {
      console.error('Search failed:', response.status)
      searchResults.value = []
    }
  } catch (error) {
    console.error('Search error:', error)
    searchResults.value = []
  } finally {
    isLoading.value = false
  }
}

const selectTrack = (track) => {
  emit('track-selected', track)
}

const clearSearch = () => {
  searchQuery.value = ''
  searchResults.value = []
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }
  // Don't clear saved search state here - only clear current search
}

const closeSearch = () => {
  emit('close')
}
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
  margin-right: 12px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  background: transparent;
  color: #333;
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
  margin-left: 8px;
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
  margin-right: 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
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

.search-result-item:last-child {
  border-bottom: none;
}

.track-info {
  flex: 1;
}

.track-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #333;
}

.track-description {
  font-size: 14px;
  color: #666;
  margin: 0 0 8px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.track-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #888;
}

.track-length {
  font-weight: 500;
}

.track-categories {
  opacity: 0.8;
}

.track-arrow {
  color: #ccc;
  margin-left: 12px;
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
  font-size: 16px;
}

/* Force light theme for consistency with the rest of the interface */
</style>
