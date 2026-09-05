# ADR 0034: Editor Shell Layout Architecture

## Status

Accepted

## Context

The track editor had two parallel layout paradigms — a left panel with embedded header/alerts, and a centered toolbar. Four components (`TrackEditorTopBar`, `TrackEditorLeftRail`, `TrackEditorTopAlertStrip`, `TrackEditorBottomDeck`) were built during the UI redesign (`docs/superpowers/plans/2026-03-18-track-editor-ui-redesign.md`) but never wired in, leaving the codebase with duplicate layout concepts and sunk test costs.

The `TrackEditorToolbar` was fully redundant once TopBar (routing controls + save/export + track context) and LeftRail (mode buttons + undo/redo + POI) were integrated.

## Decision

Adopt a three-zone layout for the editor:

```
.track-editor-view (flex column)
├── TrackEditorTopBar           — track context + save/export + routing controls
├── TrackEditorTopAlertStrip    — draft banner, errors, quick-start tips
├── .editor-shell (flex-1)
│   └── .editor-map-stage
│       ├── .editor-map-region  — TrackEditorMap
│       └── .editor-overlay-layer
│           ├── TrackEditorLeftRail    — vertical icon rail (modes, undo/redo, POI)
│           ├── TrackEditorLeftPanel   — tabbed content only (no header/alerts)
│           └── TrackEditorInspector   — right inspector
└── TrackEditorBottomDeck       — horizontal card overview (wide screens)
```

The old `TrackEditorToolbar` is removed from the view but its file and test are retained (not deleted) for reference. The `TrackEditorLeftPanel` retains only its tabbed content role; its header and alerts move to TopBar and TopAlertStrip.

BottomDeck and LeftPanel both render the same card components but in different layouts (horizontal overview vs vertical tabs). BottomDeck is shown on wide screens (>=1400px) as an alternative overview; LeftPanel remains the primary editing surface.

## Consequences

- TopBar + LeftRail replace Toolbar functionality completely
- TopAlertStrip replaces LeftPanel's inline alerts
- BottomDeck provides a horizontal card layout complementary to LeftPanel's vertical tabs
- TrackEditorLeftPanel shrinks (header + alerts removed)
- TrackEditorToolbar.vue and its test remain on disk as unused reference (not deleted per user constraint)
- CSS custom property `--rail-width` added to editor-map-stage for rail sizing
