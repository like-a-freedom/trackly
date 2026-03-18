# Track Editor UI Redesign Design

## Summary

This document defines the approved redesign direction for the track creation/editing screen in `Trackly`.

The current editor already supports a rich feature set, but visually feels fragmented and utilitarian: the toolbar, map, and sidebar read as separate technical blocks instead of a coherent editing workspace. The redesign focuses first on modernizing the visual language and strengthening visual hierarchy, then on reducing sidebar overload and making the main tool controls feel integrated rather than bolted on.

The approved direction is **A2 — structured floating editor**:
- the **map stays dominant** as the primary canvas;
- controls are distributed into **four clearly-scoped UI zones**;
- the interface keeps a light, contemporary floating-panel feel;
- the layout remains practical for a feature-rich route editor rather than becoming purely decorative.

## Goals

### Primary goals

1. Make the editor feel **modern, polished, and aesthetically intentional**.
2. Improve **first-glance hierarchy** so the user immediately understands:
   - where the map interaction happens;
   - where the current track context is shown;
   - where mode/tool switching lives;
   - where editing details and actions are located.
3. Reduce the sense of a **long overloaded sidebar**.
4. Replace the current toolbar feel of “many utility buttons in a strip” with a more coherent navigation/control system.

### Secondary goals

1. Preserve all current editing functionality.
2. Avoid large behavioral changes before layout clarity is improved.
3. Improve responsiveness for smaller screens without removing core capabilities.
4. Keep the implementation incremental and low-risk within the existing Vue architecture.

## Non-goals

1. No redesign of routing logic, segment logic, POI behavior, or editor business rules.
2. No new editing features are required as part of this redesign.
3. No migration to another UI framework or map library.
4. No major rewrite of editor composables or geometry logic unless strictly needed to support layout boundaries.

## User problem statement

The editor currently works, but it creates four UX problems:

1. **Outdated visual feel** — the screen looks like a technical admin tool rather than a polished track editor.
2. **Weak hierarchy** — the eye is not guided cleanly toward the main task flow.
3. **Sidebar overload** — too many different concerns live in one vertical column.
4. **Toolbar heaviness** — the top bar feels crowded and detached from the map experience.

The redesign should address these in that same order.

## Design direction

### Chosen aesthetic

**More lively and modern**, but still clearly a serious route-planning tool.

The editor should feel:
- light;
- layered;
- map-first;
- cleanly structured;
- visually refined without being playful or gimmicky.

### Visual principles

1. **Map as hero surface**
   - The map is the dominant visual plane.
   - UI panels should sit above it as a coordinated system.
   - The user should feel they are editing on the map, not inside a form around a map.

2. **Structured floating panels**
   - Panels should use translucent / elevated card styling.
   - Floating blocks should feel intentional and stable, not scattered.
   - The layout must still read as a system with roles, not a pile of overlays.

3. **Strong role-based zoning**
   - Each major UI region must have a single responsibility.
   - The same information should not compete in multiple zones.

4. **Calm, readable density**
   - The redesign should reduce cognitive load, not merely redistribute it.
   - Dense controls are acceptable only where context demands them.

5. **Modern cartographic feel**
   - Colors, blur, elevation, and spacing should complement the map.
   - The interface should feel like a high-quality mapping product, not a generic dashboard.

## Approved layout model

The redesigned editor is organized into **four primary zones**.

### 1. Left rail — mode and primary tools

**Purpose:** persistent editor navigation and mode switching.

**Contains:**
- editor modes (`view`, `edit`, `fragment`, `routing`, `trace`);
- undo / redo;
- POI mode toggle;
- possibly a small slot for one or two universal actions if needed.

**Rules:**
- icon-first presentation;
- consistent button sizing;
- the active mode is visually prominent;
- no verbose labels are required on desktop if tooltips are strong;
- this rail replaces the current perception of the toolbar as the primary navigation system.

### 2. Top context bar — track identity and live summary

**Purpose:** communicate “what am I editing right now?” and “what is the current state?”

**Contains:**
- track name / active context;
- key live stats (distance, estimated time, point count if appropriate);
- save state and primary save action;
- optional routing status if it materially affects current editing.

**Rules:**
- should be compact and scan-friendly;
- should avoid becoming a second toolbar;
- should elevate the most important information only;
- should give the editor a clear focal anchor at the top of the map.

