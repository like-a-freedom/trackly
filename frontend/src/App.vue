<template>
  <l-map ref="leafletMap" class="fullscreen-map" :zoom="zoom" :center="center" @ready="onMapReady">
    <l-tile-layer :url="url" :attribution="attribution"></l-tile-layer>
    <l-marker :lat-lng="markerLatLng"></l-marker>
    <l-geo-json
      v-for="(track, idx) in geoJsonTracks"
      :key="track.properties.id || idx"
      :geojson="track"
      :options="{ style: geoJsonStyle, interactive: false, pane: 'overlayPane' }"
      :update-when-zooming="true"
      :update-when-idle="false"
    />
    <div class="upload-form-container">
      <form class="upload-form" @submit.prevent="handleUpload" @dragover.prevent="dragActive = true" @dragleave.prevent="dragActive = false" @drop.prevent="onDrop">
        <label
          for="track-upload"
          class="upload-label drop-area"
          :class="{ 'drag-active': dragActive }"
        >
          <span v-if="!selectedFile">Drag and drop a track file (gpx or kml) or click to select it</span>
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
        <template v-if="selectedFile">
          <input v-model="trackName" class="track-name-input" type="text" placeholder="Track name (optional)" />
          <select v-model="trackCategories" class="track-category-select" multiple>
            <option value="hiking">Hiking</option>
            <option value="running">Running</option>
            <option value="walking">Walking</option>
            <option value="cycling">Cycling</option>
            <option value="skiing">Skiing</option>
            <option value="other">Other</option>
          </select>
        </template>
        <button type="submit" class="upload-btn" :disabled="!selectedFile">Upload</button>
      </form>
    </div>
  </l-map>
</template>

<script setup>
import { LMap, LTileLayer, LMarker, LGeoJson } from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
import { ref, nextTick } from "vue";
import L from "leaflet";

const url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const attribution = '&copy; <a target="_blank" href="http://osm.org/copyright">OpenStreetMap</a> contributors';
const zoom = ref(11);
const center = ref([56.04028, 37.83185]);
const selectedFile = ref(null);
const dragActive = ref(false);
const tracks = ref([]);
const geoJsonTracks = ref([]);
const geoJsonStyle = { color: '#1976d2', weight: 4 };
const trackName = ref("");
const trackCategories = ref([]);
const bounds = ref(null);
const leafletMap = ref(null);
const markerLatLng = ref(center.value);

function onMapMove(e) {
  const map = e.target;
  bounds.value = map.getBounds();
  fetchTracksInBounds();
}

async function fetchTracksInBounds() {
  if (!bounds.value) return;
  const sw = bounds.value.getSouthWest();
  const ne = bounds.value.getNorthEast();
  const url = `/tracks/geojson?bbox=${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch tracks");
    const data = await response.json();
    if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      geoJsonTracks.value = data.features;
    } else {
      geoJsonTracks.value = [];
    }
  } catch (e) {
    console.error('Error fetching tracks:', e);
  }
}

function onMapReady(e) {
  const map = e.target || e;
  bounds.value = map.getBounds();
  fetchTracksInBounds();
  map.on('moveend', onMapMove);
}

function geoJsonLayer(geojson) {
  return L.geoJSON(geojson);
}

function isValidGeoJson(obj) {
  return obj && (obj.type === 'Feature' || obj.type === 'FeatureCollection');
}

function onFileChange(event) {
  const file = event.target.files[0];
  selectedFile.value = file || null;
  if (file) {
    trackName.value = file.name.replace(/\.[^.]+$/, ""); // no extension
  } else {
    trackName.value = "";
  }
}

function onDrop(event) {
  dragActive.value = false;
  const file = event.dataTransfer.files[0];
  if (file) {
    selectedFile.value = file;
  }
}

async function handleUpload() {
  if (!selectedFile.value) return;
  const formData = new FormData();
  formData.append('file', selectedFile.value);
  if (trackName.value) formData.append('name', trackName.value);
  if (trackCategories.value.length > 0) formData.append('categories', trackCategories.value.join(','));
  try {
    const response = await fetch('/tracks/upload', {
      method: 'POST',
      body: formData
    });
    if (!response.ok) throw new Error('Upload failed');
    alert('Track uploaded successfully!');
    selectedFile.value = null;
    trackName.value = "";
    trackCategories.value = [];
  } catch (e) {
    alert('Upload error: ' + e.message);
  }
}
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
}
.fullscreen-map {
  height: 100vh;
  width: 100vw;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 0;
}
.upload-form-container {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.13);
  padding: 12px 16px 10px 16px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 210px;
  max-width: 320px;
}
.upload-form {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
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
  margin-bottom: 6px;
  padding: 6px 8px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 14px;
}
.track-category-select {
  margin-bottom: 6px;
  padding: 6px 8px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 14px;
  background: #fafbfc;
  min-height: 38px;
}
</style>
