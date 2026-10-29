# Category tags: shared view and edit treatment

## Current contract

Manual categories retain the incumbent compact pale-blue tags with blue text.
Automatic classifications retain purple tags under their separate heading.
`track-tag` owns the shared display shape, spacing and typography;
`track-tag-auto` supplies the automatic-classification colors. Tags have 6px
corners, 4px vertical / 12px horizontal padding and 14px medium text.

The shared `TrackCategoryPicker` defaults to wrapping checkbox chips in upload,
the editor description form and track details. `track-tag-option` also styles
category filters. Selected options use the same blue wash with a blue border;
unchecked options use a white surface and neutral border. Native checkboxes
communicate selection, with visible keyboard focus and a 44px minimum height.

Track details initially show tags. Owners enter editing through **Edit
categories**, then explicitly save or cancel. Cancel restores saved categories
without a write; saving disables controls and preserves contextual error
feedback on failure. Visitors see the read-only tags. Tooltips use the same
display primitive. Existing category validation and stored custom values remain
supported by the picker. Entering edit mode focuses the first checkbox; saving
or cancelling returns focus to **Edit categories**.

## Design compliance and scope

This preserves the map workspace, compact system typography and existing blue
category identity described by the incumbent implementation. Purple continues
to communicate automatic classification rather than manual selection. The
change centralizes the repeated tag treatment without changing surrounding
pane composition or adding category creation controls.

`PRODUCT.md` and `DESIGN.md` were reviewed. Existing documentation drift remains
outside this task: no refresh of `DESIGN.md` or `.impeccable/design.json` is
included.

## Verification evidence

The two focused Chromium Playwright cases passed at viewport widths of 1280px
and 390px. They check read-only tags, six edit choices, enabled save after a
change, 44px option height, cancellation and no page overflow. The four reviewed
captures show compact view tags and wrapping edit chips:
`.impeccable/review/categories-{view,edit}-{1280,390}.png`.

Evidence sources are `frontend/e2e/design-mitigation.spec.ts`,
`frontend/src/components/__tests__/TrackCategoryPicker.test.ts` and
`frontend/src/components/TrackDetailPanel/__tests__/CategoriesPanel.test.ts`.
The shared primitives live in `frontend/src/styles/design-system.css`; their
call sites cover upload, editor, details, tooltip and category filters. These
captures cover the details section; the other call sites were inspected in
source. Full-suite and production-build results are tracked separately from
this focused browser evidence: Vitest passed 129 files / 2147 tests; production
build and Vue type checking passed; ESLint reported zero errors and 76 existing
warnings. Five WebKit browser cases also passed, including home, import and
details checks at 320px, 390px and 1280px. After the keyboard-focus follow-up,
all seven focused CategoriesPanel unit tests passed; both final WebKit cases also passed with explicit focus assertions at 390px
and 1280px.

## Final action-layout correction

The final details controls use the shared button primitives: `ui-primary` for
**Save categories** and `ui-secondary` for **Cancel**. The pencil edit action
uses the same secondary primitive and sits 12px after the Categories label within the
legend, with an accessible **Edit categories** name. The picker's
heading-action slot keeps this header at least 44px high. The section uses a
16px vertical gap; Save and Cancel have equal 44px heights and a 12px gap.

The updated four captures listed above were visually inspected at 1280px and
390px. They confirm the edit action beside the heading, shared action styling and wrapped
mobile options. Final verification passed 134 focused unit tests, production
build, Vue type checking and both category cases in WebKit and Chromium. The browser cases
assert shared button classes, edit-action proximity to the heading, equal action heights,
12px action spacing and keyboard focus transitions. The earlier full-suite
result remains evidence from before this final action-layout correction. The
final review of all four captures passed with no outstanding findings.

The edit action stays beside the Categories label at every viewport width, rather
than following the far edge of the full-width panel. A browser assertion checks
the 12px label-to-button gap at 390px and 1280px.

## Shared action component

`frontend/src/components/TrackActionButton.vue` now owns the actual button
component used by name, description and category editing in track details,
upload submission and the editor's Save action. It selects Lucide Pencil,
Check, X and Upload icons by action and LoaderCircle while loading. Save and
Upload use `ui-primary`; Edit and Cancel use `ui-secondary`. The shared
component keeps 44px controls, 14px text, an 8px icon-to-label gap and a 44px
square icon-only Edit action with an accessible name. Legacy detail-button
styling was removed so these uses share the same component treatment.

Loading disables the button, exposes `aria-busy` and replaces its icon with a
spinner; reduced-motion preferences suppress spinner animation. Upload retains
native submit semantics. Context-specific labels, validation and handlers remain
at their call sites.

The updated `name-actions-{1280,390}.png`,
`description-actions-{1280,390}.png` and four category captures in
`.impeccable/review/` were visually inspected. The name, description and category
forms show matching Save/Cancel icons, styling and dimensions at both widths.
The full existing suite passed 2147 tests; all six new shared-component tests
passed, including action variants, loading state and upload submit semantics.
Production build and Vue type checking passed; ESLint reported zero errors and
76 existing warnings. Final WebKit acceptance passed all eight cases across details, import and editor
at desktop and mobile widths; name/description/category actions were exercised.
The independent finish review accepted all eight component captures without
material findings. `DESIGN.md` and its sidecar remain
unchanged.

## Current compact proportions

This refinement supersedes the button and header dimensions recorded above.
The shared action component now uses 36px text buttons, 13px text, 12px
horizontal padding and a 6px icon-to-label gap. Edit is a 28px muted pencil
control with a transparent background and border. Its hover state uses the
shared blue wash. A positioned `::after` expands each compact button's pointer
target to at least 44px without enlarging its visible box. The category heading
is at least 32px high with an 8px label-to-edit gap. Category checkbox chips
retain their existing 44px minimum height.

All eight name, description and category captures were inspected again at
1280px and 390px. They show matching compact Save/Cancel controls and the
unboxed pencil beside Categories. Final production build, Vue type checking,
13 focused unit tests and both WebKit category cases passed. Browser assertions
cover compact geometry, expanded 44px hit targets and keyboard focus.
Both Chromium cases also passed. Independent final review accepted all eight
updated captures without material findings.
`DESIGN.md` and `.impeccable/design.json` remain unchanged.

## Elevation refresh alignment

The elevation force-update action now uses `TrackActionButton`'s `refresh`
variant with the Lucide RefreshCw icon and accessible **Recalculate elevation**
name. It shares the compact transparent, muted icon treatment and expanded
44px pointer target with pencil Edit actions, including the loading spinner and
disabled state. `ElevationPanel.vue` owns its header/action layout: centered
flex alignment and a 12px gap keep refresh aligned with **Elevation** /
**Elevation + Slope**. The local header and chart controls allow wrapping;
legacy force-update styling in the parent detail panel was removed.

The three fresh `.impeccable/review/elevation-actions-{1280,390,320}.png`
captures were visually inspected. Refresh and the chart toggles align at all
three widths. Production build and Vue type checking passed. An initial
140-test focused run passed before two additional tests; the final focused run
passed 142 tests across the shared action, elevation and detail panel suites.
All six Chromium/WebKit browser cases passed assertions for
vertical centers, 12px spacing, edit/refresh style parity, slope toggling and no
overflow. Independent final review accepted the code and all three captures without
material findings. `DESIGN.md` and its sidecar remain unchanged.
