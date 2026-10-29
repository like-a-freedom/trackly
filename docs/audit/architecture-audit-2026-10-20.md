# Trackly Architecture & Maintainability Audit

**Date:** 2026-10-20  
**Scope:** Rust/Axum backend, Vue frontend, database access layer, CI, and `docs/` intent artifacts.  
**Method:** Three parallel read-only audits (backend, frontend, plans/docs/CI), followed by direct verification against the current source tree. Every finding below was reproduced in code before being changed.  
**Result:** All backend and frontend quality gates are green after the applied fixes. End-to-end tests compile but were not executed because the frontend dev server on port 81 was not running.

---

## 1. Executive summary

Trackly is a modular monolith with a clean domain error type, parameterized SQL, a typed HTTP wrapper, and strong pure-logic test coverage. The audit found three classes of problems:

1. **Security and data-exposure defects** — owner identifiers were serialized to clients, private tracks could be read/exported by ID, owner filters trusted client-supplied query parameters, and several mutating endpoints lacked ownership checks.
2. **Dead or misleading abstractions** — an unused service/repository layer, an unused file-hash utility, a dead bottom-deck component, and a `simplify-preview` endpoint that computed simplifications and then discarded them.
3. **Test and documentation drift** — database-backed tests are globally `#[ignore]`d and never run in CI; the frontend test harness suppressed component errors; `docs/superpowers/plans/` was deleted but still referenced by five documents.

The fixes are deliberately narrow. They remove dead code instead of wiring it, make ownership checks explicit, bind list filters to verified identity, and align tests with the current editor shell. The tracked diff changes **61 files** with **1,848 insertions and 1,219 deletions**.

### Quality gate snapshot

| Gate | Result |
|---|---|
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --all-targets -- -D warnings` | Pass |
| `cargo test` | 312 passed, 12 ignored (no database) |
| `cargo test` with `DATABASE_URL` | 329 passed — all 13 database-backed tests execute and pass |
| `bun run lint` | 0 errors, 76 warnings |
| `bun run typecheck` | Pass |
| `bun run test` | 126 files, 2,103 tests passed |
| Playwright `--list` | 21 tests compile |

The 76 ESLint warnings are pre-existing (`no-explicit-any`, unused directives). They are not introduced by this work and are tracked as a cleanup item rather than suppressed.

---

## 2. Backend findings fixed

IDs are consolidated for this report; the detailed backend input is retained in `docs/audit/backend-architecture-audit.md`. That file predates the fixes and is useful as a historical snapshot, not as current status.

### B1 — Owner identifiers leaked in API payloads

`TrackDetail` serialized `session_id` and `user_id`, exposing anonymous and authenticated owner IDs to any reader. `Poi` also serialized `session_id`.

**Fix:** Both fields are now `#[serde(skip_serializing)]`. `TrackDetail` exposes `is_public` and a request-scoped `is_owner` boolean instead. The frontend uses `is_owner`, never a client-side comparison of owner IDs.

**Evidence:** `backend/src/models.rs:104-113`, `backend/src/models.rs:627`; `frontend/src/types/index.ts`.

### B2 — Private tracks readable and exportable by ID

`GET /api/tracks/{id}`, `GET /api/tracks/{id}/simplified`, export endpoints, and the slope profile could return a private track to anyone who knew its UUID.

**Fix:** A shared visibility check (`ensure_track_visible`) returns the track only when it is public or the caller owns it. Non-owners receive `NotFound`, not `Forbidden`, so private IDs cannot be probed for existence. Detail reads compute `is_owner` per request.

**Evidence:** `backend/src/handlers/util.rs`, `backend/src/handlers/tracks/detail.rs:70-90`, `backend/src/handlers/tracks/export.rs:42`.

### B3 — Any caller could duplicate a track

The duplicate endpoint copied any track by ID without checking whether the caller could see the source.

**Fix:** `duplicate_track` now calls `ensure_track_visible` before copying.

**Evidence:** `backend/src/handlers/tracks/editor.rs:72-89`.

### B4 — Owner filters trusted client query parameters

`owner_user_id` and `owner_session_id` were accepted from the query string. A caller could ask for another identity's private tracks.

