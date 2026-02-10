<template>
  <div class="editor-map-wrapper">
    <l-map
      ref="mapRef"
      class="editor-map"
      :zoom="14"
      :center="mapCenter"
      :options="mapOptions"
      @ready="onMapReady"
      @click="onMapClick"
      @mousedown="onMapMouseDown"
      @touchstart="onMapTouchStart"
    >
      <l-tile-layer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <!-- Snap-to-road preview -->
      <l-polyline
        v-if="snapPreview && snapPreview.snappedLatLng"
        :lat-lngs="[snapPreview.cursorLatLng, snapPreview.snappedLatLng]"
        color="#1976D2"
        :weight="2"
        :opacity="0.6"
        :dash-array="'2,6'"
        :data-testid="'snap-preview-line'"
      />
      <l-circle-marker
        v-if="snapPreview && snapPreview.snappedLatLng"
        :lat-lng="snapPreview.snappedLatLng"
        :radius="5"
        color="#1976D2"
        fill-color="#90CAF9"
        :fill-opacity="0.9"
        :weight="2"
        :data-testid="'snap-preview-marker'"
      >
        <l-tooltip :permanent="false">Snap</l-tooltip>
      </l-circle-marker>

      <!-- Highlighted segment (hover linkage) -->
      <l-polyline
        v-if="
          props.highlightedSegmentIndex !== null &&
          segmentsWithColors[props.highlightedSegmentIndex]
        "
        :key="'highlight-seg'"
        :lat-lngs="segmentsWithColors[props.highlightedSegmentIndex].points"
        color="#FFD600"
        :weight="14"
        :opacity="0.45"
        :interactive="false"
        :data-testid="`segment-highlight`"
      />

      <!-- Rendered track segments as polylines -->
      <l-polyline
        v-for="(gap, gapIdx) in gapLines"
        :key="`gap-${gapIdx}`"
        :lat-lngs="gap"
        color="#9E9E9E"
        :weight="2"
        :opacity="0.7"
        :dash-array="'4,8'"
        :interactive="false"
        :data-testid="`segment-gap-${gapIdx}`"
      />
      <l-polyline
        v-for="surface in surfacePolylines"
        :key="surface.id"
        :lat-lngs="surface.points"
        :color="surface.color"
        :weight="surface.weight"
        :opacity="surface.opacity"
        :dash-array="surface.dashArray"
        :interactive="false"
        :data-testid="`surface-line-${surface.segIndex}`"
      />
      <l-polyline
        v-for="(seg, segIdx) in segmentsWithColors"
        :key="`seg-${segIdx}`"
        :lat-lngs="seg.points"
        :color="seg.color"
        :weight="segIdx === activeSegmentIndex ? 5 : 3"
        :opacity="
          seg.hasSurface ? 0.05 : segIdx === activeSegmentIndex ? 1 : 0.6
        "
        :smooth-factor="seg.smoothFactor"
        :dash-array="props.routingMode === 'manual' ? '6,6' : null"
        :data-testid="`segment-line-${segIdx}`"
        @click="(e) => onSegmentClick(segIdx, e)"
        @contextmenu="(e) => onSegmentContextMenu(segIdx, e)"
        @mouseover="() => emit('hoverSegment', segIdx)"
        @mouseout="() => emit('leaveSegment')"
      >
        <l-tooltip
          v-if="segmentTooltips[segIdx]"
          :permanent="false"
          :sticky="true"
        >
          {{ segmentTooltips[segIdx].title }}
          <div>{{ segmentTooltips[segIdx].distance }}</div>
          <div v-if="segmentTooltips[segIdx].area">
            {{ segmentTooltips[segIdx].area }}
          </div>
          <div v-if="segmentTooltips[segIdx].time">
            {{ segmentTooltips[segIdx].time }}
          </div>
        </l-tooltip>
      </l-polyline>

      <!-- Optimizer preview line -->
      <l-polyline
        v-for="(seg, segIdx) in optimizerPreviewSegments"
        :key="`optimizer-preview-${segIdx}`"
        :lat-lngs="seg"
        color="#1E88E5"
        :weight="4"
        :opacity="0.9"
        :dash-array="'6,6'"
        :data-testid="`optimizer-preview-${segIdx}`"
      />

      <!-- Fragment selection preview -->
      <l-polyline
        v-if="fragmentPreview && fragmentPreview.points.length > 1"
        :lat-lngs="fragmentPreview.points"
        color="#7B1FA2"
        :weight="4"
        :opacity="0.9"
        :dash-array="fragmentPreview.complete ? '6,6' : '2,6'"
        :data-testid="`fragment-preview`"
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
          @touchstart="(e) => startDrag(segIdx, pt.index, e)"
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
        <l-tooltip :permanent="false">Start</l-tooltip>
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
        <l-tooltip :permanent="false">Finish</l-tooltip>
      </l-circle-marker>

      <!-- POI markers -->
      <l-circle-marker
        v-for="(poi, poiIdx) in pois"
        :key="`poi-${poiIdx}`"
        :lat-lng="[poi.lat, poi.lng]"
        :radius="8"
        :color="poi.isFarFromTrack ? '#D32F2F' : '#FF6F00'"
        :fill-color="poi.isFarFromTrack ? '#EF9A9A' : '#FFB300'"
        :fill-opacity="0.9"
        :weight="2"
        :data-testid="`poi-marker-${poiIdx}`"
        @click="(e) => onPoiClick(poiIdx, e)"
        @contextmenu="(e) => onPoiContextMenu(poiIdx, e)"
      >
        <l-tooltip :permanent="false">
          {{ poi.name || `POI ${poiIdx + 1}` }}
          <span v-if="poi.isFarFromTrack"> · ⚠️ &gt;1 km from track</span>
        </l-tooltip>
      </l-circle-marker>

      <!-- Elevation chart hover marker -->
      <l-circle-marker
        v-if="hoverMarker"
        :lat-lng="hoverMarker.latlng"
        :radius="8"
        color="#1E88E5"
        fill-color="#90CAF9"
        :fill-opacity="0.9"
        :weight="2"
        :pane="'markerPane'"
        :data-testid="`elevation-hover-marker`"
      />

      <!-- Keyboard focus marker -->
      <l-circle-marker
        v-if="focusMarker"
        :lat-lng="focusMarker.latlng"
        :radius="7"
        color="#FF8F00"
        fill-color="#FFE082"
        :fill-opacity="0.9"
        :weight="2"
        :pane="'markerPane'"
        :data-testid="`keyboard-focus-marker`"
      />

      <!-- Distance markers (measure ticks) -->
      <l-circle-marker
        v-for="(marker, mIdx) in distanceMarkers"
        :key="`dist-marker-${mIdx}`"
        :lat-lng="marker.latLng"
        :radius="5"
        color="#37474F"
        fill-color="#ECEFF1"
        :fill-opacity="0.95"
        :weight="2"
        :pane="'markerPane'"
        :data-testid="`distance-marker-${mIdx}`"
      >
        <l-tooltip
          :permanent="true"
          :direction="'right'"
          :offset="[8, 0]"
          class="distance-marker-tooltip"
        >
          {{ marker.label }}
        </l-tooltip>
      </l-circle-marker>

      <!-- Join visual cursor: dashed line from origin to mouse -->
      <l-polyline
        v-if="joinCursorOrigin && joinCursorTarget"
        :lat-lngs="[joinCursorOrigin.latlng, joinCursorTarget]"
        :color="joinHoverSegIdx !== null ? '#4CAF50' : '#9E9E9E'"
        :weight="3"
        :opacity="0.8"
        :dash-array="'7,7'"
        :interactive="false"
        :data-testid="'join-cursor-line'"
      />
      <!-- Join cursor: highlight target segment -->
      <l-polyline
        v-if="
          joinCursorOrigin &&
          joinHoverSegIdx !== null &&
          segmentsWithColors[joinHoverSegIdx]
        "
        :lat-lngs="segmentsWithColors[joinHoverSegIdx].points"
        color="#4CAF50"
        :weight="8"
        :opacity="0.5"
        :interactive="false"
        :data-testid="'join-target-highlight'"
      />

      <!-- Shortcut visual cursor: line from origin to target -->
      <l-polyline
        v-if="shortcutOrigin && shortcutTargetIdx !== null"
        :lat-lngs="shortcutCursorLine"
        :color="shortcutCursorValid ? '#4CAF50' : '#D32F2F'"
        :weight="3"
        :opacity="0.8"
        :dash-array="'7,7'"
        :interactive="false"
        :data-testid="'shortcut-cursor-line'"
      />
      <!-- Shortcut: highlight points that will be deleted -->
      <l-circle-marker
        v-for="(pt, dIdx) in shortcutDeletePoints"
        :key="`shortcut-del-${dIdx}`"
        :lat-lng="pt"
        :radius="6"
        color="#D32F2F"
        fill-color="#EF9A9A"
        :fill-opacity="0.9"
        :weight="2"
        :interactive="false"
        :pane="'markerPane'"
        :data-testid="`shortcut-delete-${dIdx}`"
      />
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
        ✂️ Split segment
      </button>
      <button
        v-if="contextMenu.canCut"
        class="context-menu-item"
        data-testid="ctx-cut"
        @click="handleCut"
      >
        ✂️ Cut here
      </button>
      <button
        v-if="contextMenu.canNewTrack"
        class="context-menu-item"
        data-testid="ctx-new-track-segment"
        @click="handleNewTrackFromSegment"
      >
        🧭 New track from segment
      </button>
      <button
        v-if="contextMenu.canDelete"
        class="context-menu-item"
        data-testid="ctx-delete"
        @click="handleDeletePoint"
      >
        🗑️ Delete point
      </button>
      <button
        v-if="contextMenu.canPromote"
        class="context-menu-item"
        data-testid="ctx-promote"
        @click="handlePromote"
      >
        📌 Promote to waypoint
      </button>
      <button
        v-if="contextMenu.canDeletePoi"
        class="context-menu-item"
        data-testid="ctx-delete-poi"
        @click="handleDeletePoi"
      >
        🗑️ Delete POI
      </button>
      <button
        v-if="contextMenu.canReverse"
        class="context-menu-item"
        data-testid="ctx-reverse"
        @click="handleReverse"
      >
        ↔️ Reverse segment
      </button>
      <button
        v-if="contextMenu.canJoin"
        class="context-menu-item"
        data-testid="ctx-join"
        @click="handleStartJoin"
      >
        🔗 Join
      </button>
      <button
        v-if="contextMenu.canShortcut"
        class="context-menu-item"
        data-testid="ctx-shortcut"
        @click="handleStartShortcut"
      >
        ⚡ Shortcut
      </button>
      <button class="context-menu-item" @click="closeContextMenu">
        ✕ Close
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
import { getLatLngFromTouch } from "../utils/touch.js";
import { OPTIMIZED_MAP_OPTIONS } from "../utils/mapPerformance.js";
import { downsamplePoints } from "../utils/trackGeometry.js";

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
  pois: { type: Array, default: () => [] },
  poiMode: { type: Boolean, default: false },
  routingMode: { type: String, default: "manual" },
  fragmentSelection: { type: Object, default: () => ({}) },
  optimizerPreviewSegments: { type: Array, default: () => [] },
  hoverMarker: { type: Object, default: null },
  focusMarker: { type: Object, default: null },
  highlightedSegmentIndex: { type: Number, default: null },
  showDistanceMarkers: { type: Boolean, default: false },
  estimatedTimeMinutes: { type: Number, default: null },
  snapToRoadMode: { type: String, default: "auto" },
  snapToPoint: { type: Function, default: null },
});

