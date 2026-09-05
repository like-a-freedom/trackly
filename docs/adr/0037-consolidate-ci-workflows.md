# ADR-0037: Consolidate CI Workflows into Single Pipeline

## Status
Accepted

## Context
Two CI workflows (`ci.yaml` and `#test.yaml`) ran on identical triggers (push/PR to main/master), causing duplicate fmt/clippy/test runs. Each workflow had unique value not present in the other:
- `#test.yaml` uniquely provided: Docker build verification, release build check, frontend linting
- `ci.yaml` uniquely provided: Security auditing (`cargo audit`), orphan symbol checks, E2E tests with real PostGIS

## Decision
Merge unique steps from `#test.yaml` into `ci.yaml`, then delete `#test.yaml`. The consolidated workflow includes:
- Backend: fmt, clippy, orphan check, test, audit, release build
- Frontend: lint, build, test
- E2E: conditional on `run-e2e` label
- Docker: build verification for backend, frontend, and docker-compose

## Consequences
- Single CI pipeline, faster feedback
- No duplicate runs (previously Rust backend and frontend were tested twice)
- All checks visible in one workflow
- Docker build verification now runs on every PR (previously only in separate workflow)
