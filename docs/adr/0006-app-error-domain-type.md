# ADR 0006: Introduce `AppError` as the single domain error type

## Status

Accepted

## Context

Handlers returned ad-hoc errors: `Result<T, StatusCode>` with ~30 `.map_err(|_| StatusCode)`
sites that discarded the underlying error, plus a separate `AuthError` for the auth domain and
`sqlx::Error` leaking out of `db::`. Three different error vocabularies made the handler layer
hard to test (assert on HTTP status codes) and easy to get wrong (status codes that didn't match
the real failure).

## Decision

Introduce a single domain error type `AppError` in `backend/src/error.rs`:

- Variants: `NotFound`, `Forbidden`, `BadRequest(String)`, `Validation(String)`,
  `Conflict(String)`, `Unauthorized(String)`, `TooManyRequests`, `Database(sqlx::Error)`,
  `Internal(anyhow::Error)`.
- `From` impls for `sqlx::Error`, `serde_json::Error`, `axum::http::Error`, `String`,
  `StatusCode` (bridge for the legacy `input_validation` validators), and `AuthError`.
- One `IntoResponse` impl that logs the variant with `tracing::error!` and returns a sanitized
  body — the only place an error becomes an HTTP response.
- `pub type Result<T> = std::result::Result<T, AppError>`.

Converted in this stage:

- All handlers (`tracks`, `pois`, `auth`, `observability`, `sitemap`) to `Result<_, AppError>`.
  The ad-hoc `.map_err(|_| StatusCode)` sites collapse to `?`; the `handle_db_error` helper now
  returns `AppError` (RowNotFound → `NotFound`, else `Database`).
- `db::users` from `Result<_, AuthError>` to `Result<_, AppError>`. The `From<AuthError>` impl
  (in `error.rs`) bridges auth-domain errors; the 5 manual `return Err(AuthError::…)` sites are
  gone.

**Not converted** (deliberately): `services/track_upload.rs` (Stage 2b deletes it; converting it
would be wasted work) and `db/tracks.rs` / `db/api_usage.rs` (their consumers in
`services/track_upload.rs` and `track_utils/elevation_enrichment.rs` return `StatusCode`/`anyhow`,
so conversion would force touching out-of-scope files; handlers convert at the boundary via
`handle_db_error`).

## Consequences

- The handler layer has one error vocabulary; tests can assert `matches!(err, AppError::NotFound)`
  without parsing HTTP bodies.
- Every error is logged exactly once, in `AppError::into_response`, with its full source chain.
- The `db::users` → `AppError` conversion makes the auth handlers return `AppError` too,
  unifying the account/auth surface with the rest of the API.
- Reversal cost is high (touches every handler), which is why this lands as its own stage with
  its own ADR.
