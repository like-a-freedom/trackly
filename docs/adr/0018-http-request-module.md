# ADR 0018: Single HTTP Request Module

## Status
Accepted

## Context
Auth header (`Authorization: Bearer ...`) is reconstructed inline in 7+ places across composables and views. Each site independently calls `useAuth().ensureValidToken()` and reads `accessToken.value`. This creates duplication and makes it easy to forget auth headers.

## Decision
Create `frontend/src/http.js` — a `createHttp({ tokenSource, logSink, baseUrl })` factory that returns a request function with:
- Automatic auth header injection via `tokenSource.getToken()`
- Request/response logging via `logSink.log()`
- Header merging (preserves existing headers from caller)

### Adapters
- Production: `http-instance.js` uses `useAuthStore` for tokens, `console.log` for logging
- Test: `tokenSource = { getToken: () => 'test-token' }`, `logSink = { log: vi.fn() }`

### Migration status
- AccountView.vue: migrated (4 `authFetch` → `http()` calls)
- useTracks.js: **deferred** (7 inline auth sites, complex module-scope singleton composable)
- usePois.js, useSearchState.js: **deferred** (not yet migrated)

## Consequences
- Auth header injection is centralized in one module
- New composables/views use `http()` instead of inline auth logic
- `useAuth.authFetch` remains for backward compatibility until fully migrated
- 4 new http tests verify auth injection, header merging, logging
