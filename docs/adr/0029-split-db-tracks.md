# Split db/tracks.rs into focused sub-modules

`db/tracks.rs` is 2341 LOC mixing CRUD operations, GeoJSON/heatmap queries, gap metadata computation, chart simplification, and 822 LOC of tests. Changes to gap metadata require reviewing the entire file. We split into 4 focused sub-modules plus a test module.

## Structure

```
backend/src/db/tracks/
├── mod.rs          — Module declarations + pub use re-exports
├── crud.rs         — Core CRUD operations (insert, get, delete, update)
├── queries.rs      — Read-only queries (list, search, GeoJSON, heatmap)
├── gap_metadata.rs — Pure computation (chart simplification, gap detection)
├── editor.rs       — Editor-specific operations (insert from editor, duplicate, publish)
└── tests.rs        — All #[cfg(test)] code
```

## Visibility changes

Private helper functions used cross-module or tested in the consolidated test file are widened to `pub(crate)`:

- `sanitize_description` — used by both `crud.rs` and `editor.rs`
- `compute_gap_metadata` — called by `crud.rs` from `gap_metadata.rs`
- `simplify_chart_data` — called by `crud.rs` from `gap_metadata.rs`
- `build_list_tracks_query` — unit-tested in `tests.rs`
- `heatmap_grid_size_degrees` — unit-tested in `tests.rs`

No function signatures, logic, or behavior are changed.

## Re-exports

`mod.rs` re-exports all public items via `pub use` so that `crate::db::tracks::function_name` continues to work unchanged. The parent `db/mod.rs` is not modified.
