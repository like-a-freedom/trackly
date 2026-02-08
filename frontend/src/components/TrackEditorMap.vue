<template>
  <div class="editor-map-wrapper">
    <l-map
      ref="mapRef"
      class="editor-map"
      :zoom="14"
      :center="mapCenter"
      :options="{ zoomControl: true, preferCanvas: true }"
      @ready="onMapReady"
      @click="onMapClick"
    >
      <l-tile-layer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <!-- Rendered track segments as polylines -->
      <l-polyline
        v-for="(seg, segIdx) in segmentsWithColors"
        :key="`seg-${segIdx}`"
        :lat-lngs="seg.points"
        :color="seg.color"
        :weight="segIdx === activeSegmentIndex ? 5 : 3"
        :opacity="segIdx === activeSegmentIndex ? 1 : 0.6"
        :data-testid="`segment-line-${segIdx}`"
        @click="(e) => onSegmentClick(segIdx, e)"
      />

      <!-- Waypoint markers -->
      <template v-for="(seg, segIdx) in segments">
        <l-circle-marker
          v-for="(pt, ptIdx) in getWaypointMarkers(seg, segIdx)"
          :key="`wp-${segIdx}-${ptIdx}`"
          :lat-lng="pt.latLng"
          :radius="pt.radius"
          :color="pt.color"
          :fill-color="pt.fillColor"
          :fill-opacity="0.9"
          :weight="2"
          :draggable="editorMode !== 'view'"
          :data-testid="`waypoint-${segIdx}-${pt.index}`"
          @click="(e) => onWaypointClick(segIdx, pt.index, e)"
          @mousedown="(e) => startDrag(segIdx, pt.index, e)"
          @contextmenu="(e) => onWaypointContextMenu(segIdx, pt.index, e)"
        />
      </template>

      <!-- Start marker (green) -->
      <l-circle-marker
        v-if="startPoint"
        :lat-lng="startPoint"
        :radius="10"
        color="#2E7D32"
        fill-color="#4CAF50"
        :fill-opacity="0.9"
        :weight="3"
        :pane="'markerPane'"
      >
        <l-tooltip :permanent="false">Старт</l-tooltip>
      </l-circle-marker>

      <!-- End marker (red flag) -->
      <l-circle-marker
        v-if="endPoint && totalPoints > 1"
        :lat-lng="endPoint"
        :radius="10"
        color="#C62828"
        fill-color="#EF5350"
        :fill-opacity="0.9"
        :weight="3"
        :pane="'markerPane'"
      >
        <l-tooltip :permanent="false">Финиш</l-tooltip>
      </l-circle-marker>
    </l-map>

    <!-- Context menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      data-testid="context-menu"
    >
      <button
        v-if="contextMenu.canSplit"
        class="context-menu-item"
        data-testid="ctx-split"
        @click="handleSplit"
      >
        ✂️ Разделить сегмент
      </button>
      <button
        v-if="contextMenu.canDelete"
        class="context-menu-item"
        data-testid="ctx-delete"
        @click="handleDeletePoint"
      >
        🗑️ Удалить точку
      </button>
      <button class="context-menu-item" @click="closeContextMenu">
        ✕ Закрыть
      </button>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import {
  LMap,
  LTileLayer,
  LPolyline,
  LCircleMarker,
  LTooltip,
} from "@vue-leaflet/vue-leaflet";

const SEGMENT_COLORS = [
  "#1976D2",
  "#D32F2F",
  "#388E3C",
  "#7B1FA2",
  "#F57C00",
  "#0097A7",
  "#C2185B",
  "#512DA8",
];

const props = defineProps({
  segments: { type: Array, default: () => [] },
  activeSegmentIndex: { type: Number, default: 0 },
  editorMode: { type: String, default: "edit" },
  totalPoints: { type: Number, default: 0 },
});

const emit = defineEmits([
  "addWaypoint",
  "moveWaypoint",
  "deleteWaypoint",
  "insertWaypoint",
  "splitSegment",
  "setActiveSegment",
]);

const mapRef = ref(null);
const mapInstance = ref(null);
const mapCenter = ref([50.45, 30.52]); // Default to Kyiv

// Context menu state
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  segIndex: -1,
  pointIndex: -1,
  canSplit: false,
  canDelete: false,
});

// Drag state
const dragging = ref(false);
const dragSegIdx = ref(-1);
const dragPtIdx = ref(-1);

// Computed
const segmentsWithColors = computed(() =>
  props.segments.map((seg, i) => ({
    points: seg.points,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }))
);

const startPoint = computed(() => {
  for (const seg of props.segments) {
    if (seg.points.length > 0) return seg.points[0];
  }
  return null;
});

const endPoint = computed(() => {
  for (let i = props.segments.length - 1; i >= 0; i--) {
    const seg = props.segments[i];
    if (seg.points.length > 0) return seg.points[seg.points.length - 1];
  }
  return null;
});

/** Generate visual marker data for waypoints in a segment. */
function getWaypointMarkers(seg, segIdx) {
  const waypointSet = new Set(seg.waypoints);
  return seg.points
    .map((pt, idx) => {
      const isWaypoint = waypointSet.has(idx);
      return {
        latLng: pt,
        index: idx,
        radius: isWaypoint ? 7 : 4,
        color: isWaypoint ? "#1976D2" : "#D32F2F",
        fillColor: isWaypoint ? "#42A5F5" : "#EF5350",
      };
    })
    .filter((_, idx) => {
      // For performance: show all waypoints but subsample intermediate points
      // if segment is very large
      if (seg.points.length > 500) {
        const waypointSet2 = new Set(seg.waypoints);
        return (
          waypointSet2.has(idx) ||
          idx % Math.ceil(seg.points.length / 200) === 0
        );
      }
      return true;
    });
}

