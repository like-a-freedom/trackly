# Track Editor UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the track creation/editing screen into the approved A2.1 overlay-only floating layout while preserving all existing editing flows, shortcuts, and map-first behavior.

**Architecture:** Keep the existing `useTrackEditor` logic intact and treat this as a composition refactor around `TrackEditorView.vue`. Build a single full-screen map stage and render all editor UI — left rail, top context bar (including top-context alerts), right inspector, and bottom deck — only as overlays above the map using small focused Vue components and stable `data-testid` hooks. Implement desktop-first, then adapt the same overlay boundaries for tablet/mobile without moving any current editor flow to another route and without ever shrinking the map rectangle.

**Tech Stack:** Vue 3, Vite, Vitest, Playwright, Leaflet, Bun

---

## File structure and responsibilities

**Modify:**
- `frontend/src/views/TrackEditorView.vue` — replace the old `toolbar + body(map + sidebar)` shell with a single full-screen map stage plus overlay layer implementing the four-zone floating layout and wire child regions together.
- `frontend/src/components/TrackEditorToolbar.vue` — shrink scope so it no longer acts as the single top toolbar; either repurpose as grouped top-context controls or keep only shared control primitives used by the new shell.
- `frontend/src/components/TrackEditorSidebar.vue` — reduce responsibilities and move heavy sections into bottom-deck-oriented cards / inspector sections.
- `frontend/src/components/TrackEditorMap.vue` — align map wrapper, context menu, and overlay spacing with the floating layout.
- `frontend/src/views/__tests__/TrackEditorView.test.js` — update and expand unit tests for the new shell structure and keyboard/interaction preservation.
- `frontend/e2e/track-editor.spec.ts` — update selectors/assertions to match the new layout while preserving existing flow coverage.

**Create:**
- `frontend/src/components/editor/TrackEditorLeftRail.vue` — mode switching and primary tool rail.
- `frontend/src/components/editor/TrackEditorTopBar.vue` — track identity, live metrics, save state/action, compact global status.
- `frontend/src/components/editor/TrackEditorInspector.vue` — context-sensitive right-side inspector.
- `frontend/src/components/editor/TrackEditorBottomDeck.vue` — bottom deck shell that arranges metadata, segments, chart, and action cards.
- `frontend/src/components/editor/TrackEditorMetaCard.vue` — track name/description/categories card.
- `frontend/src/components/editor/TrackEditorSegmentsCard.vue` — segments management card.
- `frontend/src/components/editor/TrackEditorActionsCard.vue` — duplicate / reverse / loop / export / misc actions card.
- `frontend/src/components/editor/TrackEditorChartCard.vue` — elevation/profile card wrapper that hosts existing chart interactions.
- `frontend/src/components/__tests__/TrackEditorTopBar.test.js` — focused test for top-context actions and required first-level controls.
- `frontend/src/components/__tests__/TrackEditorLeftRail.test.js` — focused test for mode/tool rail behavior.

**Optional create if needed during implementation:**
- `frontend/src/components/editor/TrackEditorOptimizerCard.vue` — optimizer preview/apply controls card if the deck becomes too dense with optimizer controls inside actions or metadata.
- `frontend/src/components/editor/TrackEditorAlerts.vue` — reusable top-context alert strip for draft/error/info states if keeping alerts inside `TrackEditorView.vue` becomes noisy.

## State coverage matrix

Every spec-mandated UI state must be covered by at least one implementation task and one verification step.

