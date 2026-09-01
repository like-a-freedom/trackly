# ADR 0015: Decompose useAuth.js into Deep Auth Modules

## Status
Accepted

## Context
`useAuth.js` was 508 LOC with PKCE, OAuth, refresh, profile, and migration logic all in one factory function. The audit flagged it as a top-tier deepening candidate.

## Decision
Split into 5 focused modules under `frontend/src/auth/`:

| Module | LOC | Responsibility |
|---|---|---|
| `pkce.js` | ~45 | PKCE verifier/challenge generation, JWT parsing, state tokens |
| `oauth-client.js` | ~75 | OAuth2 login flow, callback handling, sessionStorage management |
| `refresh.js` | ~45 | Token refresh rotation, logout API call |
| `profile.js` | ~55 | Profile fetch/update, account deletion |
| `migration.js` | ~30 | Anonymous-to-user session track migration |

`useAuth.js` shrinks to 222 LOC: manages singleton state (6 refs), delegates to the new modules, and re-exports the same public API.

## Consequences
- Each auth concern is independently testable
- 21 new tests across 5 test files
- No behavior change — public API of `useAuth()` is preserved
- `useAuth.js` still manages singleton state (will be migrated to Pinia in Stage 3a)
