# ADR 0023: Create CONTEXT.md Domain Glossary

## Status
Accepted

## Context
The codebase has no shared domain vocabulary. Different developers use different terms for the same concepts (e.g., "route" vs "track" vs "trail"). The `/improve-codebase-architecture` skill requires a CONTEXT.md for domain language.

## Decision
Create `CONTEXT.md` at repo root with glossary entries for all domain terms: Track, Track Detail, Track Simplified, POI, User, Session, Category, Elevation, Slope, Enrichment, Auth, Refresh Token, MapAdapter, TrackMap.

Each entry includes:
- One-to-two sentence definition
- `_Avoid_` synonyms to prevent terminology drift
- "Deferred Follow-ups" section listing known large components needing future work

## Consequences
- Future architecture audits can reference CONTEXT.md for domain language
- The `/improve-codebase-architecture` skill now has a glossary to work with
- New developers have a single source of truth for domain terminology
