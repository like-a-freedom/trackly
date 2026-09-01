# ADR 0016: Adopt Pinia for Global State Management

## Status
Accepted

## Context
Five composables (`useAuth`, `useToast`, `useUnits`, `useSearchState`, `useTracks`) use module-scope `ref()`s as singletons. This causes HMR stale state and makes test isolation difficult.

## Decision
Adopt Pinia 4.0.3 for state management. One store per composable:

| Store | LOC | Migrated |
|---|---|---|
| `auth.js` | ~165 | Yes — delegates to `auth/*` modules from Stage 2.5 |
| `toast.js` | ~20 | Yes — simple state + action |
| `units.js` | ~55 | Yes — reads localStorage on init |
| `search.js` | ~30 | Yes — computed setter for v-model |
| `tracks.js` | ~130 | Store exists, but composable NOT migrated yet |

`useTracks` is excluded because it uses a module-scope singleton pattern (returns the same refs on every call, with bboxCache Map). Migrating it requires a different strategy (likely refactoring to accept options instead of relying on singleton refs).

## Consequences
- HMR state is properly reset via Pinia devtools
- Test isolation improved — `setActivePinia(createPinia())` in beforeEach
- Auth store delegates to `frontend/src/auth/*` modules (clean seam)
- `useAuth.js` shrinks to ~45 LOC facade
- `useToast.js` shrinks to ~15 LOC facade
- `useUnits.js` shrinks to ~25 LOC facade
- `useSearchState.js` shrinks to ~22 LOC facade
