# ADR 0022: CI Policy and Test Runner

## Status
Accepted

## Context
The original `.github/workflows/#test.yaml` was ignored by GitHub Actions (hash in filename). No CI pipeline existed for running tests on PRs.

## Decision
Create `.github/workflows/ci.yaml` with three jobs:

1. **backend** (Rust): `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo audit`
2. **frontend** (Vue): `bun run build`, `bun run test`
3. **e2e**: Conditional on `run-e2e` PR label; spins up PostGIS service, runs `bun run test:e2e`

### Key design choices
- E2E tests gated by PR label to avoid slow CI on every PR
- Ephemeral PostGIS service for integration tests
- `cargo audit` for dependency vulnerability scanning
- `--frozen-lockfile` for reproducible installs

## Consequences
- PRs get fast feedback on backend + frontend
- E2E tests run only when explicitly requested
- The orphan-grep guardrail (Stage 2f) should be added as a CI step in a follow-up