**Fix:** Both parameters are ignored on input. `bind_owner_filter` binds ownership exclusively from the verified JWT identity or the `x-session-id` header. The JWT wins; a forged session header cannot override an authenticated identity. `mine=true` filters to the caller's own tracks; without it, the caller sees their private tracks plus all public tracks.

**Evidence:** `backend/src/handlers/tracks/list.rs:57-82`, `backend/src/db/tracks/queries.rs:12-46`.

### B5 — Unauthenticated enrichment and slope mutation; uncapped elevation preview

Elevation enrichment and slope recalculation could mutate a track without proving ownership. The elevation preview accepted an unbounded point list.

**Fix:** Both mutations call `verify_track_owner`. The preview is capped at 5,000 points and validates coordinate shape before processing.

**Evidence:** `backend/src/handlers/tracks/elevation.rs:24-28`, `backend/src/handlers/tracks/elevation.rs:40-44`, `backend/src/handlers/tracks/slope.rs:69`.

### B6 — Editor routes registered regardless of feature flag

`FEATURE_EDITOR` hid the UI but left `/api/tracks/create`, `/{id}/geometry`, `/{id}/duplicate`, and `/{id}/publish` reachable.

**Fix:** Router construction is now mutable and editor routes are registered only when `editor_enabled` is true.

**Evidence:** `backend/src/main.rs:119-122`, `backend/src/main.rs:181-193`.

### B7 — Duplicate editor geometry returned 500

A unique-constraint violation from `track_exists`/insert surfaced as a database error instead of a domain conflict.

**Fix:** Editor create and update pre-check the geometry hash and map SQLSTATE `23505` to `AppError::DuplicateTrack`, which serializes as HTTP 409 with the existing track ID when available.

**Evidence:** `backend/src/services/track_editor.rs:134-141`, `backend/src/services/track_editor.rs:244-251`, `backend/src/services/track_editor.rs:317-318`.

### B8 — Track updates skipped name/description validation

Metadata updates accepted empty or oversized values that upload and editor paths already rejected.

**Fix:** Update handlers validate name and description through the shared validation helpers before writing.

**Evidence:** `backend/src/handlers/tracks/update.rs`.

### B9 — POI mutation authorization gaps

POI update, delete, and unlink accepted requests without proving ownership. Unowned legacy POIs had no clear authorization rule.

**Fix:** `verify_poi_access` requires a matching session for owned POIs. For unowned legacy POIs it requires ownership of at least one linked track. Unlinking requires track ownership. POI creation now requires a `session_id` from the body or the `x-session-id` header.

**Evidence:** `backend/src/handlers/pois.rs:50-80`, `backend/src/handlers/pois.rs:190-196`.

### B10 — POI list ignored filters and returned a global total

`GET /api/pois` accepted `bbox`, `track_id`, `categories`, and `search` but only some were applied; the total count ignored filters entirely.

**Fix:** A single `PoiFilter` value drives both `list_filtered` and `count_filtered`, so pagination and totals describe the same result set.

**Evidence:** `backend/src/db/pois.rs:14`, `backend/src/db/pois.rs:80-128`, `backend/src/handlers/pois.rs:106-114`.

### B11 — `simplify-preview` discarded its own work

The handler computed simplified segments, waypoints, and stats, then returned none of them.

**Fix:** The response now contains the simplified waypoints and the full stats object, including `tolerance_used`.

**Evidence:** `backend/src/handlers/tracks/geometry.rs:18-42`.

### B12 — `/api/tracks` was unbounded

A dense viewport could return every stored track and exhaust memory.

**Fix:** The GeoJSON query applies `ORDER BY created_at DESC LIMIT` with `TRACK_LIST_MAX_RESULTS` (default 5,000, clamped to 1–20,000).

**Evidence:** `backend/src/db/tracks/queries.rs:155-165`, `backend/src/db/tracks/queries.rs:239-240`.

### B13 — Debug endpoint always registered

`/debug/background_task` was registered unconditionally despite a comment claiming feature-flag protection.

**Fix:** It is registered only when `DEBUG_ENDPOINTS=true`.

**Evidence:** `backend/src/main.rs:122-125`, `backend/src/main.rs:262-267`.

### B14 — Dead service/repository abstraction layer

