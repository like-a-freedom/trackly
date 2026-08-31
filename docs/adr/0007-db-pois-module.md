# ADR 0007: Move POI CRUD into a `db::pois` module

## Status

Accepted

## Context

The POI handlers (lifted into `handlers/pois.rs` in Stage 1a) still contained raw SQL — the only
place SQL leaked into the handler layer after the Stage 1a split. Handlers building SQL inline is
a leaky seam: query logic and handler logic interleave, and the same POI shape query is written
three times (bbox / track / all).

## Decision

Create `db/pois.rs` with all POI SQL, parameterized, as free functions:

- `find_by_bbox`, `find_by_track_id`, `list_all`, `count_all` — list paths
- `get`, `owner_session_id`, `update`, `find_by_track_with_distance` — single/join paths
- `create`, `unlink_from_track`, `usage_count`, `delete`, `bulk_link_to_track` — write paths

`bulk_link_to_track` delegates to `poi_deduplication::PoiDeduplicationService::bulk_link_pois_to_track`
(the dedup logic stays in the dedup module). `handlers/pois.rs` now contains zero `sqlx::query`
calls — handlers only validate, call `db::`, and shape the response.

Stage 1a and 1c are sequential by design: 1a created `handlers/pois.rs` as a stub with the SQL
lifted unchanged; 1c replaces the bodies. Between the two stages the code compiled and behaved
identically.

## Consequences

- `grep "sqlx::query" handlers/pois.rs` returns zero matches; all SQL lives in `db::pois`.
- POI query shapes are written once and reused (bbox/track/all share the column list).
- The `db::` layer is now the single place POI SQL can change; handlers stay thin.
- Reversal cost is medium: one seam, but the handler bodies changed shape (not just moved).
