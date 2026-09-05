# ADR-0038: Refactor SQL Query Builder to Match-Based Pattern

## Status
Accepted

## Context
`build_user_tracks_query` in `db/users.rs` used string interpolation (`format!`) for the ORDER BY clause. While an upstream allowlist in `list_user_tracks` mitigated injection risk, the function signature (`sort_column: &str, sort_order: &str`) invited misuse — a future caller could pass raw user input.

## Decision
Inline the allowlist match directly into `build_user_tracks_query`, changing its signature to accept `Option<&str>` parameters. The function now validates inputs internally, making it safe to call with any input.

## Consequences
- Defense-in-depth against SQL injection
- Function is safe to call with any input (not just pre-validated values)
- Duplicate validation in `list_user_tracks` removed (now single source of truth)
- Test updated to match new signature