`TrackService`, `PostgresTrackService`, `TrackRepository`, and `PostgresTrackRepository` were compiled but never constructed. Their implementations were also lossy: one dropped geometry hash, waypoints, POIs, and session ID; another ignored the user ID. Wiring them later would have silently lost data.

**Fix:** Deleted the entire `backend/src/repositories/` tree, both service implementations, and the related exports in `lib.rs` and `services.rs`.

### B15 — Raw SQL in the upload path

`track_upload.rs` embedded an ownership lookup directly in business logic.

**Fix:** The lookup now uses `db::get_track_visibility`, keeping SQL inside `db::*`.

**Evidence:** `backend/src/track_upload.rs:107-111`.

### B16 — Dead file-hash utility

`track_utils/hash.rs` had no production or test consumer. Track identity uses a SHA-256 hash of normalized geometry, not file bytes.

**Fix:** Deleted `hash.rs` and its module/re-export entries.

### B17 — Duplicated bulk validation

Bulk visibility and bulk delete repeated identical empty-list and size guards.

**Fix:** Extracted `bulk_request_is_empty` and reused it in both handlers.

**Evidence:** `backend/src/handlers/tracks/update.rs:258-280`.

### B18 — Unbounded search input and LIKE wildcard semantics

Search accepted arbitrary-length input, and `%`/`_` acted as SQL `LIKE` wildcards.

**Fix:** Search queries are capped at 200 characters and matched with `POSITION` against lowercase text, so wildcard characters are literal. Results remain limited to 50 public tracks.

**Evidence:** `backend/src/handlers/tracks/search.rs:30-37`, `backend/src/db/tracks/queries.rs:448-477`.

### B19 — Authenticated uploads were persisted as anonymous

The upload handler never extracted the auth identity, and `insert_track` wrote only `session_id`. A logged-in uploader's track was missing from account and `mine=true` listings; after ownership moved to the server-provided `is_owner` flag, the uploader could not open the private track because authenticated checks read `user_id` only.

**Fix:** The upload handler extracts `OptionalAuthUser`. Authenticated uploads persist `user_id` and discard the body-supplied session id; anonymous uploads keep session ownership. Duplicate detection and editor create/duplicate use the same precedence, so a new track never has two owners.

**Evidence:** `backend/src/handlers/tracks/upload.rs:41-43`, `backend/src/handlers/tracks/upload.rs:123`, `backend/src/db/tracks/crud.rs:57-96`, `backend/src/db/tracks/crud.rs:154-198`, `backend/src/services/track_editor.rs:99-102`.

### B20 — Editor identity protocol and duplicate-hash handling were brittle

A dedicated code review of this diff found three follow-on defects in the editor path, all fixed:

1. **`duplicate_track` read the session header only.** The editor client sends the anonymous session in the JSON body, so an anonymous owner duplicating a private track got a 404. The handler now accepts either (`session_id_from_headers(&headers).or(request.session_id)`).
2. **Concurrent `create_track` with the same `request_id` could fail.** Two simultaneous creates raced the insert; the loser returned a 409 instead of converging. The insert error path now re-reads the row and returns the winner's identity as an idempotent success when the caller owns it.
3. **The `update_track_geometry` duplicate check rejected edits the database accepts.** The `UPDATE` rewrites `hash` only for plain, non-recorded tracks, but the pre-check compared hashes unconditionally — re-saving a duplicate (whose `dup_*` hash is preserved) was wrongly rejected as a duplicate of the original. The conflicting track is now resolved from the write result instead.

**Evidence:** `backend/src/handlers/tracks/editor.rs:86-87`, `backend/src/services/track_editor.rs:177-206`, `backend/src/services/track_editor.rs:272-312`.

### B21 — New authorization and SQL paths had no coverage

The review flagged that `bind_owner_filter`, `parse_bbox`, `verify_poi_access`, `list_filtered`/`count_filtered`, and `editor_write_error` shipped without tests, and that three `#[ignore]`d database tests were empty placeholders.

