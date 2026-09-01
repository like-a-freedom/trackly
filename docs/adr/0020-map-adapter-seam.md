# ADR 0020: MapAdapter Seam for TrackMap

## Status
Accepted (interface + stub defined; full LeafletAdapter extraction deferred)

## Context
`TrackMap.vue` is 2734 LOC with 8+ responsibilities: tile rendering, GeoJSON, clustering, E2E hooks, filter UI, POI management, track highlighting, elevation display. Two adapters exist today (real Leaflet + test stub in test-setup.js), so the seam is real.

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

### Deferred
- `src/map/LeafletAdapter.js` — full extraction from TrackMap.vue (~600 LOC)
- `src/map/ClusterAdapter.js` — cluster logic extraction (~80 LOC)
- `src/map/E2EAdapter.js` — E2E hooks extraction (~40 LOC)
- TrackMap.vue shell rewrite (2734 → ≤600 LOC)

The full extraction requires rewriting most of TrackMap.vue and is deferred to a follow-up plan to avoid destabilizing the codebase.

## Consequences
- The adapter interface is defined and testable via StubAdapter
- Future extraction can proceed incrementally against this interface
- No behavioral changes to TrackMap.vue in this stage
