# ADR 0018: Single HTTP Request Module

## Status
Accepted

## Context
Auth header (`Authorization: Bearer ...`) was reconstructed inline across composables and views. Each site independently called `useAuth().ensureValidToken()` and read `accessToken.value`. This created duplication and made it easy to forget auth headers.

## Decision
Create `frontend/src/http.ts` — a `createHttp({ tokenSource, logSink, baseUrl })` factory that returns a request function with:
- Automatic auth header injection via `tokenSource.getToken()`
- Request/response logging via `logSink.log()`
- Header merging (preserves existing headers from caller)

### Adapters
- Production: `http-instance.ts` uses `useAuthStore` for tokens, `console.log` for logging
- Test: `tokenSource = { getToken: () => 'test-token' }`, `logSink = { log: vi.fn() }`

### Migration status
26 of the 38 raw `fetch` call sites have been migrated to `http()`: `useTrackPersistence` (13),
`usePois` (2), `useTrackOptimizer`, `useElevationPreview`, `stores/featureFlags`,
`components/TrackSearch.vue`, `components/TrackDetailPanel.vue` (4) and the elevation flow now in
`composables/useElevationEnrichment.ts` (3, ADR 0033).

The remaining 12 are deliberate:

| File(s) | Sites | Reason to stay on raw `fetch` |
| --- | --- | --- |
| `http.ts` | 1 | Is the module |
| `auth/refresh.ts`, `auth/oauth-client.ts`, `auth/profile.ts`, `auth/migration.ts`, `stores/auth.ts` | 9 | `http-instance` imports `useAuthStore`, and the store imports these modules — routing them through `http()` would close an import cycle. They also run *before* a bearer token exists (`oauth-config`, `refresh`, callback exchange). |
| `composables/useRouting.ts` | 2 | Downloads the static routing-graph asset (manifest + binary), not an API call. It needs the raw `Response` body stream for progress, and attaching a bearer token to the configurable `VITE_FAST_PATHS_MANIFEST_URL` could leak it to a third-party origin. |

`useTrackPersistence` no longer accepts a `getAuthHeader` callback: the parameter was deleted in the
same commit because `http()` supplies the header, leaving the callback as dead weight in six
function signatures.

`useAuth.authFetch` and `useAuth.getAuthHeader` had no production call sites after the
migration; they were kept as a legacy escape hatch and have since been deleted (ADR 0040).

## Consequences
- Auth header injection is centralized in one module; a call site cannot forget it
- New composables/views use `http()` instead of inline auth logic
- Per-call-site auth plumbing (`getAuthHeader` callbacks) has been deleted
- `http()` resolves the token before issuing the request, so a request lands one microtask later
  than a bare `fetch`. Tests that assert synchronously right after firing a timer must drain the
  microtask queue (`vi.advanceTimersByTimeAsync`, `await Promise.resolve()`). Note that vitest 4.1
  `vi.waitFor` resolves as soon as its callback returns a non-thenable value — it does not poll — so
  tests that need to wait for that extra tick use the global `waitFor` helper from
  `src/test-setup.ts` instead.
- 4 new http tests verify auth injection, header merging, logging