**Fix:** `bind_owner_filter` gained three unit tests pinning the spoofing-precedence rules; `parse_bbox` gained four (valid, wrong arity, non-finite/non-numeric, inverted); `verify_poi_access` gained two database-backed tests (owner passes, foreign session and header-less caller rejected, unowned POI requires a track-owning identity); `list_filtered`/`count_filtered` gained two database-backed tests covering search, bbox, category, and track-link branches; the two meaningful placeholders were implemented as real database tests (`test_owner_filter_in_list_tracks_geojson`, `test_elevation_filters_in_list_tracks_geojson`) and the vacuous performance placeholder was deleted. A new database test pins the duplicate-geometry 409 carrying the existing track id.

**Evidence:** `backend/src/handlers/tracks/list.rs:135-234`, `backend/src/handlers/pois.rs:279-410`, `backend/src/db/pois.rs:429-683`, `backend/src/db/tracks/tests.rs:393-616`, `backend/src/services/track_editor.rs:765-820`.

---

## 3. Frontend findings fixed

### F1 — Event bus returned no usable unsubscribe

`events.on()` returned `void`, so callers could not release a listener without keeping a reference to the callback. `TrackDetailPanel` and `HomeView` already called `events.off`, but `TrackView` needed a cleanup handle.

**Fix:** `on()` now returns an unsubscribe closure. `TrackView` stores and invokes it on unmount/deactivation.

**Evidence:** `frontend/src/events.ts`, `frontend/src/views/TrackView.vue:231`, `frontend/src/views/TrackView.vue:998`.

### F2 — `router.afterEach` leaked on every mount

`ElevationChart` registered a global router hook and never removed it.

**Fix:** The unregister function is stored and called in `onBeforeUnmount`.

**Evidence:** `frontend/src/components/ElevationChart.vue:1320`.

### F3 — Viewport fetches ignored active filters and raced

`useTracks` fetched bounding-box and heatmap data without the active category/length/elevation/slope filters, cached both by bounds alone, and did not send the session header. That produced stale or incorrect map contents after filter changes and omitted the caller's own private tracks.

**Fix:** Bbox and heatmap requests now include every filter, both cache keys include filters, session id, and the current auth identity (user id, falling back to the access token), and requests send `x-session-id`. "My tracks" is expressed as `mine=true` with the identity header, not `owner_session_id`; post-upload refreshes reuse the active filters.

**Evidence:** `frontend/src/composables/useTracks.ts:104-128`, `frontend/src/composables/useTracks.ts:166-214`, `frontend/src/composables/useTracks.ts:216-270`.

### F4 — Ownership was inferred from client-side IDs

`TrackView` compared `track.session_id`/`user_id` with local session/user state. Once the backend stopped serializing owner IDs, this was both broken and unnecessary.

**Fix:** Ownership now trusts the server-provided `is_owner` flag only. The editor persistence layer does the same.

**Evidence:** `frontend/src/views/TrackView.vue:449`, `frontend/src/composables/editor/useTrackPersistence.ts:270`.

### F5 — Unguarded `localStorage`

Several production paths read or wrote `localStorage` without handling blocked storage or quota errors.

**Fix:** Guarded the filter-control reads and writes, including reset and watcher persistence. Existing guarded paths (`useDraftSave`, `useMapState`, `session.ts`, units store) were verified.

**Evidence:** `frontend/src/components/TrackFilterControl.vue:547-617`, `frontend/src/components/TrackFilterControl.vue:666-810`.

### F6 — Dead `TrackEditorBottomDeck`

The component and its test were never wired into the current editor shell.

**Fix:** Deleted the component and its 190-line test, and removed the stub/registration from `TrackEditorView.test.ts`.

### F7 — Stale E2E assertions for the old layout

The Playwright editor spec asserted a right inspector and bottom deck that no longer exist.

**Fix:** Assertions now target `editor-left-panel` and `track-editor-inspector`, and verify the inspector sits inside the left panel.

**Evidence:** `frontend/e2e/track-editor.spec.ts:36-45`, `frontend/e2e/track-editor.spec.ts:86-148`.

### F8 — Test setup swallowed component errors

The Vue `errorHandler` ignored errors, hiding real defects behind green runs. Removing the suppression exposed two latent defects and one outdated mock, all fixed:

- `HomeView.mapPersistence` mocked a debounce without `.cancel`.
- `useTrackEditor` mocks still supplied `session_id` instead of `is_owner`.
- `trackFilter` assumed every caller supplied all filter ranges.