| Required state | Primary implementation task | Required verification |
|---|---|---|
| New empty track | Task 1 shell + Task 2 top bar/rail | Unit assertion for empty state shell and first-level controls |
| New track with a few points | Task 1 shell + Task 5 map integration | Unit/E2E assertion that map editing remains functional |
| Existing loaded track | Task 1 shell + Task 6 responsive shell | Unit assertion with loaded editor data |
| Routing enabled | Task 2 top bar/rail + Task 6 responsive controls | Unit assertion for routing-related control visibility |
| Manual routing / routing unavailable | Task 3 top-context alerting + Task 6 responsive priorities | Unit assertion for warning/status placement |
| Fragment mode active | Task 3 inspector + Task 6 responsive priorities | Unit assertion for fragment contextual controls |
| POI mode active | Task 3 inspector + Task 6 responsive priorities | Unit assertion for POI contextual controls |
| Validation or save error state | Task 3 top-context alerting | Unit assertion for error visibility in the top context system |
| Draft recovery state | Task 3 top-context alerting | Unit assertion for draft banner placement |
| Save in progress state | Task 2 top bar/rail | Unit assertion for save-state rendering |
| Inspector shown / hidden | Task 1 shell + Task 6 responsive overlays | E2E assertion that map rect does not change |
| Bottom deck shown / hidden | Task 1 shell + Task 6 responsive overlays | E2E assertion that map rect does not change |
| Top-context alerts shown / hidden | Task 3 top-context alerting + Task 6 responsive overlays | E2E assertion that map rect does not change |

---

## Chunk 1: Establish the new editor shell

### Task 1: Lock in overlay shell expectations with failing tests

**Files:**
- Modify: `frontend/src/views/__tests__/TrackEditorView.test.js`
- Test: `frontend/src/views/__tests__/TrackEditorView.test.js`

- [ ] **Step 1: Write the failing test for the new overlay shell zones**

Add tests that mount `TrackEditorView.vue` and assert the presence of stable layout regions such as:
- `data-testid="editor-left-rail"`
- `data-testid="editor-top-bar"`
- `data-testid="editor-right-inspector"`
- `data-testid="editor-bottom-deck"`

Also add shell assertions for overlay-specific boundaries such as:
- `data-testid="editor-map-stage"`
- `data-testid="editor-overlay-layer"`

Also assert that the map region remains present, that overlay regions are mounted inside the overlay layer rather than a side/bottom grid, and that keyboard shortcuts still dispatch through the view shell.

- [ ] **Step 2: Run the test to verify it fails**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: FAIL because the new layout regions do not exist yet.

- [ ] **Step 3: Write the minimal shell implementation**

Create the new composition layout in `frontend/src/views/TrackEditorView.vue` and render placeholder versions of the four zones inside a dedicated overlay layer above the existing `TrackEditorMap`.

Minimum acceptance for this step:
- map still mounts as the full-screen base layer;
- editor still wires existing props/events;
- the new four-zone containers exist with stable `data-testid` values;
- there is no grid/flex shell that allocates permanent map-adjacent space to inspector or deck.

- [ ] **Step 4: Re-run the shell test**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: PASS for the new shell-region assertions.

- [ ] **Step 5: Commit the shell boundary change**

Commit message:
`feat: add track editor shell layout`

### Task 2: Create the new left rail and top bar foundations

**Files:**
- Create: `frontend/src/components/editor/TrackEditorLeftRail.vue`
- Create: `frontend/src/components/editor/TrackEditorTopBar.vue`
- Modify: `frontend/src/views/TrackEditorView.vue`
- Create: `frontend/src/components/__tests__/TrackEditorLeftRail.test.js`
- Create: `frontend/src/components/__tests__/TrackEditorTopBar.test.js`

- [ ] **Step 1: Write failing tests for first-level controls**

Add tests to prove that these remain first-level visible and emit the expected events:
- mode switching;
- undo;
- redo;
- save;
- POI toggle;
- key live metrics / track context.

- [ ] **Step 2: Run the focused component tests to verify failure**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/components/__tests__/TrackEditorLeftRail.test.js src/components/__tests__/TrackEditorTopBar.test.js`

Expected: FAIL because the components do not exist yet.

- [ ] **Step 3: Implement the minimal components and wire them into the shell**

Implementation notes:
- `TrackEditorLeftRail.vue` owns only navigation/tool buttons.
- `TrackEditorTopBar.vue` owns track context, metrics, and save state/action.
- Do not move secondary controls into these components unless the spec says they are first-level.

- [ ] **Step 4: Re-run the focused component tests**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/components/__tests__/TrackEditorLeftRail.test.js src/components/__tests__/TrackEditorTopBar.test.js`