### 3. Right inspector — selection/context-sensitive details

**Purpose:** show information or controls that depend on what the user is currently doing or has selected.

**Contains, depending on state:**
- current mode help / hints;
- active segment summary;
- POI-related quick context;
- keyboard shortcut reminders;
- context-sensitive micro-panels.

**Rules:**
- should be narrower and more focused than the current sidebar;
- should not carry the full editor form;
- should adapt based on selection/state instead of always showing everything;
- should work as a “smart inspector,” not a static information dump.

### 4. Bottom deck — working panels and secondary editing modules

**Purpose:** hold the heavier editing sections that currently overload the sidebar.

**Contains:**
- elevation/profile area;
- track metadata form;
- segment management block;
- grouped quick actions / optimizer / fragment controls / other task modules.

**Rules:**
- arranged as horizontally grouped cards on desktop;
- visually lighter than a traditional dock, but clearly structured;
- can collapse or stack on smaller screens;
- supports prioritization so only the most relevant cards are visually emphasized.

## Information architecture changes

### Feature-to-zone mapping

The redesign must preserve the current editor capabilities and assign each one a clear primary home in the new layout.

| Current capability | Desktop primary zone | Tablet / narrow behavior | Mobile behavior | Priority |
|---|---|---|---|---|
| Mode switching (`view`, `edit`, `fragment`, `routing`, `trace`) | Left rail | Left rail stays visible in compact form | First-level tool strip or compact floating control | Must stay first-level |
| Undo / Redo | Left rail | Left rail or compact top controls | First-level control | Must stay first-level |
| Save action / save state | Top context bar | Top context bar | Sticky top context bar | Must stay first-level |
| Track identity (name / active context) | Top context bar | Top context bar | Top context bar or top sheet header | Must stay first-level |
| Key live metrics (distance, time, points) | Top context bar | Top context bar with reduced density | Top context summary | Must stay first-level |
| Routing toggle / routing profile / graph status | Top context bar or right inspector | Compact top controls + inspector details | Secondary controls in inspector/sheet | May move to secondary UI if current mode is not routing |
| Snap-to-road mode | Right inspector or compact top controls | Inspector/tab | Secondary control in inspector/sheet | May move to secondary UI |
| POI mode toggle | Left rail | Left rail compact form | First-level tool strip | Must stay first-level |
| Distance markers toggle | Right inspector or deck action card | Inspector/tab | Secondary control | May move to secondary UI |
| Export | Bottom deck action card or top context overflow | Overflow / action card | Secondary action sheet | May move to secondary UI |
| Segment management | Bottom deck segment card | Bottom deck grid / stacked cards | Collapsible card / bottom sheet section | Must remain directly reachable |
| Metadata form | Bottom deck metadata card | Bottom deck stacked card | Collapsible card / bottom sheet section | Must remain directly reachable |
| Fragment actions | Bottom deck contextual card | Contextual card/tab | Contextual bottom sheet section | Must remain directly reachable when fragment mode is active |
| Optimizer | Bottom deck optimizer card | Bottom deck stacked card | Secondary collapsible module | May move to secondary UI |
| Elevation chart and chart-map interactions | Bottom deck chart card | Full-width stacked card | Expandable bottom card / sheet section | Must remain directly reachable |
| POI list / POI editing context | Right inspector + bottom deck support as needed | Inspector/tab | Sheet section | Must remain directly reachable when POI mode/selection is active |
| Track actions (duplicate / reverse / loop flows) | Bottom deck action card | Bottom deck stacked action card | Secondary action sheet/card | Must remain reachable within 1 extra interaction |
| Draft / error / info banners | Top context system | Top context system | Top context system / pinned alert strip | Must remain visible at first level |

### What moves out of the current top toolbar

The current `TrackEditorToolbar.vue` packs together:
- modes;
- undo/redo;
- routing toggles;
- snap/routing profile;
- stats;
- export;
- save.

This creates visual competition and weak grouping.

**New model:**
- **modes + universal tool buttons** move to the **left rail**;
- **stats + save context** move to the **top context bar**;
- **secondary controls** (routing profile, graph status, distance markers, export) are either:
  - grouped into compact secondary controls in the top bar, or
  - moved into inspector/deck cards depending on importance and frequency.

### What moves out of the current sidebar