**Fix:** `errorHandler` now rethrows. The mock and filter-state assumptions were corrected. The legacy `TrackEditorMap.trace.test.js` also mocks `@vue-leaflet/vue-leaflet`, preventing Node from trying to load Leaflet marker PNGs.

**Evidence:** `frontend/src/test-setup.ts:357-359`, `frontend/src/utils/trackFilter.ts:94-120`.

### F9 — Child components mutated props

`TrackDetailPanel` wrote directly to `props.track.distance_markers_enabled` and `props.track.categories`, mutating parent state outside the event contract.

**Fix:** The panel updates its local `track` copy and emits the existing events. `TrackView` handles `categories-updated` and replaces its shallow ref immutably. Name/description handlers were changed to replace the object instead of mutating it, so shallow-ref reactivity works.

**Evidence:** `frontend/src/components/TrackDetailPanel.vue:793-825`, `frontend/src/views/TrackView.vue:800-830`.

### F10 — Keep-alive double subscription

`TrackView` subscribed to `track-elevation-updated` in both `onMounted` and `onActivated`. Vue keep-alive fires both on first render, so the first unsubscribe handle was overwritten and its listener leaked.

**Fix:** A single `subscribeElevationUpdates()` helper unsubscribes before subscribing and is used in both hooks.

**Evidence:** `frontend/src/views/TrackView.vue:790-800`, `frontend/src/views/TrackView.vue:988-1020`.

### F11 — Latent filter-state crash

`trackFilter.matchesAll` dereferenced `lengthRange`/`elevationGainRange` unconditionally. The test harness had been hiding the resulting exception. Defensive defaults now treat missing ranges as unbounded and missing categories as empty.

**Evidence:** `frontend/src/utils/trackFilter.ts:36-120`.

### F12 — Legacy trace test failed on Leaflet assets

`test/components/TrackEditorMap.trace.test.js` imported the real `@vue-leaflet` package, whose icon reset dynamically imports PNGs that Node's ESM loader cannot read. This produced unhandled rejections even when the test body passed.

**Fix:** The test now mocks the package with the same lightweight components used by the canonical test.

### F13 — Private-track reads failed for anonymous session owners

The review of this diff found three frontend call sites that hit newly restricted endpoints without the `x-session-id` header, so an anonymous owner's private track rendered as if empty: POI loading on the track view (`usePois.fetchTrackPois`), POI loading in the editor (`useTrackPersistence.loadTrackPois`), and both elevation-enrichment background fetches (`useElevationEnrichment`).

**Fix:** All four requests now send `sessionHeaders(getSessionId())`, matching the pattern already used by the track list and detail fetches. Regression tests assert the header on each path.

**Evidence:** `frontend/src/composables/usePois.ts:32-34`, `frontend/src/composables/editor/useTrackPersistence.ts:229-231`, `frontend/src/composables/useElevationEnrichment.ts:168-171`, `frontend/src/composables/useElevationEnrichment.ts:342-346`.

---

## 4. Remaining findings

These were verified but not changed, either because they require a product/security decision or because they are structural work with a larger blast radius.

### Strong — should be scheduled

