# ADR 0013: CI Grep Guardrail for Dead Exports

## Status
Accepted (amended 2026-10-04)

## Context
Without a guardrail, dead code accumulates between audits. The architecture review found 15 dead backend exports.

`cargo clippy` cannot cover this gap: rustc's `dead_code` lint is structurally
blind to unused `pub` items in a library crate, because a `pub` symbol is assumed
to be reachable by downstream consumers. This project has no downstream consumers —
only a binary. Verified empirically: with 16 genuinely dead `pub` symbols present,
`cargo clippy --all-targets` reported zero `dead_code` warnings.

## Decision
Add `.github/scripts/check-orphans.sh` that fails the CI build if any `pub fn`/`pub struct`/`pub enum`/`pub type` in `backend/src/` has **zero references anywhere** in `backend/src/`.

### Amendment (2026-10-04)
The original rule required callers *outside the defining file*. That produced a flood
of false positives: a symbol used only within its own module is legitimate, not dead.
Typical case — an axum extractor struct declared in the same file as the handler that
consumes it (`ExportQuery` in `handlers/tracks/export.rs`).

Of 45 reported orphans, 36 were such false positives and only 9 were genuinely dead.
The rule now counts references across the whole of `backend/src/`, and declares a
symbol orphaned only when its sole occurrence is its own declaration.

The script is also invoked from CI with a path that resolves correctly under the
backend job's `working-directory: ./backend` (previously `./.github/scripts/...`, which
resolved to `backend/.github/...` and failed with exit code 127).

## Consequences
- Catches future dead code before it accumulates
- Complementary to clippy, not overlapping: clippy covers private dead code, this covers `pub` dead code
- Still a heuristic — it counts textual references, so symbols reached only through macros or generated code may be reported and need a `#[allow]`-style judgement call
- Wired into the CI pipeline (Stage 5b)
