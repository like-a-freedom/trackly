# ADR-0041: Delete the Unused Track Metadata Editing Composable

## Status
Accepted

## Context
`composables/useTrackMetadataEditing.ts` (62 LOC) exposed a `MetadataEditingState` interface
plus `useTrackMetadataEditing()`: edit flags for a track's name and description, the draft
values, start/stop helpers and `hasNameChanged`/`hasDescriptionChanged` guards.

The composable has zero consumers. It is imported nowhere in `src/`, the unit suite
(`src/**/__tests__`, `frontend/test/`) or the Playwright suite; no document, plan or backlog
entry mentions it. It arrived with the TypeScript migration (`3d0b261`) and was never wired.

The behaviour it models already lives inline in `TrackDetailPanel.vue`, which owns
`isEditingName`/`isEditingDescription`, the draft values, and the start/stop transitions for
both fields. ADR 0033 decided that this editing "stay[s] inline": it is driven by the panel's
own chrome (header buttons, download link), so extracting it would add an interface without
removing a reason to change. Adopting the composable would therefore mean refactoring a
3.5k-LOC component to reach the same behaviour it already has.

## Decision
Delete `composables/useTrackMetadataEditing.ts`.

## Consequences
- 62 LOC of dead code removed; one unreachable abstraction cannot be mistaken for the owner
  of name/description editing
- `TrackDetailPanel.vue` remains the single owner of inline metadata editing, as ADR 0033
  intends
- `TrackEditorToolbar.vue` is deliberately *not* part of this deletion: ADR 0034 keeps it on
  disk as unused reference (the layouts that replaced it are TopBar + LeftRail). Only that
  ADR's stale claim about a retained test is corrected separately
