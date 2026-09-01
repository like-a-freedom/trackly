# ADR 0009: Unify Elevation Enrichment Flow

## Status
Accepted

## Context
Two independent paths enriched elevation data:
- **Path A** (HTTP handler `enrich_elevation`): Missing `metrics::record_track_enrich_status` and `metrics::observe_track_enrich_duration`
- **Path B** (background queue `run_enrichment_job`): Had all metrics + 4 error classes + `BackgroundTaskGuard`

Both wrote to the same `db::update_track_elevation`, but the handler lacked observability metrics.

## Decision
Extract `run_enrichment()` and `EnrichmentOutcome` enum into `services/enrichment.rs` as the single canonical pipeline: remote API → persist → slope → metrics.

Both the HTTP handler and background queue delegate to this function.

## Consequences
- Metrics drift eliminated (single call site for `record_track_enrich_status` and `observe_track_enrich_duration`)
- Handler matches on `EnrichmentOutcome` to build HTTP responses
- Queue matches for logging only
- 2 new unit tests (outcome variants, success preserves gain/loss)
