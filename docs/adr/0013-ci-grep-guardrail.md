# ADR 0013: CI Grep Guardrail for Dead Exports

## Status
Accepted

## Context
Without a guardrail, dead code accumulates between audits. The architecture review found 15 dead backend exports.

## Decision
Add `.github/scripts/check-orphans.sh` that fails the CI build if any `pub fn`/`pub struct`/`pub enum` in `backend/src/` has no callers outside its own module.

## Consequences
- Catches future dead code before it accumulates
- Script is a heuristic (may produce false positives for module-internal APIs)
- Will be wired into the CI pipeline in Stage 5b
