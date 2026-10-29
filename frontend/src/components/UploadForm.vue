<template>
  <div>
    <form
      class="upload-form"
      @submit.prevent="handleUpload"
      @dragover.prevent="setDragActive(true)"
      @dragleave.prevent="setDragActive(false)"
      @drop.prevent="onDrop"
      @mousedown.stop
      @mouseup.stop
      @click.stop
      @dblclick.stop
      @selectstart.stop
    >
      <label
        for="track-upload"
        class="upload-label drop-area"
        :class="{ 'drag-active': dragActive }"
      >
        <span v-if="!selectedFile">Choose a GPX or KML file, or drop it here</span>
        <span v-else>File: {{ selectedFile.name }}</span>
        <input
          id="track-upload"
          type="file"
          accept=".gpx,.kml"
          class="upload-input"
          aria-label="Choose GPX or KML track"
          :disabled="uploading"
          @change="onFileChange"
        >
      </label>
      <template v-if="selectedFile && !trackExists">
        <label for="track-name-input">Track name</label>
        <input
          id="track-name-input"
          v-model="trackName"
          class="track-name-input ui-field"
          type="text"
          :disabled="uploading"
          placeholder="Track name"
          autocomplete="off"
          @mousedown.stop
          @mouseup.stop
          @click.stop
          @dblclick.stop
          @selectstart.stop
          @dragstart.prevent
        >
        <details class="upload-categories">
          <summary>
            <span>{{ categoryValues.length ? `Categories (${categoryValues.length})` : 'Select or create categories' }}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <div class="upload-categories-content">
            <TrackCategoryPicker v-model="categoryValues" :disabled="uploading" class="track-category-select" />
          </div>
        </details>
      </template>
      <transition name="fade-slide">
        <div
          v-if="trackExists"
          class="upload-warning upload-warning-centered"
        >
          <span>Track already exists</span>
          <button
            v-if="existingTrackId"
            type="button" class="track-link-btn"
            title="View existing track"
            aria-label="View existing track"
            @click="navigateToExistingTrack"
          >
            Show track
          </button>
        </div>
      </transition>
      <transition name="fade-slide">
        <div
          v-if="!trackExists && warning"
          :class="['upload-warning', { 'upload-warning-centered': warning && warning.includes('exists') }]"
        >
          {{ warning }}
        </div>
      </transition>

      <transition name="fade-slide">
        <div
          v-if="uploadSuccess"
          class="upload-success upload-success-harmonized"
        >
          <span class="success-text">Track uploaded successfully!</span>
          <div
            v-if="uploadedTrackData"
            class="success-actions"
          >
            <button
              type="button" class="track-link-btn"
              title="View uploaded track"
              aria-label="View track"
              @click="navigateToTrack"
            >
              Show track
            </button>
            <button
              type="button" class="copy-link-btn"
              :disabled="copyingLink"
              :title="copyingLink ? 'Copying...' : linkCopied ? 'Link copied!' : 'Copy track link'"
              aria-label="Copy track link"
              @click="copyTrackUrl"
            >
              <svg
                v-if="!copyingLink && !linkCopied"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.53 1.53" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.53-1.53" />
              </svg>
              <svg
                v-else-if="linkCopied"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="20,6 9,17 4,12" />
              </svg>
              <svg
                v-else
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                />
                <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
              </svg>
            </button>
          </div>
        </div>
      </transition>
      <button
        v-if="selectedFile"
        type="submit"
        class="upload-btn ui-primary"
        :disabled="uploading || !selectedFile || !trackName.trim() || trackExists || checkingExists"
      >
        {{ uploading ? 'Uploading…' : 'Upload track' }}
      </button>
      <p v-if="uploading" role="status">Uploading your file. Keep this window open.</p>
    </form>
  </div>
