# Distance markers: personal map display

## Current contract

Distance markers are a browser-local display preference, available to owners and
visitors. They default to on and apply across viewed tracks through the Pinia
`mapDisplay` store. `localStorage` key `trackly_distance_markers` retains the
choice; only the stored string `false` disables it. Toggling changes the local
view immediately and performs no API write. The track's legacy
`distance_markers_enabled` field does not determine this view preference.

The compact ruler button lives in the track-actions toolbar beside sharing.
Its accessible name is **Distance markers** and `aria-pressed` exposes the
current state. An associated tooltip shown on hover, focus or tap explains
**Only in this browser.** When storage cannot be read or written, the
button remains usable and the hint becomes **For this visit only. Browser
storage is unavailable.** Statistics contains no map-display controls; the
former switch and separate information disclosure have been removed.

Markers follow all recorded segments with continuous accumulated distance.
Gaps contribute no distance and receive no interpolated markers. Zoom-dependent intervals keep labels available at overview scales; short routes
use a suitable smaller interval. Rendering is capped at 100 markers, with a
minimum track length of 100m.
Direction arrows, endpoints and gap overlays keep their existing behavior.

## Incumbent design compliance and drift

The control preserves the current track-details composition from `PRODUCT.md`
and `DESIGN.md`: a compact action within the bottom panel, neutral icon styling
and blue selection. It shares the track toolbar's button treatment and uses
the action token for its enabled state. Native button keyboard operation,
visible focus and explicit pressed-state semantics remain available.

Material documentation drift predates this change: `DESIGN.md` frontmatter
records hex colors while the incumbent canonical values in
`frontend/src/styles/design-system.css` use OKLCH. This audit does not refresh
`DESIGN.md` or `.impeccable/design.json`; no design-system refresh was authorized.

## Verification evidence pointers

The following records the earlier statistics-switch implementation, before
the toolbar relocation. Its geometry and persistence coverage remains relevant;
the disclosure-specific checks and hint captures describe the former control.

Earlier focused Vitest run: five files, 111 passing tests, including Escape
non-bubbling. The full suite passed 129 files / 2136 tests before the final
hint-only event fix. Final production build and Vue type checking pass;
ESLint reports zero errors and 76 existing warnings. Final Playwright
runs pass seven cases: Chromium checks home/import/details at 1280px, 390px
and 320px plus personal markers at 1280px and 390px; WebKit checks personal
markers at 1280px and 390px.

- Implementation: `frontend/src/components/TrackDetailPanel/DistanceMarkersButton.vue`,
  `frontend/src/components/TrackDetailPanel.vue`, `frontend/src/views/TrackView.vue`
  and `frontend/src/stores/mapDisplay.ts` cover controls, event propagation,
  rendering and guarded local persistence.
- Geometry: `frontend/src/components/TrackDistanceMarkers.vue` passes every
  segment to `computeSegmentDistanceMarkers` in
  `frontend/src/utils/trackGeometry.ts`.
- Unit regressions: `frontend/src/stores/__tests__/mapDisplay.test.ts` covers
  defaults, restored/malformed values and read/write failures;
  `frontend/src/components/TrackDetailPanel/__tests__/DistanceMarkersButton.test.ts`
  covers accessible state, toggle events and unavailable-storage guidance;
  `frontend/src/utils/__tests__/trackGeometry.test.ts` checks markers after a
  segment break without counting the gap.
- Browser regression: the distance-marker cases in
  `frontend/e2e/design-mitigation.spec.ts` cover a non-owner with a conflicting
  legacy server field, a later long segment, off/on/reload persistence, keyboard
  operation, hint placement and zero PATCH requests at 1280px and 390px.
- Review captures: `.impeccable/review/distance-markers-{1280,390}.png`,
  `distance-markers-hint-{1280,390}.png` and browser-suffixed variants. These are
  local browser evidence, not a production rollout or physical-device acceptance.

## Toolbar relocation verification

The current focused unit run passed 133 tests. WebKit and Chromium passed the updated
distance-marker browser cases at 1280px, 390px and 320px, covering the toolbar button,
absence of a Map display region, pressed state, browser-only hint with Escape dismissal, off/on/reload
persistence, keyboard Space operation, zero PATCH requests and no horizontal
overflow. The local preference store and marker geometry behavior remain
unchanged. `DESIGN.md` and `.impeccable/design.json` were not modified.

## Unified control hints

`frontend/src/components/AppHint.vue` and the globally registered `v-tooltip`
directive now own control hints across map controls, editor, upload, details,
filters and account. Control-level native titles and the former pseudo-element
tooltips were migrated; dialog and `ErrorNotice` title props retain their
content semantics. The former `useTooltipPlacement` implementation was retired.

Hints use the shared white surface, ink and line tokens, a restrained shadow,
13px text and 6px corners. A manual native popover renders in the top layer.
CSS anchor positioning flips inline/block sides to avoid viewport edges; where
anchor positioning is unavailable, a constrained centered placement is used.
This addresses the reproduced desktop overflow where a hint's right edge
reached 1323px in a 1280px viewport.

Hover, keyboard focus and tap reveal the same `role="tooltip"` content,
associated through `aria-describedby`. Only one hint is active. Pointer movement
into the hint keeps it open, and clicking the hint does not invoke its target's
action. Escape dismisses the active hint before reaching surrounding controls;
outside pointer interaction, scrolling, resizing or target removal also hides
it. Component teardown restores the target's previous anchor and descriptions
and removes listeners.

The complete unit suite passed 2150 tests and the production build passed.
The complete design-mitigation browser suite passed 16 cases in WebKit and
16 in Chromium, including desktop and mobile widths of 1280px, 390px and 320px. Updated browser assertions cover visible tooltip bounds, shared
surface styling, hint interaction, single-active behavior and dismissal.
`DESIGN.md` and `.impeccable/design.json` remain unchanged.
