# ADR 0011: Drop Shallow Wrapper Structs

## Status
Accepted

## Context
Four structs held no state and delegated to free functions:
- `GpxExportService` (unit struct, zero fields)
- `TrackClassifier` (unit struct, zero fields)
- `PoiDeduplicationService` (unit struct, zero fields)
- `TrackUploadService` (held `pool: Arc<PgPool>`)

Each struct added one layer of indirection with no benefit.

## Decision
Convert all four to free functions. `GpxExportService` → `gpx_export::{generate_gpx, sanitize_filename}`. `TrackClassifier` → `classify_track()`. `PoiDeduplicationService` → `poi_deduplication::{link_pois_to_track, ...}`. `TrackUploadService` → `track_upload::upload_track(pool, request)`.

## Consequences
- Callers gain locality (one fewer hop)
- `pool` parameter threaded through `upload_track` (previously stored in struct)
- No behavior change