Expected: PASS.

- [ ] **Step 5: Run the view-shell tests again**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: PASS with the real components mounted or stubbed appropriately.

- [ ] **Step 6: Commit the foundation components**

Commit message:
`feat: add track editor rail and top bar`

---

## Chunk 2: Recompose sidebar responsibilities into inspector and deck

### Task 3: Move context-sensitive content into the right inspector

**Files:**
- Create: `frontend/src/components/editor/TrackEditorInspector.vue`
- Modify: `frontend/src/views/TrackEditorView.vue`
- Modify: `frontend/src/components/TrackEditorSidebar.vue`
- Test: `frontend/src/views/__tests__/TrackEditorView.test.js`

- [ ] **Step 1: Write a failing test for inspector state coverage**

Add tests that verify the shell can render inspector states for at least:
- default edit mode;
- fragment mode active;
- POI mode active;

Also add failing tests in the top-context/top-alert area for:
- draft recovery visibility;
- editor-wide error/info visibility;
- routing unavailable / manual routing warning placement.

- [ ] **Step 2: Run the view tests to confirm failure**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: FAIL because the right inspector logic is not implemented.

- [ ] **Step 3: Implement the minimal inspector**

Implementation notes:
- pull only context-sensitive content into `TrackEditorInspector.vue`;
- keep it narrow and state-driven;
- do not duplicate metadata/segments forms there;
- place draft/error/info alerts in the top-context system or a dedicated alert strip, not in the inspector;
- ensure routing-unavailable and save/error messaging follow the spec’s top-context alert rules.

- [ ] **Step 4: Re-run the view tests**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the inspector extraction**

Commit message:
`feat: add track editor inspector panel`

### Task 4: Convert heavy sidebar sections into bottom deck cards

**Files:**
- Create: `frontend/src/components/editor/TrackEditorBottomDeck.vue`
- Create: `frontend/src/components/editor/TrackEditorMetaCard.vue`
- Create: `frontend/src/components/editor/TrackEditorSegmentsCard.vue`
- Create: `frontend/src/components/editor/TrackEditorActionsCard.vue`
- Create: `frontend/src/components/editor/TrackEditorChartCard.vue`
- Modify: `frontend/src/components/TrackEditorSidebar.vue`
- Modify: `frontend/src/views/TrackEditorView.vue`
- Test: `frontend/src/views/__tests__/TrackEditorView.test.js`

- [ ] **Step 1: Write failing tests for deck reachability**

Add assertions that the deck exposes the critical modules and preserves first-level or one-extra-interaction reachability for:
- metadata;
- segments;
- chart;
- actions;
- contextual fragment/optimizer modules where relevant.

- [ ] **Step 2: Run the tests and watch them fail**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: FAIL because the bottom deck does not yet host the required cards.

- [ ] **Step 3: Implement the bottom deck with staged extraction**

Implementation notes:
- first, wrap existing `TrackEditorSidebar` concerns into focused cards;
- second, move those cards into `TrackEditorBottomDeck.vue`;
- preserve the existing emitted events and `data-testid` hooks where feasible;
- avoid rewriting editor logic while moving presentation;
- keep optimizer controls inside an existing card unless separation is clearly needed, and only then create `TrackEditorOptimizerCard.vue`.

- [ ] **Step 4: Re-run the shell tests**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: PASS.

- [ ] **Step 5: Add or update component-level tests if deck cards become complex**

If any new card accumulates meaningful interaction logic, add focused tests at exact paths such as:
- `frontend/src/components/__tests__/TrackEditorBottomDeck.test.js`
- `frontend/src/components/__tests__/TrackEditorSegmentsCard.test.js`
- `frontend/src/components/__tests__/TrackEditorActionsCard.test.js`

and run them explicitly.

- [ ] **Step 6: Commit the bottom deck refactor**

Commit message:
`feat: move editor modules into bottom deck`