| ID | Finding | Why it matters | Recommendation |
|---|---|---|---|
| R1 | OAuth `state` is generated and returned to the client, but the callback never verifies it | A forged callback can bypass CSRF protection; the current flow is documented as “simplified” | Store `state` in a short-lived HttpOnly cookie (or server session) and verify it on callback. This is an auth-flow change, so it needs a deliberate rollout. |
| R2 | 13 database-backed tests are `#[ignore]`d and CI runs `cargo test` without a database | The highest-value integration paths (ownership SQL, track CRUD, editor round-trip, duplicate handling) never execute in CI. All 13 now contain real assertions and were verified green locally against Postgres, so the only gap left is CI wiring | Add a Postgres service job (or extend the existing E2E job) that runs `cargo test -- --ignored` with `DATABASE_URL` set. |
| R3 | `@ts-nocheck` remains in 8 production files, including `HomeView.vue`, `TrackView.vue`, `ElevationChart.vue`, and `AuthCallbackView.vue` | Type errors in the most complex views are invisible to `vue-tsc`; the audit’s rethrow change already exposed latent defects | Remove one file at a time, starting with `HomeView` and `TrackView`, adding types at the Leaflet/component boundary. |
| R4 | `extract_client_ip_from_headers` trusts the first `X-Forwarded-For` value | Rate limiting and suspicious-activity checks can be spoofed unless the app is behind a trusted proxy | Make proxy trust explicit via configuration; otherwise prefer the socket peer address. |
| R5 | Playwright E2E runs only when a PR has the `run-e2e` label | Editor/layout regressions can merge without browser coverage | Keep the label for cost control, but run a small smoke subset unconditionally. |
| R6 | Draft/publish flow is dormant | The frontend always sends `is_draft: false`; nothing calls `POST /api/tracks/{id}/publish` | Either add a publish action and draft list, or remove the endpoint and `is_draft` surface. Decide before more editor work depends on it. |
| R7 | Account-owned tracks can retain a second, anonymous owner | `migrate_session_tracks` sets `user_id` but leaves `session_id`; anonymous ownership checks accept that session even when a `user_id` exists, and POIs keep their session owner. New track writes discard the session for authenticated requests, but existing rows and editor POIs created before this change still carry both. | Decide whether session ownership should survive account migration. If not, clear `session_id` in the migration and reject anonymous session ownership when `user_id` is present; migrate existing POIs the same way. |

### Worth exploring

| ID | Finding | Notes |
|---|---|---|
| R8 | Monolithic frontend components | `TrackDetailPanel.vue` 3,577 lines, `TrackEditorMap.vue` 1,722, `ElevationChart.vue` 1,569, `HomeView.vue` 1,198, `TrackView.vue` 1,175. Extract panel sections and chart lifecycle into composables; do it opportunistically when touching each file. |
| R9 | Split HTTP/auth paths | Most API calls use `http-instance.ts`, but `auth/profile.ts`, `auth/refresh.ts`, and `auth/oauth-client.ts` call `fetch` directly. Some duplication is justified by token-bootstrap cycles; document the boundary or consolidate profile calls. |
| R10 | Large backend modules | `slope.rs` 1,124 lines, `elevation_enrichment.rs` 1,080, `gpx_parser.rs` 963, `pace_filter.rs` 820. Not violations, but split parsing/computation/aggregation when next touched. |
| R11 | Inline SQL in `poi_deduplication.rs` | Specialized service still embeds SQL, unlike `db::pois`. Move it when the dedup logic changes. |
| R12 | Inconsistent pool handle types | `db::*` uses `Arc<PgPool>`, some services take `&PgPool`. Cosmetic; standardize when adding new DB functions. |
| R13 | `TrackEditorToolbar.vue` remains on disk | Deliberately retained by ADR 0041, not dangling by accident. Revisit that ADR before deleting. |

---

## 5. Dangling and unwired functionality

### `docs/superpowers/plans/` no longer exists

The directory was deleted in commit `3d0b261`; only `docs/superpowers/specs/2026-03-18-track-editor-ui-redesign-design.md` survives. Five documents still pointed at the deleted path:

- `.agents/prompts/refactoring-request.prompt.md`
- `docs/adr/0034-editor-shell-layout.md`
- `.commandcode/taste/taste.md`
- two generated `.commandcode/taste/*/taste.md` entries

All now point at the surviving `docs/` artifacts (`docs/superpowers/specs/`, `docs/adr/`, `docs/audit/`) or state explicitly that the plans directory was removed.

### ADR 0034 is superseded

ADR 0034 described a bottom deck and a standalone right inspector. The bottom deck was deleted, and the current inspector is nested in the left panel. The ADR is now marked **Superseded** by `docs/audit/2026-10-04-design-mitigation-plan.md`, while preserving its historical context.

### Draft/publish path

The backend supports drafts (`is_draft`) and a publish endpoint; the frontend always creates published tracks. This is a complete backend feature with no UI entry point. It is listed as R6 rather than deleted, because removing it is a product decision.

### Backend audit artifact

`docs/audit/backend-architecture-audit.md` was an untracked input to this audit. Its findings are incorporated here; it is retained as a historical backend snapshot rather than as a second source of truth.

---

## 6. Architecture assessment

### What is healthy

