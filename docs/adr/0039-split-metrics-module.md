# ADR-0039: Split metrics.rs into focused sub-modules

## Status
Accepted

## Context
`backend/src/metrics.rs` was 1530 LOC mixing five unrelated reasons to change: the Prometheus
registry and its static labels, ~50 collector definitions, ~40 recording functions, the tower
layer/middleware that instruments every HTTP request, and the `/metrics` scrape endpoint (plus
~175 LOC of tests). A change to any one of them required reading the whole file, and the metric
definitions were interleaved with the code that writes to them.

## Decision
Split into a directory module following the ADR-0029 pattern (code motion only — no logic,
signature or behavior change):

```
backend/src/metrics/
├── mod.rs          — Module declarations + pub use re-exports
├── registry.rs     — REGISTRY, static labels, DB_POOL/DB_POOL_MAX, initialize_metrics_baseline
├── definitions.rs  — The collector definitions (metric statics)
├── recorders.rs    — record_*/observe_* functions, BackgroundTaskGuard
├── http.rs         — HttpMetricsLayer, HttpMetricsMiddleware, serve_metrics
└── tests.rs        — All #[cfg(test)] code
```

## Visibility changes
Collector statics move to `definitions.rs` and are widened from private to `pub(crate)`, since
they are read by `registry.rs` (baseline), `recorders.rs` and `http.rs`:

- all metric statics — `pub(crate)`
- `REGISTRY`, `DB_POOL`, `DB_POOL_MAX` — `pub(crate)`
- `hash_session_id` — `pub(crate)` (asserted directly by `tests.rs`)

`static_labels` stays private to `registry.rs`.

## Re-exports
`mod.rs` re-exports the full public surface so every `crate::metrics::…` call site is unchanged:

```rust
pub use http::{HttpMetricsLayer, HttpMetricsMiddleware, serve_metrics};
pub use recorders::*;
pub use registry::initialize_metrics_baseline;
```

Verified mechanically: 44 public items before = 44 after, the set of 22 registered metric names is
identical, the baseline body is byte-identical, and `cargo test` reports the same counts.

## Consequences
- Each concern has its own file; adding a collector no longer means editing a 1500-line module.
- The metric-name set and the public API are provably unchanged.
- `definitions.rs` and `registry.rs` import from each other (`REGISTRY` ↔ statics). Rust allows
  module-level import cycles, so this is not a build issue, but it is the one spot where the
  boundary is not a clean one-way dependency.
