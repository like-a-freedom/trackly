# Backend Architecture Audit

**Scope:** Rust/Axum backend only (`backend/`).
**Date:** 2026-10-19
**Baseline:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` all green (294 unit + 2 integration tests, 12 ignored DB-gated).

> **Historical snapshot.** Superseded by `docs/audit/architecture-audit-2026-10-20.md`. The findings were re-verified on 2026-10-20 and most were fixed; see the consolidated report for current status.

## Executive summary

The backend is in good shape: clean clippy/fmt, comprehensive test coverage of pure logic, parameterized SQL, a single domain error type, and well-factored handler submodules. The two material findings are (1) a **dead abstraction layer** (service/repository traits + Postgres impls) that is declared and compiled but never wired, and (2) **layering leaks** where business/upload code issues raw SQL directly. Both violate YAGNI and the project's own documented "gradual migration" intent. Remaining items are minor DRY/consistency and security hardening.

## Findings

### F1 — Dangling service/repository abstraction layer (YAGNI / dead code)
**Severity:** High

- `src/services/track_service.rs` defines `TrackService` trait.
- `src/services/postgres_track_service.rs` implements `PostgresTrackService` wrapping `track_editor` free functions.
- `src/repositories/track_repository.rs` defines `TrackRepository` trait.
- `src/repositories/postgres_track_repository.rs` implements `PostgresTrackRepository` wrapping `db::*` free functions.
- `src/repositories/mod.rs`, `src/services.rs` declare both modules; `src/lib.rs` exposes both.

**Evidence:** No call site constructs or uses these types anywhere (handlers, services, tests, examples all call `db::*` / `track_editor::*` directly). The impls are also *misleading*: `PostgresTrackRepository::update_geometry` passes `hash: ""` and drops waypoints/pois/session_id; `PostgresTrackService::update_track_geometry` ignores `_user_id`. Wiring them later would silently lose data/ownership.

**Recommendation:** Either complete the migration (inject `Arc<dyn TrackService>`/`Arc<dyn TrackRepository>` into handlers via Axum state) or delete the dead modules. Given the codebase's "minimal changes" ethos, recommend deletion until a concrete need arises; keep the traits only if a mock/test use case appears. Also remove the `repositories` module from `lib.rs`.

### F2 — Raw SQL in business layer (layering / DRY)
**Severity:** Medium

- `src/track_upload.rs:105` runs `sqlx::query_as("SELECT is_public, session_id FROM tracks WHERE id=$1")` inline inside `upload_inner` (duplicate-track ownership check).
- `src/poi_deduplication.rs` is a service module that embeds SQL directly (acceptable for a specialized service, but inconsistent with `db::pois`).

**Recommendation:** Move the duplicate-track ownership lookup into `db::tracks` (e.g. `get_track_visibility_and_session`) and call it from `track_upload.rs`. Keeps all SQL in `db::*`.

### F3 — Dangling utility module: `track_utils::hash`
**Severity:** Low

- `src/track_utils/hash.rs` exposes `calculate_file_hash`, re-exported from `src/track_utils.rs`.
- **Evidence:** No production or test consumer outside `hash.rs` itself. Track hashing uses SHA-256 of normalized geometry (`compute_geometry_hash` in `track_editor.rs`), not file bytes.

**Recommendation:** Delete `hash.rs` and its `pub mod`/`pub use` entries.

### F4 — Dangling abstraction: `bulk_find_or_create_pois` visibility
**Severity:** Low

- `poi_deduplication::bulk_find_or_create_pois` is `pub` but only called within the same module. Tighten to `pub(crate)` or private.

### F5 — DRY: duplicated bulk-operation validation
**Severity:** Low

- `handlers/tracks/update.rs`: `bulk_toggle_visibility` and `bulk_delete_tracks` repeat identical empty-list / `> 100` guards.

**Recommendation:** Extract `validate_bulk_track_ids(ids: &[Uuid]) -> Result<(), AppError>`.

### F6 — Inconsistent DB handle types
**Severity:** Low

- `db::*` and handlers use `Arc<PgPool>`; `poi_deduplication::*` and `auth::refresh::*` take `&PgPool` (not `Arc`). Callers deref (`&**pool`) inconsistently.

**Recommendation:** Standardize on `&Arc<PgPool>` (or `&PgPool`) across all `db`/service functions for clarity. Cosmetic; not a correctness issue.

### F7 — Security: OAuth state/CSRF not verified server-side
**Severity:** Medium (security)

- `handlers/auth.rs::google_callback` accepts `state` from the client and passes `_nonce: ""` to `exchange_code_for_user`, which ignores it. The CSRF token is generated and returned to the client but never stored/verified on the server. PKCE verifier likewise round-trips through the client.
- This is a "simplified OAuth2 flow" (documented). For a production hardening pass, store `state`+`pkce_verifier` in a short-lived HttpOnly cookie and verify on callback; validate `state` matches.

**Recommendation:** Track as a security hardening task; not blocking for current dev.

### F8 — Client IP spoofing surface
**Severity:** Low (security)

- `extract_client_ip_from_headers` trusts the first entry of `X-Forwarded-For` (client-settable) for rate limiting / suspicious-activity detection.

**Recommendation:** Only trust proxy headers when behind a known proxy; otherwise prefer the socket peer address. Document deployment assumption.

### F9 — Search input not bounded
**Severity:** Low

- `db::tracks::search_tracks` builds `format!("%{}%", query)` and passes as a bound param (no SQL injection), but `query` length is unbounded and `%`/`_` in input act as LIKE wildcards, and the query is lowercased in Rust then matched with `LOWER(...)` (redundant).

**Recommendation:** Cap query length (e.g. 200 chars) in handler; escape LIKE wildcards or use `ILIKE` with `escape`. Minor.

### F10 — Debug endpoint always registered
**Severity:** Low

- `/debug/background_task` is registered unconditionally (comment says "guarded by feature flags", but handler body is a static OK and no flag check). Harmless but misleading.

**Recommendation:** Either gate behind `FEATURE_EDITOR`/a debug flag or remove.

### F11 — `docs/superpowers/plans/` absent
**Severity:** Info

- The audit prompt references `@docs/superpowers/plans/`. No such directory exists (only `docs/superpowers/specs/`). No plan artifacts to cross-check "non-wired/dangling" functionality against; the dangling items above were found by direct code inspection.

### F12 — Large modules (maintainability)
**Severity:** Info

- `track_utils/slope.rs` (1124), `elevation_enrichment.rs` (1080), `gpx_parser.rs` (963), `pace_filter.rs` (820), `simplification.rs` (734), `models.rs` (702), `db/users.rs` (710), `db/tracks/crud.rs` (618), `db/tracks/tests.rs` (814). Not violations per se, but candidates for splitting if touched. `pace_filter.rs` and `slope.rs` in particular mix parsing, computation, and (in slope) metric aggregation.

## Positive observations

- SQL is fully parameterized; query builder's `col_prefix` is code-controlled (no injection).
- Single domain error type `AppError` with localized `IntoResponse`; `From` conversions for `sqlx`, `serde_json`, `AuthError`, `StatusCode`.
- Handler submodules split by responsibility; `util::verify_track_owner` centralizes ownership.
- Enrichment pipeline unified in `services::enrichment::run_enrichment` (single source of truth).
- Metrics split per ADR 0039; clippy/fmt/tests green.
- Auth: PKCE, refresh-token rotation with family revocation on replay, bcrypt/SHA-256 hashing, rate limiting, suspicious-activity checks.
- `input_validation` shared between upload and editor paths (DRY).

## Suggested priority

1. F1 (delete or wire dead abstraction layer) — biggest maintainability/testability win.
2. F2 (move inline SQL to db layer).
3. F7 (OAuth CSRF hardening) — security.
4. F3, F4, F5, F9, F10 — small cleanups.
5. F6, F8, F12 — opportunistic.

## Verification

Re-run after changes:
- `cargo fmt --all -- --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test`