const emit = defineEmits([
  "addWaypoint",
  "moveWaypoint",
  "deleteWaypoint",
  "insertWaypoint",
  "splitSegment",
  "setActiveSegment",
  "promoteToWaypoint",
  "addPoi",
  "deletePoi",
  "selectFragmentPoint",
  "cutSegment",
  "newTrackFromSegment",
  "focusWaypoint",
  "hoverSegment",
  "leaveSegment",
  "reverseSegment",
  "joinSegmentsVisual",
  "shortcutBetweenPoints",
]);

const mapRef = ref(null);
const mapInstance = ref(null);
const mapCenter = ref([50.45, 30.52]); // Default to Kyiv
const mapZoom = ref(14);
const mapOptions = {
  ...OPTIMIZED_MAP_OPTIONS,
  zoomControl: true,
};

const snapPreview = ref(null);
let snapFrame = null;
let pendingSnapLatLng = null;

const LARGE_TRACK_THRESHOLD = 10000;
const MAX_RENDER_POINTS = 2000;
const SNAP_PREVIEW_DISTANCE_M = 50;
const SNAP_AUTO_MIN_ZOOM = 13;
const TRACE_MIN_DISTANCE_M = 30;
const GAP_MIN_DISTANCE_M = 5;
const TRACE_MIN_INTERVAL_MS = 120;
const SURFACE_DASH_MAP = {
  asphalt: null,
  gravel: "6,6",
  ground: "2,6",
  path: "8,4,2,4",
  unknown: "4,8",
};