- **Backend layering:** handlers → `db::*` / `services::*`, one `AppError`, localized `IntoResponse`, no SQL string concatenation with user input. The dead repository/service layer was the main violation and is gone.
- **Ownership model:** JWT first, anonymous session second. Private reads return `NotFound`; list queries bind identity server-side; POI mutations have an explicit authorization helper.
- **Frontend data flow:** `http-instance.ts` centralizes auth headers; composables own fetching; Leaflet is isolated behind map components; tests are behavior-oriented.
- **Test depth:** 2,103 frontend tests and 329 backend tests cover parsing, geometry, filtering, editor state, error mapping, and ownership SQL. All 13 database-backed tests were executed against the local Postgres and pass; the failures exposed by removing the test error handler show the suite can now catch real component errors.

### What still limits maintainability

- **Frontend component size** is the largest structural risk. `TrackDetailPanel` and `ElevationChart` combine rendering, chart lifecycle, map interaction, export, and polling.
- **`@ts-nocheck` in core views** removes the safety net exactly where component contracts are most complex.
- **Database integration coverage is not enforced** by CI, so schema and ownership SQL can regress silently.
- **Auth flow simplification** is documented but is still a production security gap.

---

## 7. Verification

Backend, from `backend/`:

```text
cargo fmt --all -- --check                  pass
cargo clippy --all-targets -- -D warnings   pass
cargo test                                  312 passed, 12 ignored (no database)
DATABASE_URL=... cargo test                 316 passed, 13 ignored
DATABASE_URL=... cargo test -- --ignored    13 passed  (the ignored set above)
```

Every test that touches the database was executed against the running Postgres on `:5432`; the three empty `#[ignore]`d placeholders found in review were implemented or removed, so the ignored set now contains only real assertions.

Frontend, from `frontend/`:

```text
bun run lint        0 errors, 76 warnings
bun run typecheck   pass
bun run test        126 files, 2,103 tests passed
bunx playwright test e2e/track-editor.spec.ts --list   21 tests listed
```

Playwright was not executed because `http://localhost:81` was not listening. The backend on `:8080` and Postgres on `:5432` were reachable. The spec compiles and all 21 tests were discovered; run `bun run test:e2e` after starting the frontend to execute them.

---

## 8. Recommended sequence

1. **Decide and implement the OAuth state/PKCE fix** (R1). This is the only remaining security finding that needs an auth-flow design.
2. **Run DB-backed tests in CI** (R2). Extend the Postgres job with `cargo test -- --ignored`; keep the E2E label gate for browser cost.
3. **Remove `@ts-nocheck` from `HomeView` and `TrackView`** (R3). Fix the boundary types first; the rest of the file will follow.
4. **Resolve the draft/publish product question** (R6). Either ship the UI or delete the dormant surface.
5. **Decompose `TrackDetailPanel` and `ElevationChart`** (R8) when those files are next modified.
6. **Run the full Playwright suite** once the frontend is up, then keep a smoke subset in CI (R5).

---

## Appendix — changed areas

| Area | Files |
|---|---|
| Backend ownership/visibility | `models.rs`, `handlers/util.rs`, `handlers/tracks/{detail,export,elevation,slope,list}.rs`, `db/tracks/{crud,queries}.rs` |
| Backend editor/POI | `handlers/tracks/{editor,geometry,update}.rs`, `handlers/pois.rs`, `db/pois.rs`, `services/track_editor.rs` |
| Backend dead code | `repositories/**`, `services/{track_service,postgres_track_service}.rs`, `track_utils/hash.rs` |
| Backend routing/security | `main.rs`, `handlers/tracks/search.rs`, `track_upload.rs` |
| Frontend data flow | `composables/useTracks.ts`, `views/HomeView.vue`, `views/TrackView.vue`, `composables/editor/useTrackPersistence.ts`, `composables/useTrackEditor.ts`, `types/index.ts` |
| Frontend lifecycle/storage | `events.ts`, `components/ElevationChart.vue`, `components/TrackDetailPanel.vue`, `components/TrackFilterControl.vue`, `utils/trackFilter.ts` |
| Frontend tests | `test-setup.ts`, `e2e/track-editor.spec.ts`, editor/track tests, legacy trace test |
| Documentation | `docs/adr/0034-editor-shell-layout.md`, `.agents/prompts/refactoring-request.prompt.md`, `.commandcode/taste/**` |
