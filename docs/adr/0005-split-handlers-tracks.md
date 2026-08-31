# ADR 0005: Split `handlers/tracks.rs` along its concerns

## Status

Accepted

## Context

`handlers/tracks.rs` was 2,983 LOC spanning five unrelated concerns: track CRUD/upload/export,
POI CRUD, map-interaction observability, sitemap generation, and session rate limiting. A single
2.9k-line file is a shallow module: the interface (25+ handlers) is as complex as the
implementation, and any change to one concern risks breaking another. The audit flagged it as the
leakiest seam in the backend.

## Decision

Split the file along its concerns in one stage:

- `handlers/tracks.rs` — track handlers only (CRUD, upload, export, search, enrichment, slope, editor)
- `handlers/pois.rs` — POI handlers (created as a *stub* in this stage; Stage 1c replaces the
  bodies to call `db::pois`, removing the raw SQL)
- `handlers/observability.rs` — `record_map_interaction`, `health`, zoom bucketing
- `handlers/sitemap.rs` — `sitemap`
- `handlers/rate_limit.rs` — upload/export rate-limit statics and helpers (moved out so the
  upcoming `AppError` migration touches one small module instead of a 2.9k-line file)
- `handlers/util.rs` — shared `handle_db_error` and `check_track_ownership`

The split is a pure move: no handler logic changed, the route table (`main.rs`) is unchanged
(modulo re-export paths), and every handler keeps its exact signature and error mapping.

Stages 1a and 1c are **sequential**, not parallel: 1a creates `handlers/pois.rs` as a stub with
the same raw SQL lifted from `tracks.rs`, 1c rewrites the bodies to use the new `db::pois` module.

## Consequences

- `handlers/tracks.rs` drops from 2,983 to ~2,300 LOC; the POI/observability/sitemap/rate-limit
  concerns live in files under 450 LOC each.
- The rate-limit helpers are now in one small module, making the `AppError` conversion in Stage 1b
  mechanical.
- `handlers/pois.rs` temporarily duplicates the raw SQL (until Stage 1c) — an accepted
  intermediate state that keeps 1a a pure move.
- Reversal cost is low: the move is a git-diffable refactor with no behavior change.
