# ADR 0020: MapAdapter Seam for TrackMap

## Status
Accepted (adapters extracted; the TrackMap.vue shell reduction is still open)

## Context
`TrackMap.vue` was 2734 LOC with 8+ responsibilities: tile rendering, GeoJSON, clustering, E2E hooks, filter UI, POI management, track highlighting, elevation display. Two adapters existed at the time (real Leaflet + a test double), so the seam was real.

## Decision
Define a `MapAdapter` port interface (`src/map/MapAdapter.js`) with these methods:
- `renderTile(url, attribution)` — tile layer
- `renderGeoJson(data, style, onEach)` — GeoJSON features
- `renderClusterGroup(points, options)` — clustered markers
- `on(event, cb)` / `off(event, cb)` — event delegation
- `getCenter()`, `isIdle()`, `fitBounds(bbox)`, `setView(center, zoom)` — map state
- `exposeE2E(namespace, api)` — E2E testing hooks

### Deliverables
- `src/map/MapAdapter.js` — interface + MAP_EVENTS constants (~30 LOC)
- `src/map/StubAdapter.js` — test double with call recording (~70 LOC)
- `docs/adr/0020-map-adapter-seam.md` — this ADR

### Delivered
Written as planned, in TypeScript:
- `src/map/MapAdapter.ts` — port interface + MAP_EVENTS constants (246 LOC)
- `src/map/LeafletAdapter.ts` — Leaflet implementation (330 LOC)
- `src/map/ClusterAdapter.ts` — cluster logic (234 LOC)
- `src/map/E2EAdapter.ts` — E2E hooks (103 LOC)

The planned `StubAdapter.js` was never needed: the unit suite doubles the `leaflet` module at the module boundary in `test-setup.ts`.

### Still open
- TrackMap.vue shell rewrite (2734 → ≤600 LOC). After the adapter seam and the composable extractions the component is at 1052 LOC, so the shell target is not met yet. The extraction itself was done incrementally against this interface, as intended.

## Consequences
- The adapter interface is defined and testable (tests double the `leaflet` module)
- Extraction proceeded incrementally against this interface
- No behavioral changes to TrackMap.vue in this stage
