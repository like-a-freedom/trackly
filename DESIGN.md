---
name: Trackly
description: A calm, structured workspace for GPS tracks and route planning.
colors:
  ink: "#17283d"
  muted: "#52647a"
  surface: "#ffffff"
  canvas: "#f3f6fa"
  line: "#d6dfe9"
  action: "#245bd7"
  action-hover: "#194aa5"
  action-active: "#0d47a1"
  action-soft: "#eff6ff"
  success: "#43a047"
  warning: "#f9a825"
  danger: "#c62828"
  focus-ring: "#10151c"
typography:
  metadata:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  title:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  track-title:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "1.4063rem"
    fontWeight: 600
    lineHeight: 1.25
  editor-title:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  control: "8px"
  tool: "4px"
  top-bar-button: "12px"
  pill: "999px"
spacing:
  compact: "4px"
  small: "8px"
  field: "12px"
  panel: "16px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.tool}"
    padding: "0 12px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tool}"
    padding: "0 8px"
    height: "44px"
  tool-active:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.tool}"
    size: "44px"
  field-coordinate:
    rounded: "{rounded.tool}"
    padding: "0 12px"
    height: "44px"
  task-pane:
    backgroundColor: "{colors.surface}"
    padding: "16px"
    width: "360px"
---

# Design System: Trackly

## Overview

**Creative North Star: "The Map Workspace"**

Trackly uses white working surfaces, cool neutrals, dark ink and blue actions. Geography provides the visual content; controls provide a quiet structure around it. System typography keeps the interface familiar and compact.

This document captures the implemented shared foundation and the new editor workspace. It is not a claim that every surface has migrated. The editor top bar, nested inspector forms, track detail, upload, account and global dialogs retain local styling. Their literals, radii and typography remain compatibility details until a scoped migration replaces them.

**Key Characteristics:**
- Calm neutral surfaces with a functional blue accent.
- Compact, readable system typography.
- Contextual editing with clear selected states.
- Borders for structure; restrained shadows over geography.

## Colors

The palette separates working surfaces from map imagery with cool neutral borders and a single action hue.

### Primary
- **Action Blue** (`action`): new primary actions, selected drawing tools and active task tabs.
- **Deep Action Blue** (`action-hover`, `action-active`): shared map-control interaction states.
- **Pale Action Wash** (`action-soft`): tool hover, instructions and existing metric chips.

### Neutral
- **Dark Ink** (`ink`): primary control text.
- **Muted Slate** (`muted`): secondary text and inactive task tabs.
- **White Surface** (`surface`): task panes and controls.
- **Cool Canvas** (`canvas`): application workspace backdrop.
- **Quiet Line** (`line`): divisions between working regions and field borders.
- **Dark Focus** (`focus-ring`): keyboard focus outline on shared controls.

Success, warning and danger tokens communicate status, rather than additional brand accents. Existing status chips have local tonal treatments. Preserve their semantic meaning without presenting those local colors as a second shared palette.

**The Functional Accent Rule.** Use blue for actions and selection; let the map supply decorative color.

## Typography

The new foundation declares `system-ui, sans-serif`. The application body currently retains its explicit native stack (`-apple-system`, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif); there is no downloaded brand font.

The frontmatter records the shared role scale from App.vue: metadata, body, panel title, track tooltip title and a reserved editor-title size. Normal, medium and bold weights are 400, 500 and 600; snug multi-line values use line-height 1.4. These roles guide new work. Some existing editor components still use local sizes, including 12px compact metrics. The reserved editor-title token does not mean a large heading currently renders in the editor.

Mobile text fields use a 16px minimum in the shared responsive foundation. Prefer sentence case and concise labels; retain descriptive text for unfamiliar operations.

## Layout

Shared spacing follows the small steps documented in the frontmatter. Components use compact internal gaps and more generous pane padding. Layout remains specific to each surface.

The editor uses a flexible map alongside one 360px task pane. Route, Description and Review share this pane; contextual point and POI editing stay within it. At widths at or below 900px the pane becomes a bottom sheet: collapsed at 44px, medium at `min(36%, 280px)`, and full at `calc(100% - 80px)` of the map stage. Safe-area padding is applied at the bottom. Map tools remain horizontal; their mode buttons become a select on mobile.

The top bar changes composition at 1100px; its overflow menu adjusts at 768px. Maintain readable actions and independent pane scrolling. These are editor contracts, not a requirement that every future screen use a map/sidebar composition.

## Elevation & Depth

New task panes are flat, white and separated with thin borders. Floating map controls use the shared control shadows; their translucent white surface keeps the control plane distinct from arbitrary tile imagery. The existing editor top bar and overflow menu retain stronger local shadows. Exact shadow and focus values are captured in the sidecar.

**The Structural Depth Rule.** Use elevation to separate controls from geography or to identify an overlay; do not add decorative shadows to every section.

## Shapes

Shared floating controls use softly curved corners; individual tool and coordinate controls use tighter corners. Task panes remain square-edged structural regions. Existing top-bar buttons, metric pills and menus retain their distinct local shapes. Do not silently normalize those shapes while implementing an unrelated feature.

## Components

### Buttons

Coordinate actions use blue primary buttons and white bordered secondary buttons. Tool buttons use dark ink on a transparent surface; selection fills them blue with white icons. Disabled tool icons become muted and disabled coordinate actions reduce opacity. Keep the 44px touch dimensions on these new controls. The top-bar Save button currently uses a local blue and a larger radius; it is not yet the shared primary primitive.

### Inputs / Fields

Coordinate fields are native numeric inputs with a thin neutral border, tight corners and horizontal inset. Native validation and explicit labels remain visible. The shared foundation increases mobile form controls to a minimum 44px height and 16px text. Nested metadata inputs still use inspector-local styles.

### Navigation

Task tabs divide available pane width equally. A blue bottom rule, blue text and heavier weight identify the selected tab. Map-tool buttons carry accessible names and selected state; the mobile mode select expresses the same tools with text. Preserve focus visibility rather than relying on color alone.

### Chips / Containers

Existing top-bar metrics use pale blue rounded pills on desktop and transparent compact text on narrower screens. They summarize data without acting as navigation. The task pane uses a white background, a thin dividing border and internally scrollable content; it is a working region rather than a decorative card.

## Do's and Don'ts

### Do:
- **Do** use the shared neutral and action tokens for new workspace controls.
- **Do** keep keyboard focus visible and respect reduced-motion preferences.
- **Do** preserve readable mobile fields and 44px touch controls where established.
- **Do** distinguish recorded measurements from planning estimates in labels.
- **Do** check the relevant surface contract before changing its composition.

### Don't:
- **Don't** add decorative color or imagery that competes with geography.
- **Don't** duplicate editing controls across competing panes in the editor.
- **Don't** claim legacy components already conform to the shared system.
- **Don't** replace visible state, labels or status copy with color alone.