// Context menu state
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  segIndex: -1,
  pointIndex: -1,
  poiIndex: -1,
  afterIndex: -1,
  latlng: null,
  canSplit: false,
  canCut: false,
  canNewTrack: false,
  canDelete: false,
  canPromote: false,
  canDeletePoi: false,
  canReverse: false,
  canJoin: false,
  canShortcut: false,
});

// Join visual cursor state
const joinCursorOrigin = ref(null); // { segIdx, latlng }
const joinCursorTarget = ref(null); // [lat, lng] mouse position
const joinHoverSegIdx = ref(null); // target segment index

// Shortcut visual cursor state
const shortcutOrigin = ref(null); // { segIdx, pointIdx }
const shortcutTargetIdx = ref(null); // target point index

// Drag state
const dragging = ref(false);
const dragSegIdx = ref(-1);
const dragPtIdx = ref(-1);
const lastDragLatLng = ref(null);
const traceActive = ref(false);
const lastTraceLatLng = ref(null);
let lastTraceTime = 0;

// Computed
function downsampleWithIndices(points, maxPoints) {
  if (!Array.isArray(points) || maxPoints <= 0)
    return { points: [], indices: [] };
  if (points.length <= maxPoints) {
    return {
      points,
      indices: points.map((_, idx) => idx),
    };
  }

  const ratio = (points.length - 1) / (maxPoints - 1);
  const sampled = [];
  const indices = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * ratio);
    sampled.push(points[idx]);
    indices.push(idx);
  }
  return { points: sampled, indices };
}

const segmentsWithColors = computed(() => {
  const shouldDownsample = props.totalPoints >= LARGE_TRACK_THRESHOLD;
  return props.segments.map((seg, i) => {
    const maxPoints = Math.min(MAX_RENDER_POINTS, seg.points.length);
    const { points, indices } = shouldDownsample
      ? downsampleWithIndices(seg.points, maxPoints)
      : { points: seg.points, indices: seg.points.map((_, idx) => idx) };
    const baseColor = seg.color || SEGMENT_COLORS[i % SEGMENT_COLORS.length];
    const hasSurface =
      Array.isArray(seg.surfaceTypes) &&
      seg.surfaceTypes.length === seg.points.length &&
      seg.surfaceTypes.some((type) => type && type !== "unknown");
    return {
      points,
      indices,
      hasSurface,
      color:
        props.routingMode === "manual"
          ? "#9E9E9E"
          : props.optimizerPreviewSegments.length > 0
          ? "#D32F2F"
          : baseColor,
      smoothFactor: shouldDownsample ? 2 : 1,
    };
  });
});

/** Points of the shortcut cursor line (origin → target) */
const shortcutCursorLine = computed(() => {
  if (!shortcutOrigin.value || shortcutTargetIdx.value === null) return [];
  const seg = props.segments[shortcutOrigin.value.segIdx];
  if (!seg?.points) return [];
  const originPt = seg.points[shortcutOrigin.value.pointIdx];
  const targetPt = seg.points[shortcutTargetIdx.value];
  if (!originPt || !targetPt) return [];
  return [originPt, targetPt];
});