// ── Event handlers ──────────────────────────────────────
function onMapReady(mapObj) {
  mapInstance.value = mapObj;
}

function onMapClick(e) {
  if (props.editorMode === "view") return;
  closeContextMenu();

  const { lat, lng } = e.latlng;
  emit("addWaypoint", lat, lng);
}

function onSegmentClick(segIdx, e) {
  if (props.editorMode === "view") return;

  // Set this segment as active
  emit("setActiveSegment", segIdx);

  // Find nearest point index for insertion
  const seg = props.segments[segIdx];
  if (!seg || seg.points.length < 2) return;

  const clickLat = e.latlng.lat;
  const clickLng = e.latlng.lng;
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < seg.points.length - 1; i++) {
    const [lat1, lng1] = seg.points[i];
    const [lat2, lng2] = seg.points[i + 1];
    // Simple midpoint distance check
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    const d = Math.hypot(clickLat - midLat, clickLng - midLng);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  emit("insertWaypoint", segIdx, bestIdx, clickLat, clickLng);

  // Stop propagation to prevent map click
  if (e.originalEvent) e.originalEvent.stopPropagation();
}

function onWaypointClick(segIdx, ptIdx, e) {
  // Promote intermediate point to waypoint or select
  if (e.originalEvent) e.originalEvent.stopPropagation();
}

function onWaypointContextMenu(segIdx, ptIdx, e) {
  if (props.editorMode === "view") return;
  if (e.originalEvent) {
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
  }

  const seg = props.segments[segIdx];
  const isFirst = ptIdx === 0;
  const isLast = ptIdx === seg.points.length - 1;

  contextMenu.value = {
    visible: true,
    x: (e.originalEvent ?? e).clientX,
    y: (e.originalEvent ?? e).clientY,
    segIndex: segIdx,
    pointIndex: ptIdx,
    canSplit: !isFirst && !isLast && seg.points.length >= 3,
    canDelete: seg.points.length > 1,
  };
}

function handleSplit() {
  const { segIndex, pointIndex } = contextMenu.value;
  emit("splitSegment", pointIndex);
  closeContextMenu();
}

function handleDeletePoint() {
  const { segIndex, pointIndex } = contextMenu.value;
  emit("deleteWaypoint", segIndex, pointIndex);
  closeContextMenu();
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

// ── Drag handling ───────────────────────────────────────
function startDrag(segIdx, ptIdx, e) {
  if (props.editorMode === "view") return;
  dragging.value = true;
  dragSegIdx.value = segIdx;
  dragPtIdx.value = ptIdx;

  const map = mapInstance.value;
  if (!map) return;

  map.dragging.disable();
  map.on("mousemove", onDragMove);
  map.on("mouseup", onDragEnd);
}

function onDragMove(e) {
  if (!dragging.value) return;
  // Visual feedback could be added here
}

function onDragEnd(e) {
  if (!dragging.value) return;

  const map = mapInstance.value;
  if (map) {
    map.dragging.enable();
    map.off("mousemove", onDragMove);
    map.off("mouseup", onDragEnd);
  }

  emit(
    "moveWaypoint",
    dragSegIdx.value,
    dragPtIdx.value,
    e.latlng.lat,
    e.latlng.lng
  );

  dragging.value = false;
  dragSegIdx.value = -1;
  dragPtIdx.value = -1;
}

// ── Keyboard shortcuts ──────────────────────────────────
function onKeyDown(e) {
  // Close context menu on Escape
  if (e.key === "Escape") {
    closeContextMenu();
  }
}

// ── Fit bounds to track ─────────────────────────────────
function fitBounds() {
  const map = mapInstance.value;
  if (!map) return;

  const allPoints = props.segments.flatMap((s) => s.points);
  if (allPoints.length === 0) return;

  const bounds = allPoints.reduce(
    (b, [lat, lng]) => {
      b[0][0] = Math.min(b[0][0], lat);
      b[0][1] = Math.min(b[0][1], lng);
      b[1][0] = Math.max(b[1][0], lat);
      b[1][1] = Math.max(b[1][1], lng);
      return b;
    },
    [
      [90, 180],
      [-90, -180],
    ]
  );

  if (bounds[0][0] <= bounds[1][0]) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

// Watch segments to auto-fit on first point addition
watch(
  () => props.totalPoints,
  (newVal, oldVal) => {
    if (oldVal === 0 && newVal === 1) {
      const seg = props.segments[0];
      if (seg?.points[0]) {
        mapCenter.value = seg.points[0];
      }
    }
  }
);

onMounted(() => {
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", closeContextMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("click", closeContextMenu);
});

// Expose for parent
defineExpose({ fitBounds });
</script>

<style scoped>
.editor-map-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.editor-map {
  flex: 1;
  min-height: 400px;
  z-index: 1;
}

.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  min-width: 180px;
  padding: 4px 0;
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: #333;
}

.context-menu-item:hover {
  background: #f0f0f0;
}
</style>