---

## Chunk 3: Polish map integration, responsive behavior, and regression coverage

### Task 5: Align map overlays and floating surfaces

**Files:**
- Modify: `frontend/src/components/TrackEditorMap.vue`
- Modify: `frontend/src/views/TrackEditorView.vue`
- Test: `frontend/src/views/__tests__/TrackEditorView.test.js`

- [ ] **Step 1: Write a failing test for integration hooks that must remain stable**

At minimum, preserve testable presence/behavior for:
- map wrapper;
- full-screen map stage;
- context menu;
- waypoint markers / map click handling hooks;
- fit/pan/zoom methods exposed to the shell.

Also add a failing assertion that showing overlay surfaces does not change the measured map-stage rectangle.

- [ ] **Step 2: Run the relevant unit tests to verify failure**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: FAIL if shell/layout changes broke map integration assumptions.

- [ ] **Step 3: Restyle map-adjacent UI without changing map logic**

Implementation notes:
- align context menu and map wrapper surfaces with the floating design system;
- ensure overlay spacing works with left rail, top bar, inspector, and deck;
- keep the map wrapper pinned to the full editor viewport regardless of overlay visibility;
- keep existing map interaction logic intact.

- [ ] **Step 4: Re-run the view tests**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the map-integration polish**

Commit message:
`style: align track editor map overlays with new shell`

### Task 6: Implement responsive overlay behavior for tablet and mobile priorities

**Files:**
- Modify: `frontend/src/views/TrackEditorView.vue`
- Modify: `frontend/src/components/editor/TrackEditorLeftRail.vue`
- Modify: `frontend/src/components/editor/TrackEditorTopBar.vue`
- Modify: `frontend/src/components/editor/TrackEditorInspector.vue`
- Modify: `frontend/src/components/editor/TrackEditorBottomDeck.vue`
- Test: `frontend/src/views/__tests__/TrackEditorView.test.js`

- [ ] **Step 1: Write failing tests for responsive-first critical controls**

Add tests around responsive classes/DOM presence that verify:
- mode, undo/redo, save, track context remain first-level visible;
- fragment/POI/segment contextual controls remain reachable when active;
- draft/error/save-status visibility remains in the top-context system;
- screen states from the spec matrix remain representable in the shell;
- no route/page switch is introduced.
- on mobile/desktop, visible inspector/deck/alerts remain overlays and do not force the map into a smaller rect.

- [ ] **Step 2: Run the view tests to confirm failure**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: FAIL until responsive control placement is implemented.

- [ ] **Step 3: Implement breakpoint-specific layout behavior**

Implementation notes:
- define concrete breakpoints in code/CSS during implementation;
- keep the map first;
- allow deck stacking/collapse as overlay sheets/cards;
- allow inspector collapse/sheet behavior as overlay drawers/cards;
- keep critical actions visible within the spec’s interaction limit.

- [ ] **Step 4: Re-run the unit tests**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the responsive pass**

Commit message:
`feat: add responsive track editor shell behavior`

### Task 7: Update end-to-end coverage for the redesigned overlay editor

**Files:**
- Modify: `frontend/e2e/track-editor.spec.ts`
- Test: `frontend/e2e/track-editor.spec.ts`

- [ ] **Step 1: Update the failing E2E assertions to the new layout selectors**

Cover at least:
- editor loads;
- critical controls exist in the new zones;
- map stage fills the editor viewport;
- showing/hiding overlay inspector, bottom deck, and top-context alerts does not resize the map rect;
- map click adds waypoints;
- segment actions remain reachable and operable through the new layout;
- chart/profile surface remains present and wired for chart-to-map interactions;
- save remains gated correctly;
- shortcuts do not crash;
- loop control remains reachable.

