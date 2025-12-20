<template>
  <div>
    <form class="upload-form" @submit.prevent="handleUpload" @dragover.prevent="setDragActive(true)" @dragleave.prevent="setDragActive(false)" @drop.prevent="onDrop" @mousedown.stop @mouseup.stop @click.stop @dblclick.stop @selectstart.stop>
      <label
        for="track-upload"
        class="upload-label drop-area"
        :class="{ 'drag-active': dragActive }"
      >
        <span v-if="!selectedFile">Drag and drop a GPX track file or click to select it</span>
        <span v-else>File: {{ selectedFile.name }}</span>
        <input
          id="track-upload"
          type="file"
          accept=".gpx,.kml"
          class="upload-input"
          @change="onFileChange"
          style="display: none;"
        />
      </label>
      <template v-if="selectedFile && !trackExists">
        <input
          id="track-name-input"
          class="track-name-input"
          v-model="trackName"
          type="text"
          placeholder="Track name"
          autocomplete="off"
          @mousedown.stop
          @mouseup.stop
          @click.stop
          @dblclick.stop
          @selectstart.stop
          @dragstart.prevent
        />
        <Multiselect
          v-model="trackCategories"
          mode="tags"
          :close-on-select="false"
          :searchable="true"
          :create-option="true"
          :options="categoriesList"
          :object="true"
          placeholder="Select or create categories"
          class="track-category-select"
          :append-to-body="true"
          position="auto"
          :max-height="220"
          @mousedown.stop
          @mouseup.stop
          @click.stop
          @dblclick.stop
          @selectstart.stop
          @dragstart.prevent
        />
      </template>
      <transition name="fade-slide">
        <div v-if="trackExists" class="upload-warning upload-warning-centered">
          <span>Track already exists</span>
          <button 
            v-if="existingTrackId"
            @click="navigateToExistingTrack" 
            class="track-link-btn"
            title="View existing track"
            aria-label="View existing track"
          >
            Show track
          </button>
        </div>
      </transition>
      <transition name="fade-slide">
        <div v-if="!trackExists && warning" :class="['upload-warning', { 'upload-warning-centered': warning && warning.includes('exists') }]">
          {{ warning }}
        </div>
      </transition>
      <transition name="fade-slide">
        <div v-if="selectedFile && !trackExists && trackCategories.length === 0 && !warning && !checkingExists" class="upload-warning">
          Please select at least one category.
        </div>
      </transition>
      <transition name="fade-slide">
        <div v-if="uploadSuccess" class="upload-success upload-success-harmonized">
          <span class="success-text">Track uploaded successfully!</span>
          <div v-if="uploadedTrackData" class="success-actions">
            <button 
              @click="navigateToTrack" 
              class="track-link-btn"
              title="View uploaded track"
              aria-label="View track"
            >
              Show track
            </button>
            <button 
              @click="copyTrackUrl" 
              class="copy-link-btn"
              :disabled="copyingLink"
              :title="copyingLink ? 'Copying...' : linkCopied ? 'Link copied!' : 'Copy track link'"
              aria-label="Copy track link"
            >
              <svg v-if="!copyingLink && !linkCopied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.53 1.53"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.53-1.53"></path>
              </svg>
              <svg v-else-if="linkCopied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"></path>
              </svg>
            </button>
          </div>
        </div>
      </transition>
      <button v-if="selectedFile" type="submit" class="upload-btn" :disabled="!selectedFile || trackExists || checkingExists || trackCategories.length === 0">Upload</button>
    </form>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Multiselect from '@vueform/multiselect';
import '@vueform/multiselect/themes/default.css';
import { useTracks } from '../composables/useTracks';
const { uploadTrack, checkTrackDuplicate } = useTracks();
const router = useRouter();
const emit = defineEmits(['upload', 'uploaded', 'update:dragActive']);
const props = defineProps({ dragActive: Boolean });
const selectedFile = ref(null);
const dragActive = ref(props.dragActive);
const trackName = ref("");
const trackCategories = ref([]); // Array of objects: { value, label }
const trackExists = ref(false);
const existingTrackId = ref(null); // Store existing track ID for duplicate case
const checkingExists = ref(false);
const warning = ref("");
const uploadSuccess = ref(false);
const uploadedTrackData = ref(null); // Store uploaded track data (id, url)
const copyingLink = ref(false);
const linkCopied = ref(false);
const categoriesList = [
  { value: 'hiking', label: 'Hiking' },
  { value: 'running', label: 'Running' },
  { value: 'walking', label: 'Walking' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'skiing', label: 'Skiing' },
  { value: 'other', label: 'Other' },
];
watch(() => props.dragActive, v => dragActive.value = v);
watch(selectedFile, async () => {
  warning.value = "";
  trackExists.value = false;
  existingTrackId.value = null;
  // Do not reset uploadSuccess here, so the message stays visible after upload
  if (selectedFile.value) {
    checkingExists.value = true;
    const { alreadyExists, id, warning: warnMsg } = await checkTrackDuplicate({
      file: selectedFile.value
    });
    trackExists.value = alreadyExists;
    existingTrackId.value = id || null;
    warning.value = warnMsg || "";
    checkingExists.value = false;
  }
});
function setDragActive(val) {
  dragActive.value = val;
  emit('update:dragActive', val);
}
function onFileChange(event) {
  const file = event.target.files[0];
  selectedFile.value = file || null;
  if (file) {
    trackName.value = file.name.replace(/\.[^.]+$/, "").normalize('NFC');
    uploadSuccess.value = false; // Hide success message on new file
    uploadedTrackData.value = null; // Clear uploaded track data
    copyingLink.value = false; // Reset copying state
    linkCopied.value = false; // Reset copied state
  } else {
    trackName.value = "";
  }
}
function onDrop(event) {
  setDragActive(false);
  const file = event.dataTransfer.files[0];
  if (file) {
    selectedFile.value = file;
    // Populate trackName from original filename (without extension)
    try {
      trackName.value = file.name.replace(/\.[^.]+$/, "").normalize('NFC');
    } catch (e) {
      // If normalize is unavailable or fails, fallback to raw name without extension
      trackName.value = file.name.replace(/\.[^.]+$/, "");
    }

    uploadSuccess.value = false; // Hide success message on new file
    uploadedTrackData.value = null; // Clear uploaded track data
    copyingLink.value = false; // Reset copying state
    linkCopied.value = false; // Reset copied state
  }
}
async function handleUpload() {
  if (!selectedFile.value || trackExists.value || checkingExists.value) return;
  if (trackCategories.value.length === 0) {
    warning.value = 'Please select at least one category.';
    return;
  }
  try {
    const response = await uploadTrack({
      file: selectedFile.value,
      name: trackName.value.normalize('NFC'),
      categories: trackCategories.value.length
        ? trackCategories.value.map(obj => obj.value)
        : []
    });
    
    // Store the upload response data
    uploadedTrackData.value = response;
    
    selectedFile.value = null;
    trackName.value = "";
    trackCategories.value = [];
    uploadSuccess.value = true;
    setTimeout(() => { 
      uploadSuccess.value = false; 
      uploadedTrackData.value = null; // Clear after timeout
      copyingLink.value = false; // Reset copying state
      linkCopied.value = false; // Reset copied state
    }, 5000); // Increased to 5 seconds for better UX
    emit('uploaded');
  } catch (e) {
    if (e && e.message && e.message.includes('10 seconds')) {
      warning.value = 'Please, wait 10 seconds between uploads.';
    } else {
      warning.value = (e && e.message) || 'Error uploading track';
    }
  }
}

