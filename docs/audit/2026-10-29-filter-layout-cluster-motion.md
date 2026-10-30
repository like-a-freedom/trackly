# Filter layout and cluster motion regression — 2026-10-29

## Root causes

- The unlayered scoped `.filter-section label` rule overrode the shared category option's flex layout. It also applied section margins to each nested category label.
- Fixed filter width exceeded a 320 px viewport. The Leaflet stacking context placed the filter below unrelated map controls.
- Slider floating tooltips collided at coincident bounds and used the vendor theme rather than application tokens.
- Both MarkerCluster and the application handled cluster zoom. Individual markers also replaced Leaflet's zoom animation with a no-op.
- A pending cluster update could clear and rebuild layers while the camera was moving.
- Calling `map.stop()` before a flight emitted a synthetic `moveend`. On real local data, URL synchronization then echoed the old center into the ongoing flight: it ended early at the wrong location. Leaflet's own `flyToBounds` already cancels the previous flight.

## Changes

- Scope section-heading styles to direct children; retain the shared category option and its 8 px gap/44 px minimum target.
- Use viewport-constrained panel width and teleport the filter overlay outside the map stacking context.
- Show range values in a separate tabular readout, use application slider colors, and omit unusable sliders for coincident limits. Associate interactive sliders with their headings.
- Give the application sole ownership of cluster camera movement, with an 800 ms flight and immediate fitting under reduced motion. Keep keyboard Enter behavior.
- Restore native marker animation. Defer destructive cluster updates until movement ends and resume them after zoom/pan.

## Verification

- Before fixes, layout regression failed on missing checkbox spacing; motion unit tests failed on duplicate motion configuration and updates during a flight.
- Full frontend unit suite: 2,159 passed. Focused map event suite rerun after removing the redundant stop.
- Production build and TypeScript checking passed.
- Full design E2E suite in WebKit: 22 passed; the final five filter/motion scenarios rerun in WebKit after the real-data fix.
- Chromium: five new filter/motion scenarios passed on the final build.
- E2E checks cover 1280/390/320 px widths, hit-test visibility of the header, checkbox gap/centering, panel containment, non-overlapping range readouts, intermediate camera frames, no blank route/marker frames, reduced motion, and the final destination near the clicked cluster.
- Real localhost data: one `zoomstart`/`movestart`, then matching completion at the cluster center, zoom 7 → 18 in approximately 815 ms. No return to the old center.

Browser tests exercise Chromium and WebKit; they do not substitute for a physical iPhone performance measurement.
