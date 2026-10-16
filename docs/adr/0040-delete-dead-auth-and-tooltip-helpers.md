# ADR-0040: Delete Dead Frontend Auth and Tooltip Helpers

## Status
Accepted

## Context
Two pieces of frontend code had no production consumers:

1. `composables/useIconTooltips.ts` (58 LOC) exposed a click-to-toggle tooltip
   (`activeTooltipId`, `showTooltip`/`hideTooltip`/`toggleTooltip`/`isVisible`) plus a
   document-level click-outside handler keyed on `.info-icon` and `.tooltip-content`.
   Nothing imported it — not components, views, composables, the unit suite, or the
   Playwright suite. Its markup contract is also absent: the only tooltips in the app are
   `.info-icon[data-tooltip]` nodes rendered by `TrackDetailPanel.vue`, which are driven by
   CSS (`:hover`, `:focus-visible`) and positioned by `useTooltipPlacement` (ADR 0033).
   There is no `.tooltip-content` element anywhere in the codebase.
2. `stores/auth.ts` exposed `getAuthHeader()` and `authFetch()` (also re-exported by the
   `useAuth` facade). ADR 0018 centralized auth-header injection in `http()`, leaving both
   with zero production call sites; the same ADR recorded them as candidates for deletion.
   The remaining reference was the mock shape in `useTrackEditor.test.ts`, which the
   composable never used.

## Decision
Delete `composables/useIconTooltips.ts`, and delete `getAuthHeader` and `authFetch` from
both the auth store and the `useAuth` facade.

## Consequences
- ~75 LOC of dead code removed; two dead test cases and a dead mock key removed with them
- `http()` (ADR 0018) is now the single request path: no parallel auth-fetch helper remains
  that a new call site could accidentally use and thereby bypass logging/refresh handling
- Tooltip behaviour has one owner (`useTooltipPlacement` + CSS); the abandoned click-toggle
  model cannot come back through a leftover export
- Touch behaviour of the info tooltips (they show on `touchstart` and hide on blur/leave) is
  unaffected and remains a separate question from this deletion