/** Whether the shortcut operation is valid (at least 2 points apart) */
const shortcutCursorValid = computed(() => {
  if (!shortcutOrigin.value || shortcutTargetIdx.value === null) return false;
  const lo = Math.min(shortcutOrigin.value.pointIdx, shortcutTargetIdx.value);
  const hi = Math.max(shortcutOrigin.value.pointIdx, shortcutTargetIdx.value);
  return hi - lo >= 2;
});

/** Points that will be deleted by the shortcut operation */
const shortcutDeletePoints = computed(() => {
  if (!shortcutOrigin.value || shortcutTargetIdx.value === null) return [];
  const seg = props.segments[shortcutOrigin.value.segIdx];
  if (!seg?.points) return [];
  const lo = Math.min(shortcutOrigin.value.pointIdx, shortcutTargetIdx.value);
  const hi = Math.max(shortcutOrigin.value.pointIdx, shortcutTargetIdx.value);
  if (hi - lo < 2) return [];
  return seg.points.slice(lo + 1, hi);
});

const gapLines = computed(() => {
  const gaps = [];
  for (let i = 0; i < props.segments.length - 1; i++) {
    const current = props.segments[i];
    const next = props.segments[i + 1];
    const currentLast = current?.points?.[current.points.length - 1];
    const nextFirst = next?.points?.[0];
    if (!currentLast || !nextFirst) continue;
    const dist = distanceMeters(
      { lat: currentLast[0], lng: currentLast[1] },
      { lat: nextFirst[0], lng: nextFirst[1] }
    );
    if (dist <= GAP_MIN_DISTANCE_M) continue;
    gaps.push([currentLast, nextFirst]);
  }
  return gaps;
});

