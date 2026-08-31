# ADR 0008: Parameterize the track list SQL filter assembly

## Status

Accepted

## Context

The track list query built filter conditions with string interpolation in a security-audit-flagged
pattern:

```rust
conditions.push(format!("elevation_gain >= {}", min_gain));
```

This is a SQL-injection-shaped bug (flagged in `docs/security-audit-report.md` and re-flagged in
three other specs). The production `build_list_tracks_query` had already been migrated to
`sqlx::QueryBuilder` with `push_bind`; the remaining `format!`-based filter assembly lived in
**test-only helpers** (`build_elevation_filter_conditions`, `build_slope_filter_conditions`) that
mirrored the production function but were never wired to it.

## Decision

- Verify the production filter assembly (`build_list_tracks_query`, `list_tracks_geojson`,
  `list_tracks_heatmap`, and the six `create-tracks`-added `db::tracks` functions) uses
  `QueryBuilder` + `push_bind` exclusively — no `format!`-interpolated values.
- Delete the dead test-only helpers and their five tests. They duplicated production logic that
  is already covered by `list_tracks_query_uses_binds_for_filters` (which asserts `$1`/`$2`
  placeholders and the absence of inlined user input).
- The only remaining `format!` calls in `db/tracks.rs` are non-SQL: URL path building,
  LIKE-pattern binding (passed as a parameter), and dedup-hash generation.

## Consequences

- `grep "format!.*elevation|slope|length|category" src/db/tracks.rs` returns zero matches.
- No SQL value is ever interpolated; every user-supplied filter value goes through `push_bind`.
- The security audit finding can be re-run and closed.
- Reversal cost is low (one file, ~7 functions), which is why this is its own commit.