// Function to navigate to the uploaded track
function navigateToTrack() {
  if (uploadedTrackData.value && uploadedTrackData.value.id) {
    router.push(`/track/${uploadedTrackData.value.id}`);
  }
}

// Function to navigate to existing track (for duplicate case)
function navigateToExistingTrack() {
  if (existingTrackId.value) {
    router.push(`/track/${existingTrackId.value}`);
  }
}

// Function to copy track URL to clipboard
async function copyTrackUrl() {
  if (!uploadedTrackData.value) return;
  
  copyingLink.value = true;
  try {
    // Create the shareable URL
    const trackUrl = `${window.location.origin}/track/${uploadedTrackData.value.id}`;
    
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
      textArea.value = `${window.location.origin}/track/${uploadedTrackData.value.id}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      // Show success feedback for fallback too
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
</script>
<style>

.upload-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  background: none;
  border-radius: 0;
  box-shadow: none;
}
.upload-label {
  font-size: 15px;
  margin-bottom: 2px;
  color: #222;
  cursor: pointer;
  font-weight: 400;
  padding: 0 2px;
  line-height: 1.3;
}
.upload-input {
  font-size: 14px;
  padding: 3px 2px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fafbfc;
  margin-bottom: 1px;
}
.upload-btn {
  margin-top: 4px;
  padding: 7px 0;
  background: linear-gradient(90deg, #1976d2 60%, #2196f3 100%);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition: background 0.2s;
  box-shadow: 0 1px 4px rgba(25, 118, 210, 0.08);
}
.upload-btn:disabled {
  background: #b0b0b0;
  cursor: not-allowed;
}
.drop-area {
  border: 2px dashed #1976d2;
  border-radius: 6px;
  padding: 12px 4px;
  text-align: center;
  background: #f7faff;
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
  margin-bottom: 6px;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #222;
  font-weight: 400;
  line-height: 1.3;
}
.drop-area.drag-active {
  border-color: #2196f3;
  background: #e3f2fd;
}
.upload-label input[type="file"] {
  display: none;
}
.track-name-input {
  margin-top: 6px;
  margin-bottom: 6px;
  padding: 6px 8px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 14px;
}
.track-category-select {
  margin-bottom: 6px;
  width: 100%;
  --ms-tag-bg: #10B981;
  --ms-tag-color: #fff;
  --ms-tag-radius: 4px;
  --ms-tag-font-size: 0.87rem;
  --ms-tag-font-weight: 600;
  font-size: 0.87rem;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  /* slightly increase min-height to reduce vertical shift when tags are added */
  min-height: 44px;
}
.upload-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff4f4;
  color: #c00;
  border: 1px solid #f3bcbc;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 2px;
  margin-top: 2px;
  min-height: 32px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(200,0,0,0.04);
}

/* Centered layout for prominent single-line warnings (e.g., duplicate detection) */
.upload-warning-centered {
  justify-content: center;
  text-align: center;
}

/* Harmonized success notification: matches warning style exactly */
.upload-success-harmonized {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #f0fbf4;
  color: #157a3a;
  border: 1px solid #d9f0e0;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 13px;
  margin-top: 2px;
  margin-bottom: 2px;
  min-height: 32px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(21,122,58,0.04);
}

.success-text {
  color: #157a3a;
}

.success-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
}
.track-link-btn {
  background: #16a34a;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  min-height: 26px;
}

.track-link-btn:hover {
  background: #15803d;
}

.copy-link-btn {
  background: transparent;
  color: #16a34a;
  border: 1px solid rgba(22, 163, 74, 0.4);
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  transition: background 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  min-width: 26px;
}

.copy-link-btn:hover:not(:disabled) {
  background: rgba(22, 163, 74, 0.08);
}

.copy-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: opacity 0.35s cubic-bezier(.4,0,.2,1), transform 0.35s cubic-bezier(.4,0,.2,1);
}

.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-slide-enter-to, .fade-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