</template>
<script setup>
import { TRACK_CATEGORIES, validateCategories } from "../domain/trackCategories";
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import TrackCategoryPicker from './TrackCategoryPicker.vue';
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
const uploading = ref(false);
const uploadedTrackData = ref(null); // Store uploaded track data (id, url)
const copyingLink = ref(false);
const linkCopied = ref(false);
const categoriesList = TRACK_CATEGORIES;
const categoryValues = computed({get: () => trackCategories.value.map(option => option.value), set: values => { trackCategories.value = values.map(value => ({value, label: categoriesList.find(option => option.value === value)?.label ?? value})); }});
watch(() => props.dragActive, v => dragActive.value = v);
watch(selectedFile, async (file) => {
  warning.value = "";
  trackExists.value = false;
  existingTrackId.value = null;
  // Do not reset uploadSuccess here, so the message stays visible after upload
  if (file) {
    checkingExists.value = true;
    try {
    const { alreadyExists, id, warning: warnMsg } = await checkTrackDuplicate({
      file
    });
    if (selectedFile.value !== file) return;
    trackExists.value = alreadyExists;
    existingTrackId.value = id || null;
    warning.value = warnMsg || "";
    } catch {
      if (selectedFile.value === file) warning.value = 'Could not check for duplicates. Please retry.';
    } finally {
      if (selectedFile.value === file) checkingExists.value = false;
    }
  } else checkingExists.value = false;
});
function setDragActive(val) {
  dragActive.value = val;
  emit('update:dragActive', val);
}
function onFileChange(event) {
  if (uploading.value) return;
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
  if (uploading.value) return;
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
  if (uploading.value || !selectedFile.value || trackExists.value || checkingExists.value) return;
  const categoryError = validateCategories(categoryValues.value);
  if (categoryError) { warning.value = categoryError; return; }
  uploading.value = true;
  try {
    const response = await uploadTrack({
      file: selectedFile.value,
      name: trackName.value.normalize('NFC'),
      categories: trackCategories.value.length
        ? trackCategories.value.map(obj => obj.value)
        : []
    });
    if (response.alreadyExists) {
      trackExists.value = true;
      existingTrackId.value = response.id;
      return;
    }

    // Store the upload response data
    uploadedTrackData.value = response;

    selectedFile.value = null;
    trackName.value = "";
    trackCategories.value = [];
    uploadSuccess.value = true;
    emit('uploaded');
  } catch (e) {
    if (e && e.message && e.message.includes('10 seconds')) {
      warning.value = 'Please, wait 10 seconds between uploads.';
    } else {
      warning.value = (e && e.message) || 'Error uploading track';
    }
  } finally {
    uploading.value = false;
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
  font-size: var(--text-xs);
  margin-block-end: 4px;
  color: var(--color-muted);
  cursor: pointer;
  font-weight: var(--weight-medium);
  padding: 0 2px;
  line-height: var(--leading-snug);
}
.upload-input {
  /* 16px minimum: anything smaller makes iOS Safari zoom the viewport on
     focus, which breaks the bottom-anchored form out of the screen. */
  font-size: 1rem;
  padding: 6px 8px;
  border: 1px solid oklch(85.8% 0 none);
  border-radius: 4px;
  background: oklch(98.8% 0.0017 none);
  margin-block-end: 1px;
}
.upload-btn { margin-block-start: 4px; }


.drop-area {
  border: 2px dashed var(--accent);
  border-radius: 6px;
  padding: 12px 4px;
  text-align: center;
  background: oklch(98.4% 0.0074 260.7);
  transition:
    border-color 0.2s var(--ease-out, ease-out),
    background-color 0.2s var(--ease-out, ease-out);
  cursor: pointer;
  margin-block-end: 6px;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  color: var(--color-ink);
  font-weight: var(--weight-normal);
}
.drop-area.drag-active {
  border-color: var(--accent);
  background: oklch(95.3% 0.0218 239.4);
}
.upload-label input[type="file"] {
  position: absolute; width:1px; height:1px; opacity:0;
}
.upload-label:focus-within { outline:3px solid var(--color-action); outline-offset:3px; }
.track-name-input { margin-block: 6px; }

.upload-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  background: oklch(97.6% 0.0118 17.4);
  color: var(--color-danger);
  border: 1px solid oklch(84.5% 0.0636 18.5);
  border-radius: 5px;
  padding: 8px 12px;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  margin-block-end: 2px;
  margin-block-start: 2px;
  min-height: 32px;
  font-weight: var(--weight-medium);
  text-wrap: pretty;
  box-shadow: 0 1px 2px color-mix(in oklch, var(--color-danger) 4%, transparent);
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
  background: oklch(97.8% 0.0148 158.3);
  color: var(--color-success);
  border: 1px solid oklch(93.4% 0.0323 155.4);
  border-radius: 5px;
  padding: 8px 12px;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  margin-block-start: 2px;
  margin-block-end: 2px;
  min-height: 32px;
  font-weight: var(--weight-medium);
  text-wrap: pretty;
  box-shadow: 0 1px 2px color-mix(in oklch, var(--color-success) 4%, transparent);
}

