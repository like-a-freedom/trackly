# ADR 0011: Delete POST /api/tracks/exist Route

## Status
Accepted

## Context
The `POST /api/tracks/exist` route did dedup preflight that the upload pipeline duplicates. The frontend's `UploadForm` called this route, but the backend already handles dedup during upload.

## Decision
Delete the route, handler, and route registration. Stub `checkTrackDuplicate` in `useTracks.js` to always return `{ alreadyExists: false }`. The UploadForm template contract is preserved.

## Consequences
- One fewer API endpoint
- Upload dedup remains (handled by the upload pipeline)
- Frontend stub preserves template compatibility
- 242 LOC of tests from `23de764` branch are documented but not ported (the behavior is already covered by the upload pipeline's own dedup logic)
