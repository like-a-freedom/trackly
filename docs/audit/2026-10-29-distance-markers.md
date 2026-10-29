# Distance markers: personal map display

## Current contract

Distance markers are a browser-local display preference, available to owners and
visitors. They default to on and apply across viewed tracks through the Pinia
`mapDisplay` store. `localStorage` key `trackly_distance_markers` retains the
choice; only the stored string `false` disables it. Toggling changes the local
view immediately and performs no API write. The track's legacy
`distance_markers_enabled` field does not determine this view preference.

The compact switch lives under **Map display** in track statistics. Its adjacent
information button opens on click or focus, displays **Only in this browser.**,
and dismisses on blur or Escape. Escape is contained so dismissing the hint does
not leave the track. Both controls describe the same preference to assistive
technology. When storage cannot be read or written, the control remains usable
and the hint becomes **For this visit only. Browser storage is unavailable.**

Markers follow all recorded segments with continuous accumulated distance.
Gaps contribute no distance and receive no interpolated markers. Zoom-dependent intervals keep labels available at overview scales; short routes
use a suitable smaller interval. Rendering is capped at 100 markers, with a
minimum track length of 100m.
Direction arrows, endpoints and gap overlays keep their existing behavior.

## Incumbent design compliance and drift

The control preserves the current track-details composition from `PRODUCT.md`
and `DESIGN.md`: a compact section within the bottom panel, system typography,
neutral text and blue selection. It uses shared `ink`, `muted`, `surface`,
`action` and `focus-ring` tokens; the switch and information button retain 44px
hit areas, visible keyboard focus and textual state semantics.

Material documentation drift predates this change: `DESIGN.md` frontmatter
records hex colors while the incumbent canonical values in
`frontend/src/styles/design-system.css` use OKLCH. This audit does not refresh
`DESIGN.md` or `.impeccable/design.json`; no design-system refresh was authorized.

## Verification evidence pointers

Final focused Vitest run: five files, 111 passing tests, including Escape
non-bubbling. The full suite passed 129 files / 2136 tests before the final
hint-only event fix. Final production build and Vue type checking pass;
ESLint reports zero errors and 76 existing warnings. Final Playwright
runs pass seven cases: Chromium checks home/import/details at 1280px, 390px
and 320px plus personal markers at 1280px and 390px; WebKit checks personal
markers at 1280px and 390px.

- Implementation: `frontend/src/components/TrackDetailPanel/StatisticsPanel.vue`,
  `frontend/src/components/TrackDetailPanel.vue`, `frontend/src/views/TrackView.vue`
  and `frontend/src/stores/mapDisplay.ts` cover controls, event propagation,
  rendering and guarded local persistence.
- Geometry: `frontend/src/components/TrackDistanceMarkers.vue` passes every
  segment to `computeSegmentDistanceMarkers` in
  `frontend/src/utils/trackGeometry.ts`.
- Unit regressions: `frontend/src/stores/__tests__/mapDisplay.test.ts` covers
  defaults, restored/malformed values and read/write failures;
  `frontend/src/components/TrackDetailPanel/__tests__/StatisticsPanel.test.ts`
  covers accessible state, ownership independence and hint dismissal;
  `frontend/src/utils/__tests__/trackGeometry.test.ts` checks markers after a
  segment break without counting the gap.
- Browser regression: the distance-marker cases in
  `frontend/e2e/design-mitigation.spec.ts` cover a non-owner with a conflicting
  legacy server field, a later long segment, off/on/reload persistence, keyboard
  operation, hint placement and zero PATCH requests at 1280px and 390px.
- Review captures: `.impeccable/review/distance-markers-{1280,390}.png`,
  `distance-markers-hint-{1280,390}.png` and browser-suffixed variants. These are
  local browser evidence, not a production rollout or physical-device acceptance.
