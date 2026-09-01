# YAGNI on the inline editor: do not add a `TrackEditOverlay` to `TrackView` (stage 4b)

The audit's Candidate 8 offered 3 options: (a) delete the spec, (b) add a `TrackEditOverlay` to `TrackView`, (c) execute the editor plan. The integration in Stage 0 recovers the editor from `create-tracks` (`useTrackEditor.js` 2 340 LOC); option (c) is moot. Option (b) duplicates the editor with a thin UI for a read-only view — YAGNI. We do nothing in Stage 4b. The read-only `TrackView` stays as-is. If user research later shows a need for inline edit affordances, we revisit.