The current `TrackEditorSidebar.vue` mixes:
- metadata form;
- segments list;
- track actions;
- fragment actions;
- POI list;
- elevation profile;
- optimizer;
- summary;
- draft/error/info banners.

This makes the sidebar feel long, overloaded, and visually flat.

**New model:**
- metadata, segments, optimizer, elevation, summary, actions are split into **bottom deck cards**;
- dynamic help and current selection context move into the **right inspector**;
- alerts/banners remain visible, but should be integrated into the context system rather than appearing as generic stacked strips.

## Interaction design expectations

### Visual hierarchy

At desktop size, the user’s attention should follow this path:

1. **Map surface**
2. **Top context bar**
3. **Left rail active mode**
4. **Current contextual panel** (right inspector or active bottom card)

The screen should no longer read top-to-bottom like a settings form.

### Panel behavior

1. Floating regions should have consistent spacing, corner radius, blur/elevation language, and internal padding.
2. Panels should feel related through one shared design system.
3. Context-sensitive panels should appear stable and not jump excessively.
4. Any collapse/expand behavior should feel deliberate and lightweight.

### Responsive behavior

#### Desktop
- Full four-zone layout is active.
- Bottom deck may span multiple cards horizontally.
- Right inspector remains visible.
- All critical editing controls remain visible without opening additional sheets.

#### Tablet / narrow landscape
- Left rail may reduce icon spacing.
- Bottom deck may become a 2-row grid.
- Right inspector may collapse into a compact panel or tabs.
- The following controls must still remain first-level visible: active mode, undo, redo, save, current track context.
- Segment, metadata, chart, and contextual editing modules may stack, but must remain reachable without leaving the editor screen.

#### Mobile
- The design should preserve the map-first structure.
- Likely behavior:
  - compact top context bar;
  - left rail becomes bottom/edge compact tool strip or collapsible control group;
  - right inspector merges into bottom sheet behavior;
  - bottom deck cards become vertically stacked, collapsible modules.

The mobile design should not attempt to preserve every desktop panel simultaneously.

### Responsive priority rules

The redesign must obey these priority rules:

1. **Always first-level visible on all breakpoints**
   - current mode;
   - undo / redo;
   - save action or save state access;
   - track identity;
   - map canvas.

2. **Must become first-level visible when relevant state is active**
   - fragment actions when fragment mode is active;
   - POI controls when POI mode or POI selection is active;
   - segment controls when a segment-specific operation is active;
   - error/draft warnings when present.

3. **May move behind secondary UI on narrow screens**
   - export;
   - optimizer;
   - routing profile details;
   - distance marker toggle;
   - non-critical helper text.

4. **Must not require route/page switching**
   - no current editor capability may move to another route or detached full-screen page as part of this redesign.

### Screen-state coverage

The layout must explicitly support these states:

1. New empty track, before first point.
2. New track with a few points and active editing.
3. Existing loaded track.
4. Routing enabled with routing-related context visible.
5. Manual routing / routing unavailable state.
6. Fragment mode active.
7. POI mode active.
8. Validation or save error state.
9. Draft recovery state.
10. Save in progress state.

The implementation plan must treat these as concrete UI states, not implicit variants.

## Component-level implications

### `frontend/src/views/TrackEditorView.vue`

This component becomes the main composition shell for the redesign.

**Expected responsibilities after redesign:**
- orchestrate the four zones;
- manage placement of shared status/alerts;
- pass data to the map, rail/top bar, inspector, and bottom deck regions;
- remain the layout boundary between data logic and presentation.

**Likely changes:**
- replace the current simple `toolbar + body(map + sidebar)` structure;
- create a layered editor shell around the map;
- introduce new wrapper regions/classes for:
  - left rail,
  - top context bar,
  - right inspector,
  - bottom deck.

### `frontend/src/components/TrackEditorToolbar.vue`

This component should no longer represent the entire top horizontal toolbar as it does today.

**Preferred direction:**
- repurpose into a smaller, role-specific control component, or
- split responsibilities so the existing toolbar code becomes:
  - a left rail controls component,
  - and/or compact top bar control groups.

**Key change:** stop treating all editor controls as one strip.

### `frontend/src/components/TrackEditorSidebar.vue`

This component should no longer remain a single all-purpose sidebar.

