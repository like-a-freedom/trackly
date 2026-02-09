import { ref } from 'vue';
import { openDB } from 'idb';

const GRAPH_DB_NAME = 'fast-paths-graphs';
const GRAPH_STORE = 'graphs';
const GRAPH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_SNAP_DISTANCE_M = 500;
const DEFAULT_CELL_SIZE_DEG = 0.01; // ~1.1km
const GRAPH_REGION = import.meta.env.VITE_FAST_PATHS_REGION || 'default';
const GRAPH_VERSION = import.meta.env.VITE_FAST_PATHS_GRAPH_VERSION || 'v1';
const GRAPH_BASE_URL = import.meta.env.VITE_FAST_PATHS_GRAPH_BASE_URL || '/graphs';
const GRAPH_MANIFEST_URL = import.meta.env.VITE_FAST_PATHS_MANIFEST_URL || `${GRAPH_BASE_URL}/manifest.json`;
const WASM_MODULE_URL = import.meta.env.VITE_FAST_PATHS_WASM_URL || '/wasm/fast_paths_wasm.js';

function haversineMeters(a, b) {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const aVal =
        sinLat * sinLat +
        Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function getCellKey(lat, lng, cellSize) {
    return `${Math.floor(lat / cellSize)}:${Math.floor(lng / cellSize)}`;
}

function buildSpatialIndex(coords, cellSize = DEFAULT_CELL_SIZE_DEG) {
    const cells = new Map();
    for (let i = 0; i < coords.length; i += 2) {
        const lat = coords[i];
        const lng = coords[i + 1];
        const key = getCellKey(lat, lng, cellSize);
        if (!cells.has(key)) {
            cells.set(key, []);
        }
        cells.get(key).push(i / 2);
    }
    return { cells, cellSize };
}

function parseNodeCoords(buffer, format) {
    if (format === 'f64' || buffer.byteLength % 16 === 0) {
        return new Float64Array(buffer);
    }
    return new Float32Array(buffer);
}

function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

async function openGraphDb() {
    return openDB(GRAPH_DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(GRAPH_STORE)) {
                db.createObjectStore(GRAPH_STORE);
            }
        },
    });
}

async function fetchManifest() {
    try {
        const resp = await fetch(GRAPH_MANIFEST_URL);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

async function fetchArrayBufferWithProgress(url, onProgress, startPct, endPct) {
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error('Failed to load routing graph data');
    }

    const total = Number(resp.headers.get('content-length') || 0);
    if (!resp.body || !total) {
        const buf = await resp.arrayBuffer();
        if (onProgress) onProgress(endPct);
        return buf;
    }

    const reader = resp.body.getReader();
    let received = 0;
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress) {
            const ratio = Math.min(1, received / total);
            onProgress(startPct + (endPct - startPct) * ratio);
        }
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
    }

    if (onProgress) onProgress(endPct);
    return buffer.buffer;
}

function resolveGraphFiles({ mode, manifest }) {
    if (manifest?.graphs?.[GRAPH_REGION]?.[mode]) {
        return manifest.graphs[GRAPH_REGION][mode];
    }

    const graphFile = `${GRAPH_REGION}_${mode}_${GRAPH_VERSION}.bin`;
    const nodesFile = `${GRAPH_REGION}_${mode}_${GRAPH_VERSION}_nodes.bin`;
    return {
        graph: graphFile,
        nodes: nodesFile,
        nodes_format: 'f32',
        version: GRAPH_VERSION,
    };
}

async function loadGraphData(mode, onProgress) {
    const db = await openGraphDb();
    const manifest = await fetchManifest();
    const files = resolveGraphFiles({ mode, manifest });
    const cacheKey = `${GRAPH_REGION}_${mode}_${files.version || GRAPH_VERSION}`;
    const cached = await db.get(GRAPH_STORE, cacheKey);

    if (
        cached &&
        cached.timestamp &&
        Date.now() - cached.timestamp < GRAPH_TTL_MS &&
        cached.version === (files.version || GRAPH_VERSION)
    ) {
        if (onProgress) onProgress(100);
        return {
            graphBytes: cached.graphBytes,
            nodeBytes: cached.nodeBytes,
            nodesFormat: cached.nodesFormat || files.nodes_format || 'f32',
        };
    }

    const graphUrl = files.graph.startsWith('http')
        ? files.graph
        : `${GRAPH_BASE_URL}/${files.graph}`;
    const nodesUrl = files.nodes.startsWith('http')
        ? files.nodes
        : `${GRAPH_BASE_URL}/${files.nodes}`;

    const [graphBytes, nodeBytes] = await Promise.all([
        fetchArrayBufferWithProgress(graphUrl, onProgress, 0, 70),
        fetchArrayBufferWithProgress(nodesUrl, onProgress, 70, 100),
    ]);

    await db.put(
        GRAPH_STORE,
        {
            graphBytes,
            nodeBytes,
            nodesFormat: files.nodes_format || 'f32',
            timestamp: Date.now(),
            version: files.version || GRAPH_VERSION,
        },
        cacheKey
    );

    return {
        graphBytes,
        nodeBytes,
        nodesFormat: files.nodes_format || 'f32',
    };
}