.success-text {
  color: var(--color-success);
}

.success-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: 4px;
}
.track-link-btn {
  background: oklch(62.7% 0.1699 149.2);
  color: var(--color-surface);
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  min-height: 26px;
}

.track-link-btn:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .track-link-btn:hover {
    background: oklch(52.7% 0.1371 150.1);
  }
}

.copy-link-btn {
  background: transparent;
  color: var(--color-success);
  border: 1px solid color-mix(in oklch, var(--color-success) 40%, transparent);
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  min-width: 26px;
}

.copy-link-btn:active:not(:disabled) {
  transform: scale(0.95);
}

@media (hover: hover) and (pointer: fine) {
  .copy-link-btn:hover:not(:disabled) {
    background: color-mix(in oklch, var(--color-success) 8%, transparent);
  }
}

.copy-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-slide-enter-to, .fade-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* Motion is opt-in: the slide-fade transition and button press motion only
   run when the visitor has not asked for reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .fade-slide-enter-active,
  .fade-slide-leave-active {
    transition:
      opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .track-link-btn {
    transition:
      background-color 0.15s var(--ease-out, ease-out),
      transform 0.15s var(--ease-out, ease-out);
  }

  .copy-link-btn {
    transition:
      background-color 0.15s var(--ease-out, ease-out),
      transform 0.15s var(--ease-out, ease-out);
  }
}
</style>

<style scoped>
/* Border-box is explicit here: ui-field includes padding and a border. */
.upload-form,
.upload-form :deep(*) { box-sizing: border-box; }
.upload-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-inline-size: 0;
  inline-size: 100%;
  margin: 0;
  padding: 0;
}
.upload-form > * { min-inline-size: 0; max-inline-size: 100%; }
.upload-form .drop-area {
  min-block-size: 80px;
  margin: 0;
  padding: 16px;
  overflow-wrap: anywhere;
  border-color: var(--color-action);
  background: var(--color-soft);
}
.upload-form .track-name-input {
  inline-size: 100%;
  margin: 0;
  min-block-size: 44px;
  padding: 10px 12px;
}
.upload-form > label:not(.drop-area) { margin-block-end: -6px; font-size: var(--text-sm); }
.upload-categories { border: 1px solid var(--color-line); border-radius: var(--radius-control); }
.upload-categories summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-block-size: 44px;
  padding: 10px 12px;
  list-style: none;
  cursor: pointer;
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.upload-categories summary::-webkit-details-marker { display: none; }
.upload-categories summary svg { inline-size: 20px; block-size: 20px; flex-shrink: 0; }
.upload-categories[open] summary svg { rotate: 180deg; }
.upload-categories summary:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
.upload-categories summary:active { background: var(--color-soft); }
@media (hover: hover) and (pointer: fine) {
  .upload-categories summary:hover { background: var(--color-canvas); }
}
.upload-categories-content { padding: 0 12px 12px; }
.upload-categories-content :deep(legend) { display: none; }
.upload-form .upload-btn { inline-size: 100%; margin: 0; min-block-size: 44px; }
</style>