**Preferred direction:**
- split into smaller focused sub-panels or logical sections used by:
  - right inspector,
  - bottom deck cards.

If a full split is too large for the first pass, a staged approach is acceptable:
1. visually reorganize existing sections into grouped cards;
2. move the highest-value sections into new layout zones first;
3. preserve internal behavior while reducing monolithic presentation.

### `frontend/src/components/TrackEditorMap.vue`

The map remains the interaction canvas.

**Expected changes:**
- visual integration with new floating layout;
- support for better spacing/padding relative to overlays;
- no major editing logic changes required;
- any context menu or overlay styling should align with the new visual system.

## Visual system guidance

### Tone
- light modern cartographic UI;
- premium but not luxurious;
- technical but not cold;
- contemporary without trendy excess.

### Styling direction
- soft glass / translucent cards over the map;
- clearer elevation and layered depth;
- stronger spacing rhythm;
- fewer heavy borders;
- more deliberate grouping via surfaces instead of lines everywhere.

### Color behavior
- map remains colorful but slightly visually calmed by the overlay system;
- active editing state should use a confident blue/indigo accent family;
- warnings/errors should remain noticeable but not dominate the screen;
- neutral surfaces should be cool and low-noise.

### Typography behavior
- hierarchy should rely on scale, weight, and spacing rather than large quantities of labels;
- micro-labels/kickers are encouraged for panel roles;
- stats should be legible at a glance.

## Alert and banner placement rules

The redesign must stop treating status banners as generic stacked strips detached from the editor structure.

1. **Draft recovery**, **save status**, and **editor-wide warnings/errors** belong to the **top context system**.
2. Alerts that are tied to a current tool or selection may appear in the **right inspector**, but must not hide editor-wide blocking information.
3. Persistent warnings must remain visible until dismissed or resolved.
4. Alerts must not push the map so far down that the editor loses its map-first feel.
5. On mobile, top-level alerts may collapse into a pinned strip, but must remain visible without opening a secondary sheet.

## Migration strategy

The redesign should be implemented incrementally.

### Recommended order

1. Introduce the new layout shell in `TrackEditorView.vue`.
2. Move the current toolbar responsibilities into grouped regions.
3. Reorganize sidebar content into inspector + bottom deck structure.
4. Restyle the map overlays/context menus to match the new system.
5. Refine responsive behavior.
6. Run regression tests for existing editing flows.

### Constraints

- preserve existing events and editor logic where possible;
- avoid combining visual redesign with unrelated behavior changes;
- prefer decomposition over full rewrites if it reduces regression risk.

## Testing implications

The redesign must preserve the existing editor behaviors covered by tests, especially:
- editor loading;
- mode switching;
- map waypoint creation;
- undo / redo;
- save button behavior;
- keyboard shortcuts.

Tests will likely need updates for:
- changed DOM structure;
- moved controls;
- new responsive containers;
- updated test selectors.

The redesign should keep or add stable `data-testid` attributes for all critical interactions.

## Acceptance criteria for the redesign direction

The design is considered correct for planning if the implementation will produce all of the following:

1. The editor no longer renders as one full-width crowded toolbar plus one monolithic overloaded sidebar.
2. The layout exposes at least **three distinct control zones** outside the map: navigation/tools, context/status, and editing modules.
3. The map remains the visually dominant surface in the default editing state.
4. On desktop, the user can visually distinguish:
   - navigation/tools,
   - track context/status,
   - context-sensitive details,
   - working editor modules.
5. The following critical actions remain reachable at first level on desktop and mobile-adapted layouts:
   - mode switching,
   - undo,
   - redo,
   - save,
   - map editing interaction.
6. Contextual controls for active fragment/POI/segment states remain reachable without leaving the editor screen.
7. Existing critical editor flows remain functionally preserved:
   - creating a track,
   - editing waypoints,
   - undo/redo,
   - saving,
   - segment operations,
   - chart/map interactions.
8. On tablet and mobile layouts, secondary modules may collapse or stack, but critical actions remain available within at most **one additional interaction**.
9. Stable `data-testid` coverage is preserved or updated for all critical controls touched by the redesign.

## Planning notes

This spec is intentionally focused on the UI/UX redesign of the existing track editor screen. It is narrow enough to support a single implementation plan.

It does not define implementation tasks, exact CSS tokens, or final file splits; those belong in the implementation plan stage.