const segmentTooltips = computed(() => {
  // Compute total track distance for time proportioning
  let totalDistM = 0;
  const segDists = props.segments.map((seg) => {
    const d = segmentDistanceMeters(seg?.points || []);
    totalDistM += d;
    return d;
  });

  return props.segments.map((seg, index) => {
    if (!seg?.points?.length) return null;
    const name = seg.name?.trim();
    const title = name
      ? `${name} · Segment ${index + 1}`
      : `Segment ${index + 1}`;
    const dist = segDists[index];
    const distanceText =
      dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(2)} km`;
    const area = segmentAreaMeters2(seg.points);
    const areaText =
      area > 0
        ? area < 1_000_000
          ? `${Math.round(area)} m²`
          : `${(area / 1_000_000).toFixed(2)} km²`
        : null;
    // Estimated time for this segment (proportional to distance)
    let timeText = null;
    if (props.estimatedTimeMinutes > 0 && totalDistM > 0 && dist > 0) {
      const segMinutes = (dist / totalDistM) * props.estimatedTimeMinutes;
      if (segMinutes >= 60) {
        const h = Math.floor(segMinutes / 60);
        const m = Math.round(segMinutes % 60);
        timeText = `Time: ~${h}h ${m}min`;
      } else {
        timeText = `Time: ~${Math.round(segMinutes)} min`;
      }
    }
    return {
      title,
      distance: `Distance: ${distanceText}`,
      area: areaText ? `Area: ${areaText}` : null,
      time: timeText,
    };
  });
});

/** Distance markers at regular km intervals across all segments */
const distanceMarkers = computed(() => {
  if (!props.showDistanceMarkers) return [];
  const markers = [];
  let cumulativeDistance = 0;
  // Choose interval based on total track length
  let totalDist = 0;
  for (const seg of props.segments) {
    totalDist += segmentDistanceMeters(seg.points);
  }
  const intervalM = totalDist > 50000 ? 10000 : totalDist > 10000 ? 5000 : 1000;
  let nextMarkerDist = intervalM;

  for (const seg of props.segments) {
    if (!seg?.points?.length || seg.points.length < 2) continue;
    for (let i = 1; i < seg.points.length; i++) {
      const prev = seg.points[i - 1];
      const curr = seg.points[i];
      const segDist = distanceMeters(
        { lat: prev[0], lng: prev[1] },
        { lat: curr[0], lng: curr[1] }
      );
      const prevCumulative = cumulativeDistance;
      cumulativeDistance += segDist;

      while (cumulativeDistance >= nextMarkerDist) {
        // Interpolate position
        const fraction =
          segDist > 0 ? (nextMarkerDist - prevCumulative) / segDist : 0;
        const lat = prev[0] + (curr[0] - prev[0]) * fraction;
        const lng = prev[1] + (curr[1] - prev[1]) * fraction;
        const km = nextMarkerDist / 1000;
        markers.push({
          latLng: [lat, lng],
          label: km >= 1 ? `${km} km` : `${Math.round(nextMarkerDist)} m`,
          km,
        });
        nextMarkerDist += intervalM;
      }
    }
  }
  return markers;
});

const surfacePolylines = computed(() => {
  const lines = [];

  segmentsWithColors.value.forEach((segRender, segIdx) => {
    const seg = props.segments[segIdx];
    if (!seg || !segRender.hasSurface) return;
    if (!segRender.points || segRender.points.length < 2) return;

    const surfaceTypes = segRender.indices.map(
      (idx) => seg.surfaceTypes?.[idx] || "unknown"
    );

    let currentType = surfaceTypes[0] || "unknown";
    let currentPoints = [segRender.points[0]];

    for (let i = 1; i < segRender.points.length; i++) {
      const nextType = surfaceTypes[i] || "unknown";
      if (nextType !== currentType) {
        if (currentPoints.length >= 2) {
          lines.push({
            id: `surface-${segIdx}-${lines.length}`,
            segIndex: segIdx,
            surface: currentType,
            points: currentPoints,
          });
        }
        currentType = nextType;
        currentPoints = [segRender.points[i - 1], segRender.points[i]];
      } else {
        currentPoints.push(segRender.points[i]);
      }
    }

    if (currentPoints.length >= 2) {
      lines.push({
        id: `surface-${segIdx}-${lines.length}`,
        segIndex: segIdx,
        surface: currentType,
        points: currentPoints,
      });
    }
  });

  return lines.map((line) => {
    const isActive = line.segIndex === props.activeSegmentIndex;
    const isUnknown = line.surface === "unknown";
    return {
      ...line,
      color: isUnknown
        ? "#9E9E9E"
        : props.segments[line.segIndex]?.color ||
          SEGMENT_COLORS[line.segIndex % SEGMENT_COLORS.length],
      dashArray: SURFACE_DASH_MAP[line.surface] || SURFACE_DASH_MAP.unknown,
      weight: isActive ? 5 : 3,
      opacity: isActive ? 1 : 0.8,
    };
  });
});

const fragmentPreview = computed(() => {
  const selection = props.fragmentSelection || {};
  const segIndex = selection.segIndex;
  const startIdx = selection.startIdx;
  const endIdx = selection.endIdx;
  if (
    segIndex === null ||
    segIndex === undefined ||
    startIdx === null ||
    startIdx === undefined
  ) {
    return null;
  }
  const seg = props.segments[segIndex];
  if (!seg) return null;
  if (endIdx === null || endIdx === undefined) {
    return { points: [seg.points[startIdx]], complete: false };
  }
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  return {
    points: seg.points.slice(lo, hi + 1),
    complete: true,
  };
});

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

const snapEnabled = computed(() => {
  if (props.snapToRoadMode === "on") return true;
  if (props.snapToRoadMode === "off") return false;
  return mapZoom.value >= SNAP_AUTO_MIN_ZOOM;
});

function clearSnapPreview() {
  snapPreview.value = null;
}

function resolveSnapPoint(lat, lng, maxDistanceM = SNAP_PREVIEW_DISTANCE_M) {
  if (!snapEnabled.value || typeof props.snapToPoint !== "function")
    return null;
  return props.snapToPoint(lat, lng, { maxDistanceM });
}

function updateSnapPreview(latlng) {
  if (!latlng) return;
  if (!snapEnabled.value) {
    clearSnapPreview();
    return;
  }
  const snapped = resolveSnapPoint(
    latlng.lat,
    latlng.lng,
    SNAP_PREVIEW_DISTANCE_M
  );
  if (!snapped) {
    clearSnapPreview();
    return;
  }
  snapPreview.value = {
    cursorLatLng: [latlng.lat, latlng.lng],
    snappedLatLng: [snapped.lat, snapped.lng],
    distance: snapped.dist,
  };
}

function handleSnapMove(latlng) {
  pendingSnapLatLng = latlng;
  if (snapFrame) return;
  snapFrame = requestAnimationFrame(() => {
    snapFrame = null;
    updateSnapPreview(pendingSnapLatLng);
  });
}

function resolveClickLatLng(latlng) {
  if (!latlng) return null;
  const snapped = resolveSnapPoint(
    latlng.lat,
    latlng.lng,
    SNAP_PREVIEW_DISTANCE_M
  );
  if (!snapped) return { lat: latlng.lat, lng: latlng.lng };
  return { lat: snapped.lat, lng: snapped.lng };
}

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

function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aVal =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function segmentDistanceMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(
      { lat: points[i - 1][0], lng: points[i - 1][1] },
      { lat: points[i][0], lng: points[i][1] }
    );
  }
  return total;
}

function projectMeters(lat, lng, originLat) {
  const rad = Math.PI / 180;
  const x = lng * Math.cos(originLat * rad) * 111320;
  const y = lat * 110540;
  return { x, y };
}

function segmentAreaMeters2(points) {
  if (!Array.isArray(points) || points.length < 4) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  const closed =
    distanceMeters(
      { lat: first[0], lng: first[1] },
      { lat: last[0], lng: last[1] }
    ) <= GAP_MIN_DISTANCE_M;
  if (!closed) return 0;

  const originLat = (first[0] + last[0]) / 2;
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = projectMeters(points[i][0], points[i][1], originLat);
    const p2 = projectMeters(points[i + 1][0], points[i + 1][1], originLat);
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 2;
}

function startTrace(latlng) {
  if (!latlng || props.editorMode !== "trace") return;
  const map = mapInstance.value;
  if (!map) return;

  traceActive.value = true;
  lastTraceTime = 0;

  const resolved = resolveClickLatLng(latlng) || latlng;
  lastTraceLatLng.value = resolved;
  emit("addWaypoint", resolved.lat, resolved.lng);

  map.dragging.disable();
  map.on("mousemove", onTraceMove);
  map.on("mouseup", stopTrace);
  map.on("touchmove", onTraceMove);
  map.on("touchend", stopTrace);
}

function onTraceMove(e) {
  if (!traceActive.value) return;
  const map = mapInstance.value;
  if (!map) return;
  const latlng = e?.latlng || getLatLngFromTouch(map, e);
  if (!latlng) return;

  const now = Date.now();
  if (now - lastTraceTime < TRACE_MIN_INTERVAL_MS) return;

  const last = lastTraceLatLng.value;
  const dist = last
    ? distanceMeters(
        { lat: last.lat, lng: last.lng },
        { lat: latlng.lat, lng: latlng.lng }
      )
    : TRACE_MIN_DISTANCE_M;
  if (dist < TRACE_MIN_DISTANCE_M) return;

  const resolved = resolveClickLatLng(latlng) || latlng;
  lastTraceLatLng.value = resolved;
  lastTraceTime = now;
  emit("addWaypoint", resolved.lat, resolved.lng);
}

function stopTrace() {
  if (!traceActive.value) return;
  traceActive.value = false;
  lastTraceLatLng.value = null;

  const map = mapInstance.value;
  if (!map) return;
  map.dragging.enable();
  map.off("mousemove", onTraceMove);
  map.off("mouseup", stopTrace);
  map.off("touchmove", onTraceMove);
  map.off("touchend", stopTrace);
}

// ── Event handlers ──────────────────────────────────────
function onMapReady(mapObj) {
  mapInstance.value = mapObj;
  mapZoom.value = mapObj.getZoom();
  mapObj.on("zoomend", () => {
    mapZoom.value = mapObj.getZoom();
  });
  mapObj.on("mousemove", (e) => {
    if (!e?.latlng) return;
    handleSnapMove(e.latlng);
  });
}

function onMapMouseDown(e) {
  if (props.editorMode !== "trace" || props.poiMode) return;
  startTrace(e.latlng);
}

function onMapTouchStart(e) {
  if (props.editorMode !== "trace" || props.poiMode) return;
  const map = mapInstance.value;
  const latlng = e?.latlng || (map ? getLatLngFromTouch(map, e) : null);
  startTrace(latlng);
}

function onMapClick(e) {
  if (props.editorMode === "view" || props.editorMode === "trace") return;
  closeContextMenu();

  // Cancel visual cursor modes on map click
  if (joinCursorOrigin.value) {
    cancelJoin();
    return;
  }
  if (shortcutOrigin.value) {
    cancelShortcut();
    return;
  }

  const snapped = resolveClickLatLng(e.latlng);
  const { lat, lng } = snapped || e.latlng;

  // POI mode: add POI instead of waypoint
  if (props.poiMode) {
    emit("addPoi", lat, lng);
    return;
  }

  emit("addWaypoint", lat, lng);
}

function onSegmentClick(segIdx, e) {
  if (props.editorMode === "view" || props.editorMode === "trace") return;

  // Join mode: clicking a segment joins it with origin
  if (joinCursorOrigin.value) {
    onJoinClick(segIdx);
    if (e.originalEvent) e.originalEvent.stopPropagation();
    return;
  }

  // Shortcut mode: clicking completes the shortcut
  if (shortcutOrigin.value && shortcutOrigin.value.segIdx === segIdx) {
    onShortcutClick();
    if (e.originalEvent) e.originalEvent.stopPropagation();
    return;
  }

  if (props.editorMode === "fragment") {
    const seg = props.segments[segIdx];
    if (!seg || seg.points.length < 2) return;

    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < seg.points.length; i++) {
      const [lat, lng] = seg.points[i];
      const d = Math.hypot(clickLat - lat, clickLng - lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    emit("selectFragmentPoint", segIdx, bestIdx);

    if (e.originalEvent) e.originalEvent.stopPropagation();
    return;
  }

  // Set this segment as active
  emit("setActiveSegment", segIdx);

  // Find nearest point index for insertion
  const seg = props.segments[segIdx];
  if (!seg || seg.points.length < 2) return;

  const snapped = resolveClickLatLng(e.latlng);
  const clickLat = (snapped || e.latlng).lat;
  const clickLng = (snapped || e.latlng).lng;
  const bestIdx = findNearestSegmentInsertIndex(seg, clickLat, clickLng);

  emit("insertWaypoint", segIdx, bestIdx, clickLat, clickLng);

  // Stop propagation to prevent map click
  if (e.originalEvent) e.originalEvent.stopPropagation();
}

function onSegmentContextMenu(segIdx, e) {
  if (props.editorMode === "view") return;
  if (e.originalEvent) {
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
  }

  const seg = props.segments[segIdx];
  if (!seg || seg.points.length < 2) return;

  const snapped = resolveClickLatLng(e.latlng);
  const clickLat = (snapped || e.latlng).lat;
  const clickLng = (snapped || e.latlng).lng;
  const bestIdx = findNearestSegmentInsertIndex(seg, clickLat, clickLng);

  contextMenu.value = {
    visible: true,
    x: (e.originalEvent ?? e).clientX,
    y: (e.originalEvent ?? e).clientY,
    segIndex: segIdx,
    pointIndex: -1,
    poiIndex: -1,
    afterIndex: bestIdx,
    latlng: { lat: clickLat, lng: clickLng },
    canSplit: false,
    canCut: seg.points.length >= 2,
    canNewTrack: seg.points.length >= 2,
    canDelete: false,
    canPromote: false,
    canDeletePoi: false,
    canReverse: seg.points.length >= 2,
  };
}

function onWaypointClick(segIdx, ptIdx, e) {
  if (e.originalEvent) e.originalEvent.stopPropagation();

  emit("focusWaypoint", segIdx, ptIdx);

  // FR-EDIT-06: Click on intermediate point promotes it to waypoint
  const seg = props.segments[segIdx];
  if (seg && !seg.waypoints.includes(ptIdx)) {
    emit("promoteToWaypoint", segIdx, ptIdx);
  }
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
  const isWaypoint = seg.waypoints.includes(ptIdx);

  contextMenu.value = {
    visible: true,
    x: (e.originalEvent ?? e).clientX,
    y: (e.originalEvent ?? e).clientY,
    segIndex: segIdx,
    pointIndex: ptIdx,
    poiIndex: -1,
    canSplit: !isFirst && !isLast && seg.points.length >= 3,
    canDelete: seg.points.length > 1,
    canPromote: !isWaypoint,
    canDeletePoi: false,
    canReverse: seg.points.length >= 2,
    canJoin: (isFirst || isLast) && props.segments.length > 1,
    canShortcut: !isFirst && !isLast,
  };
}

function handleSplit() {
  const { segIndex, pointIndex } = contextMenu.value;
  emit("splitSegment", pointIndex);
  closeContextMenu();
}

function handleCut() {
  const { segIndex, afterIndex, latlng } = contextMenu.value;
  if (!latlng) return;
  emit("cutSegment", segIndex, afterIndex, latlng.lat, latlng.lng);
  closeContextMenu();
}

function handleNewTrackFromSegment() {
  const { segIndex } = contextMenu.value;
  emit("newTrackFromSegment", segIndex);
  closeContextMenu();
}

function handleDeletePoint() {
  const { segIndex, pointIndex } = contextMenu.value;
  emit("deleteWaypoint", segIndex, pointIndex);
  closeContextMenu();
}

function handlePromote() {
  const { segIndex, pointIndex } = contextMenu.value;
  emit("promoteToWaypoint", segIndex, pointIndex);
  closeContextMenu();
}

function onPoiClick(poiIdx, e) {
  if (e.originalEvent) e.originalEvent.stopPropagation();
}

function onPoiContextMenu(poiIdx, e) {
  if (props.editorMode === "view") return;
  if (e.originalEvent) {
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
  }

  contextMenu.value = {
    visible: true,
    x: (e.originalEvent ?? e).clientX,
    y: (e.originalEvent ?? e).clientY,
    segIndex: -1,
    pointIndex: -1,
    poiIndex: poiIdx,
    canSplit: false,
    canDelete: false,
    canPromote: false,
    canDeletePoi: true,
  };
}

function handleDeletePoi() {
  const { poiIndex } = contextMenu.value;
  emit("deletePoi", poiIndex);
  closeContextMenu();
}

function handleReverse() {
  const { segIndex } = contextMenu.value;
  emit("reverseSegment", segIndex);
  closeContextMenu();
}

function handleStartJoin() {
  const { segIndex, pointIndex } = contextMenu.value;
  const seg = props.segments[segIndex];
  if (!seg) return;
  const isFirst = pointIndex === 0;
  const isLast = pointIndex === seg.points.length - 1;
  const latlng = isLast ? seg.points[seg.points.length - 1] : seg.points[0];
  joinCursorOrigin.value = { segIdx: segIndex, latlng };
  joinCursorTarget.value = null;
  joinHoverSegIdx.value = null;
  closeContextMenu();

  // Start tracking mouse for join visual cursor
  const map = mapInstance.value;
  if (map) {
    map.on("mousemove", onJoinMouseMove);
  }
}

function onJoinMouseMove(e) {
  if (!e?.latlng || !joinCursorOrigin.value) return;
  joinCursorTarget.value = [e.latlng.lat, e.latlng.lng];

  // Check if hovering near another segment
  const originSegIdx = joinCursorOrigin.value.segIdx;
  let bestSegIdx = null;
  let bestDist = Infinity;
  const HOVER_THRESHOLD_M = 50;

  for (let i = 0; i < props.segments.length; i++) {
    if (i === originSegIdx) continue;
    const seg = props.segments[i];
    if (!seg?.points?.length) continue;
    // Check first and last points of segment
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    const d1 = distanceMeters(
      { lat: e.latlng.lat, lng: e.latlng.lng },
      { lat: first[0], lng: first[1] }
    );
    const d2 = distanceMeters(
      { lat: e.latlng.lat, lng: e.latlng.lng },
      { lat: last[0], lng: last[1] }
    );
    const d = Math.min(d1, d2);
    if (d < bestDist && d < HOVER_THRESHOLD_M) {
      bestDist = d;
      bestSegIdx = i;
    }
  }
  joinHoverSegIdx.value = bestSegIdx;
}

function onJoinClick(targetSegIdx) {
  if (!joinCursorOrigin.value) return;
  const originSegIdx = joinCursorOrigin.value.segIdx;
  if (originSegIdx === targetSegIdx) return;
  emit("joinSegmentsVisual", originSegIdx, targetSegIdx);
  cancelJoin();
}

function cancelJoin() {
  joinCursorOrigin.value = null;
  joinCursorTarget.value = null;
  joinHoverSegIdx.value = null;
  const map = mapInstance.value;
  if (map) {
    map.off("mousemove", onJoinMouseMove);
  }
}

function handleStartShortcut() {
  const { segIndex, pointIndex } = contextMenu.value;
  shortcutOrigin.value = { segIdx: segIndex, pointIdx: pointIndex };
  shortcutTargetIdx.value = null;
  closeContextMenu();

  // Start tracking mouse for shortcut visual cursor
  const map = mapInstance.value;
  if (map) {
    map.on("mousemove", onShortcutMouseMove);
  }
}

function onShortcutMouseMove(e) {
  if (!e?.latlng || !shortcutOrigin.value) return;
  const { segIdx } = shortcutOrigin.value;
  const seg = props.segments[segIdx];
  if (!seg?.points?.length) return;

  // Find nearest point on the same segment
  let bestIdx = null;
  let bestDist = Infinity;
  for (let i = 0; i < seg.points.length; i++) {
    const [lat, lng] = seg.points[i];
    const d = distanceMeters(
      { lat: e.latlng.lat, lng: e.latlng.lng },
      { lat, lng }
    );
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // Only set target if it's different from origin and distance > 1 point
  const originIdx = shortcutOrigin.value.pointIdx;
  if (bestIdx !== null && Math.abs(bestIdx - originIdx) >= 2) {
    shortcutTargetIdx.value = bestIdx;
  } else {
    shortcutTargetIdx.value = null;
  }
}

function onShortcutClick() {
  if (!shortcutOrigin.value || shortcutTargetIdx.value === null) return;
  emit(
    "shortcutBetweenPoints",
    shortcutOrigin.value.segIdx,
    shortcutOrigin.value.pointIdx,
    shortcutTargetIdx.value
  );
  cancelShortcut();
}

function cancelShortcut() {
  shortcutOrigin.value = null;
  shortcutTargetIdx.value = null;
  const map = mapInstance.value;
  if (map) {
    map.off("mousemove", onShortcutMouseMove);
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false;
  contextMenu.value.poiIndex = -1;
  contextMenu.value.segIndex = -1;
  contextMenu.value.pointIndex = -1;
  contextMenu.value.afterIndex = -1;
  contextMenu.value.latlng = null;
}

// ── Drag handling ───────────────────────────────────────
function startDrag(segIdx, ptIdx, e) {
  if (props.editorMode === "view" || props.editorMode === "trace") return;
  const seg = props.segments[segIdx];
  if (!seg || !seg.waypoints?.includes(ptIdx)) return;
  dragging.value = true;
  dragSegIdx.value = segIdx;
  dragPtIdx.value = ptIdx;
  lastDragLatLng.value = null;

  const map = mapInstance.value;
  if (!map) return;

  map.dragging.disable();
  map.on("mousemove", onDragMove);
  map.on("mouseup", onDragEnd);
  map.on("touchmove", onDragMove);
  map.on("touchend", onDragEnd);
}

function onDragMove(e) {
  if (!dragging.value) return;
  const map = mapInstance.value;
  if (!map) return;
  const latlng = e.latlng || getLatLngFromTouch(map, e);
  if (latlng) {
    lastDragLatLng.value = latlng;
  }
}

function onDragEnd(e) {
  if (!dragging.value) return;

  const map = mapInstance.value;
  if (map) {
    map.dragging.enable();
    map.off("mousemove", onDragMove);
    map.off("mouseup", onDragEnd);
    map.off("touchmove", onDragMove);
    map.off("touchend", onDragEnd);
  }

  const rawLatLng =
    e.latlng ||
    lastDragLatLng.value ||
    (map ? getLatLngFromTouch(map, e) : null);
  const latlng = rawLatLng ? resolveClickLatLng(rawLatLng) || rawLatLng : null;
  if (!latlng) {
    dragging.value = false;
    dragSegIdx.value = -1;
    dragPtIdx.value = -1;
    return;
  }

  emit(
    "moveWaypoint",
    dragSegIdx.value,
    dragPtIdx.value,
    latlng.lat,
    latlng.lng
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
    if (joinCursorOrigin.value) cancelJoin();
    if (shortcutOrigin.value) cancelShortcut();
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

function panTo(latlng) {
  const map = mapInstance.value;
  if (!map || !latlng) return;
  map.panTo(latlng, { animate: true });
}

function zoomIn() {
  const map = mapInstance.value;
  if (!map) return;
  map.zoomIn();
}

function zoomOut() {
  const map = mapInstance.value;
  if (!map) return;
  map.zoomOut();
}

function findNearestSegmentInsertIndex(seg, clickLat, clickLng) {
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < seg.points.length - 1; i++) {
    const [lat1, lng1] = seg.points[i];
    const [lat2, lng2] = seg.points[i + 1];
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    const d = Math.hypot(clickLat - midLat, clickLng - midLng);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
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

watch(
  () => snapEnabled.value,
  (enabled) => {
    if (!enabled) {
      clearSnapPreview();
    }
  }
);

watch(
  () => props.editorMode,
  (mode) => {
    if (mode === "view") {
      clearSnapPreview();
    }
    if (mode !== "trace") {
      stopTrace();
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
  stopTrace();
  cancelJoin();
  cancelShortcut();
  if (mapInstance.value) {
    mapInstance.value.off("mousemove");
    mapInstance.value.off("zoomend");
  }
  if (snapFrame) {
    cancelAnimationFrame(snapFrame);
    snapFrame = null;
  }
});

// Expose for parent
defineExpose({ fitBounds, panTo, zoomIn, zoomOut });
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
