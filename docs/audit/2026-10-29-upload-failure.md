# Upload failure and contextual error feedback

## Confirmed cause

`POST /api/tracks/upload` returned 500 for `БАП через терру.gpx`.
The running backend used `TRACK_MAX_GAP_METERS=500`. Splitting its 322 GPS
points produced segment sizes `[3, 1, 2, 13, 11, 270, 22]`. The singleton is
not a valid line; PostGIS rejected the insert with SQLSTATE 23514,
constraint `tracks_geom_valid`. The frontend then used the raw response body
as an exception message and rendered the JSON envelope inside the upload form.

## Remediation

- After gap splitting, remove segments that do not contain two distinct points.
  Apply the same retention mask to coordinates, elevation, HR, temperature and
  timestamps before derived measurements are calculated. Reject an entirely
  unusable GPX through the existing file-validation 400 response.
- Keep the database validity constraint. Preserve all points in drawable
  segments, including repeated samples that belong to a valid line.
- Normalize responses through `readApiError`; display only known validation
  messages and safe status-based guidance. Never display raw JSON, proxy HTML,
  database details or arbitrary browser exception messages.
- Show `ErrorNotice` beside the failed action, retain inputs, focus the upload
  notice and keep retry explicit. Upload failures do not also trigger a global
  toast. Category editing uses the same notice; track mutations use the same
  error normalization.
- Keep HTTP status, request method/path and optional error reference inside a
  closed technical disclosure. Backend 500 responses include `error_id` and
  `x-error-id`, with the same reference logged beside the underlying cause.

## Verification

- Reproduced HTTP 500 on the original GPX before the parser change. Afterward,
  the same file returns 201 and persists six valid segments, 321 coordinates
  and 321 elevation samples. The acceptance fixture was removed afterward.
- Added parser regression tests for singleton/stationary segments, rejection
  of unusable tracks and aligned measurement arrays. Added an error-envelope
  test for a safe, traceable reference.
- The opt-in HTTP/PostGIS test `backend/tests/upload_geometry.rs` passes: it
  exercises the real upload handler, checks `ST_IsValid` and array lengths,
  verifies 400 for unusable tracks and removes its fixtures.
- Full frontend suite: 2128 passing. Backend library suite: 314 passing,
  12 existing opt-in tests ignored. Production frontend build, targeted ESLint,
  rustfmt and backend Clippy pass.
- Agent-browser with installed Google Chrome: simulated 500, opened technical
  details, resized to 393px, retried the same original file against the real
  backend, opened the resulting track and deleted that acceptance fixture.
- Playwright: four scenarios each in Chrome and WebKit at 1280px and 393px;
  all eight pass. Covers 500/502 feedback, retained input, retry, focus,
  diagnostics, horizontal overflow and an axe audit of the upload form.

The local frontend and updated native backend remain available on ports 81 and
8080. This evidence describes the local build and browser automation, not a
production rollout or a new physical iPhone acceptance run.