- [ ] **Step 2: Run the focused E2E file and verify current failures**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bun run test:e2e -- e2e/track-editor.spec.ts`

Expected: FAIL until selectors and layout assumptions are updated.

- [ ] **Step 3: Make the minimum test updates needed for the new shell**

Do not expand scope; only update the tests needed to describe the redesigned UI while preserving behavior coverage.

- [ ] **Step 4: Re-run the focused E2E file**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bun run test:e2e -- e2e/track-editor.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the E2E updates**

Commit message:
`test: update track editor e2e for new layout`

### Task 8: Run final verification for the redesign branch

**Files:**
- Verify: `frontend/src/views/TrackEditorView.vue`
- Verify: `frontend/src/components/TrackEditorMap.vue`
- Verify: `frontend/src/components/TrackEditorToolbar.vue`
- Verify: `frontend/src/components/TrackEditorSidebar.vue`
- Verify: `frontend/src/components/editor/TrackEditorLeftRail.vue`
- Verify: `frontend/src/components/editor/TrackEditorTopBar.vue`
- Verify: `frontend/src/components/editor/TrackEditorInspector.vue`
- Verify: `frontend/src/components/editor/TrackEditorBottomDeck.vue`
- Verify: `frontend/src/components/editor/TrackEditorMetaCard.vue`
- Verify: `frontend/src/components/editor/TrackEditorSegmentsCard.vue`
- Verify: `frontend/src/components/editor/TrackEditorActionsCard.vue`
- Verify: `frontend/src/components/editor/TrackEditorChartCard.vue`
- Verify: `frontend/src/views/__tests__/TrackEditorView.test.js`
- Verify: `frontend/src/components/__tests__/TrackEditorLeftRail.test.js`
- Verify: `frontend/src/components/__tests__/TrackEditorTopBar.test.js`
- Verify: `frontend/e2e/track-editor.spec.ts`

**Optional verify if created:**
- `frontend/src/components/editor/TrackEditorOptimizerCard.vue`

- [ ] **Step 1: Run the focused unit tests**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bunx vitest run src/views/__tests__/TrackEditorView.test.js src/components/__tests__/TrackEditorLeftRail.test.js src/components/__tests__/TrackEditorTopBar.test.js`

Expected: PASS.

- [ ] **Step 1a: Confirm segment operations and chart/map interaction coverage**

Before moving on, verify that the updated unit/E2E suite explicitly exercises:
- at least one segment-management interaction that still works through the new layout;
- chart/profile interaction wiring that still reaches the map-facing shell.

If coverage is missing, add the minimum focused assertions in:
- `frontend/src/views/__tests__/TrackEditorView.test.js`, and/or
- `frontend/e2e/track-editor.spec.ts`

Then re-run the affected tests before proceeding.

- [ ] **Step 2: Run the focused E2E test**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bun run test:e2e -- e2e/track-editor.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run a production build for the touched frontend files**

Run:
`cd /Users/solovey/Documents/dev/trackly/frontend && bun run build`

Expected: PASS. If unrelated pre-existing build failures appear, document them clearly before completion.

- [ ] **Step 4: Review `data-testid` coverage before completion**

Confirm that all critical flows still have stable selectors for:
- mode switching;
- undo/redo;
- save;
- metadata input;
- map wrapper;
- segment actions;
- loop action.

- [ ] **Step 5: Commit the verification/polish fixes**

Commit message:
`chore: verify track editor redesign`

---

## Notes for execution

- Prefer preserving emitted events and composable contracts to avoid accidental editor logic regressions.
- If `TrackEditorToolbar.vue` or `TrackEditorSidebar.vue` become awkward to partially repurpose, split responsibilities rather than forcing legacy structure into the new shell.
- Keep desktop delivery first, but do not leave tablet/mobile as unspecified follow-up work; implement at least the spec-defined priority model in the same branch.
- Preserve or reintroduce stable `data-testid` attributes as each surface moves. They are part of the contract.

## Suggested review checkpoints

1. After Chunk 1: confirm shell composition and first-level controls.
2. After Chunk 2: confirm deck/inspector information architecture.
3. After Chunk 3: confirm responsive behavior and regression coverage.

Plan complete and saved to `docs/superpowers/plans/2026-03-18-track-editor-ui-redesign.md`. Ready to execute?