let wasmModulePromise = null;
async function loadWasmModule() {
    if (!wasmModulePromise) {
        wasmModulePromise = import(/* @vite-ignore */ WASM_MODULE_URL).then(async (mod) => {
            if (typeof mod.default === 'function') {
                await mod.default();
            }
            return mod;
        });
    }
    return wasmModulePromise;
}

/**
 * Routing composable for track editor.
 *
 * Supports two modes:
 *  - 'manual': connects waypoints with straight lines (always available)
 *  - 'auto': uses WASM fast_paths routing (requires loaded graph)
 *
 * The WASM auto-routing is a stub until the fast_paths WASM module is built
 * and regional graph data is prepared. When auto mode is selected but the
 * graph is not loaded, a notification callback fires and the route returns null.
 */
export function useRouting({ autoLoad = true } = {}) {
    /** Current routing mode: 'manual' | 'auto' */
    const mode = ref('auto');

    /** Current routing profile: 'hiking' | 'walking' | 'running' | 'cycling' | 'driving' */
    const profile = ref('hiking');

    /** Whether the WASM routing graph is loaded and ready. */
    const graphReady = ref(false);

    /** Whether the graph is currently loading. */
    const graphLoading = ref(false);

    /** Last graph error message, if any. */
    const graphError = ref(null);

    /** Graph download progress (0-100). */
    const graphProgress = ref(0);

    /** Last routing timing metrics. */
    const lastRouteMetrics = ref({ snapMs: 0, routeMs: 0, totalMs: 0 });

    let router = null;
    let nodeCoords = null;
    let spatialIndex = null;

    async function ensureGraphLoaded() {
        if (graphReady.value || graphLoading.value) return;
        if (typeof fetch !== 'function') return;

        graphLoading.value = true;
        graphError.value = null;
        graphProgress.value = 0;

        const updateProgress = (value) => {
            if (typeof value !== 'number') return;
            const next = Math.max(graphProgress.value, Math.min(100, Math.round(value)));
            graphProgress.value = next;
        };

        try {
            const wasm = await loadWasmModule();
            if (!wasm?.FastPathsRouter) {
                throw new Error('Routing WASM module is unavailable');
            }

            const { graphBytes, nodeBytes, nodesFormat } = await loadGraphData(
                profile.value,
                updateProgress
            );
            const graphArray = new Uint8Array(graphBytes);

            if (typeof wasm.validate_graph_bytes === 'function') {
                await wasm.validate_graph_bytes(graphArray);
            }

            router = new wasm.FastPathsRouter(graphArray);
            nodeCoords = parseNodeCoords(nodeBytes, nodesFormat);
            spatialIndex = buildSpatialIndex(nodeCoords);

            graphReady.value = true;
            graphProgress.value = 100;
        } catch (e) {
            graphReady.value = false;
            graphError.value = e?.message || 'Failed to load routing graph';
            graphProgress.value = 0;
        } finally {
            graphLoading.value = false;
        }
    }

    function snapToNode(lat, lng) {
        if (!nodeCoords || !spatialIndex) return null;
        const { cells, cellSize } = spatialIndex;
        const maxCellOffset = Math.ceil((MAX_SNAP_DISTANCE_M / 111000) / cellSize);
        const baseLat = Math.floor(lat / cellSize);
        const baseLng = Math.floor(lng / cellSize);

        let best = null;
        let bestDist = Infinity;

        for (let dx = -maxCellOffset; dx <= maxCellOffset; dx++) {
            for (let dy = -maxCellOffset; dy <= maxCellOffset; dy++) {
                const key = `${baseLat + dx}:${baseLng + dy}`;
                const candidates = cells.get(key);
                if (!candidates) continue;

                for (const nodeId of candidates) {
                    const nLat = nodeCoords[nodeId * 2];
                    const nLng = nodeCoords[nodeId * 2 + 1];
                    const dist = haversineMeters({ lat, lng }, { lat: nLat, lng: nLng });
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = { nodeId, lat: nLat, lng: nLng, dist };
                    }
                }
            }
        }

        if (!best || best.dist > MAX_SNAP_DISTANCE_M) return null;
        return best;
    }

    /**
     * Find a route between two points.
     * @param {Object} from - { lat, lng }
     * @param {Object} to - { lat, lng }
     * @param {Object} options
     * @param {Function} options.onNotAvailable - Called when auto routing is not available
     * @returns {Array<[number,number]>|null} Array of [lat, lng] points or null
     */
    function findRoute(from, to, { onNotAvailable } = {}) {
        const totalStart = nowMs();
        if (mode.value === 'manual') {
            // Straight line between points
            lastRouteMetrics.value = { snapMs: 0, routeMs: 0, totalMs: 0 };
            return [
                [from.lat, from.lng],
                [to.lat, to.lng],
            ];
        }

        // Auto mode — WASM routing
        if (!graphReady.value || !router || !nodeCoords) {
            if (typeof onNotAvailable === 'function') {
                onNotAvailable(
                    graphError.value ||
                        'Auto-routing is unavailable. Load the road graph or switch to manual mode.'
                );
            }
            return null;
        }

        const snapStart = nowMs();
        const snappedFrom = snapToNode(from.lat, from.lng);
        const snappedTo = snapToNode(to.lat, to.lng);
        const snapMs = nowMs() - snapStart;

        if (!snappedFrom || !snappedTo) {
            if (typeof onNotAvailable === 'function') {
                onNotAvailable(
                    'Points are too far from the road network. Add intermediate points or switch to manual mode.'
                );
            }
            return null;
        }

        const routeStart = nowMs();
        const nodeIds = router.calc_path(snappedFrom.nodeId, snappedTo.nodeId);
        if (!nodeIds || nodeIds.length === 0) {
            if (typeof onNotAvailable === 'function') {
                onNotAvailable(
                    'No route found between selected points. Add intermediate points or switch to manual mode.'
                );
            }
            lastRouteMetrics.value = {
                snapMs,
                routeMs: nowMs() - routeStart,
                totalMs: nowMs() - totalStart,
            };
            return null;
        }

        const routePoints = [];
        for (const nodeId of nodeIds) {
            const idx = nodeId * 2;
            if (idx + 1 >= nodeCoords.length) continue;
            routePoints.push([nodeCoords[idx], nodeCoords[idx + 1]]);
        }

        const routeMs = nowMs() - routeStart;
        const totalMs = nowMs() - totalStart;
        lastRouteMetrics.value = { snapMs, routeMs, totalMs };

        if (totalMs > 50 || routeMs > 1) {
            console.warn(
                `[Routing] Slow route: snap ${snapMs.toFixed(2)}ms, ` +
                    `route ${routeMs.toFixed(2)}ms, total ${totalMs.toFixed(2)}ms`
            );
        }

        if (routePoints.length < 2) {
            if (typeof onNotAvailable === 'function') {
                onNotAvailable(
                    'No route found between selected points. Add intermediate points or switch to manual mode.'
                );
            }
            return null;
        }

        return routePoints;
    }

    /**
     * Set routing mode.
     * @param {'manual'|'auto'} newMode
     */
    function setMode(newMode) {
        if (newMode === 'manual' || newMode === 'auto') {
            mode.value = newMode;
            if (newMode === 'auto' && autoLoad) {
                ensureGraphLoaded();
            }
        }
    }

    /** Toggle between manual and auto modes. */
    function toggleMode() {
        mode.value = mode.value === 'manual' ? 'auto' : 'manual';
        if (mode.value === 'auto' && autoLoad) {
            ensureGraphLoaded();
        }
    }

    function setProfile(newProfile) {
        if (
            ['hiking', 'walking', 'running', 'cycling', 'driving'].includes(newProfile)
        ) {
            profile.value = newProfile;
            if (mode.value === 'auto' && autoLoad) {
                graphReady.value = false;
                graphProgress.value = 0;
                ensureGraphLoaded();
            }
        }
    }

    function initialize() {
        if (autoLoad && mode.value === 'auto') {
            ensureGraphLoaded();
        }
    }

    function __setTestGraph({ testRouter, testNodeCoords }) {
        router = testRouter;
        nodeCoords = testNodeCoords;
        spatialIndex = testNodeCoords ? buildSpatialIndex(testNodeCoords) : null;
        graphReady.value = !!(router && nodeCoords);
    }

    return {
        mode,
        profile,
        graphReady,
        graphLoading,
        graphError,
        graphProgress,
        lastRouteMetrics,
        findRoute,
        setMode,
        toggleMode,
        setProfile,
        initialize,
        ensureGraphLoaded,
        __setTestGraph,
    };
}
