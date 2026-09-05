# ADR 0035: Unified MapAdapter TypeScript Interface

## Status

Accepted

## Context

The MapAdapter seam was defined as a JSDoc comment only (`MapAdapter.ts`, 43 lines). Adapters didn't share a common TypeScript type, so the compiler couldn't verify that `LeafletAdapter`, `ClusterAdapter`, and `StubAdapter` implement the same surface. Leaflet types (`L.Map`, `L.Marker`, `L.Polyline`, `L.LatLngBounds`) escaped the seam into 6 components and 5 composables, coupling them to the map engine.

The `StubAdapter` (101 LOC) was incomplete (9 of 25 methods) and imported by zero test files — tests mocked Leaflet directly instead.

## Decision

Define a real `MapAdapter` TypeScript interface in `MapAdapter.ts` with domain-specific types:

- `Bounds` ({ sw, ne }) — replaces `L.LatLngBounds`
- `MapLayer` — opaque handle replacing `L.Layer`, `L.Polyline`, `L.GeoJSON`
- `GeoJsonStyle`, `FlyToOptions`, `FitBoundsOptions`, `PanOptions` — replace Leaflet option types
- `OnEachFeature`, `EventHandler`, `ControlPosition` — domain function types

The interface has ~25 methods covering lifecycle, view control, layer management, pane management, events, rendering, and E2E hooks.

`LeafletAdapter` now `implements MapAdapter` — its public surface uses domain types, while Leaflet types are confined to internal implementations. `StubAdapter` is completed to implement the full interface with call recording. `ClusterAdapter` remains a separate port (different lifecycle: `initialize`, `addMarker`, `addTo`, `cleanup`).

## Consequences

- Compile-time guarantee that adapters share the same interface
- Leaflet types are confined to the adapter module
- Swapping the map engine (e.g., to MapLibre) requires changing only the adapter
- StubAdapter can replace inline Leaflet mocks in tests
- `getBounds()` returns `Bounds` ({ sw, ne }) instead of `L.LatLngBounds` — consumers that called `.getSouthWest()` on the result must adapt (only `TrackMap.vue` stored the result, no method calls)
- Existing consumers typed as `unknown` for the adapter parameter are unaffected
