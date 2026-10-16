# ADR-0033: Split TrackDetailPanel.vue into child components and composables

## Status
Accepted

## Context
`TrackDetailPanel.vue` was 3995 LOC owning nine concerns: the track header with inline
name/description editing, GPX export and sharing, categories, basic info, map overlays, statistics,
the elevation chart with its enrichment flow, slope analysis, and track metadata.

Size was only half of the problem. The file also mixed three different kinds of state: view-only
rendering, reusable behaviour (tooltip placement, elevation enrichment/polling), and HTTP calls
written as raw `fetch` (ADR 0018).

An earlier revision of this ADR stopped after `CategoriesPanel.vue` and described the remaining
extraction as deferred, blocked by closure dependencies on shared refs (`track`, `chartMode`, the
polling state). That is no longer accurate: all four panels are extracted and rendered, and the
blockers were resolved by passing state through explicit props/events and a typed options object.

## Decision
Two-step extraction, code motion only — no logic, signature or behaviour change.

### Child components — `frontend/src/components/TrackDetailPanel/`
| Component | LOC | Owns |
| --- | --- | --- |
| `CategoriesPanel.vue` | 38 | Category chips and their inline editing |
| `StatisticsPanel.vue` | 164 | Basic info, map overlays, statistics |
| `ElevationPanel.vue` | 236 | Elevation stats, chart, the "force update" action |
| `TrackInfoPanel.vue` | 42 | Track metadata |

Shared state crosses the boundary explicitly: `track`, `isOwner` and `categoriesList` go in as props;
`categories-change`, `force-enrich-elevation` and `stop-elevation-polling` come out as events. The
panel keeps its scoped styles for the child sections, because the children render inside its flyout —
hence the `:deep()` rules that reach into them.

### Composables — `frontend/src/composables/`
- `useTooltipPlacement.ts` (128 LOC) — binds hover/focus/touch handlers to every
  `.info-icon[data-tooltip]` inside the flyout and measures above/below placement. It measures
  instead of deriving placement from the icon geometry because the measurement node has to live
  inside the panel for the panel's scoped font/padding styles to apply.
- `useElevationEnrichment.ts` (402 LOC) — the manual "force update" action plus the background
  poller (recursive `setTimeout` with exponential backoff, capped at 15 attempts so a slow backend
  cannot pile up overlapping requests). Collaborators arrive through `ElevationEnrichmentOptions`;
  `track` stays a `Ref`, so `applyElevationUpdate` keeps merging into the same reactive object the
  panel renders.

### HTTP
The four remaining raw `fetch` calls in the panel (inline name, inline description, full track
refresh, GPX export) now go through the shared `http()` client, and so do the three that moved into
`useElevationEnrichment.ts` with the elevation flow.

### Deliberately left in the panel
GPX export/sharing and the inline name/description editing stay inline. They are driven by the
panel's own chrome (header buttons, download link) and extracting them would add an interface
without removing a reason to change — the fetches themselves are already on `http()`.

## Consequences
- `TrackDetailPanel.vue`: 3995 → 3578 LOC (-417).
- Elevation polling and tooltip placement are unit-testable without mounting the panel
  (`useTooltipPlacement.test.ts`, `useElevationEnrichment.test.ts` — 7 + 16 tests).
- `defineExpose` is unchanged, so tests that drive `pollForElevationData`,
  `startElevationPolling`, `stopElevationPolling`, `isPollingForElevation` and
  `enrichmentPollingInterval` keep working.
- Template refs must keep their inferred type. `const flyoutContent = ref(null)` binds correctly,
  but `ref<HTMLElement | null>(null)` silently defeats the SFC compiler's template-ref detection:
  the element never reaches the setup variable, so every touch/wheel/scroll handler guarded by
  `if (!flyoutContent.value) return` becomes a no-op. The touch-event tests catch this.
- `http()` resolves the token before issuing the request, so enrichment now lands one microtask
  later than the raw `fetch` it replaced. The affected tests await the state instead of assuming
  it: in vitest 4.1 `vi.waitFor` resolves as soon as its callback returns a non-thenable value
  (i.e. it never polls), so a truthy condition has to go through `vi.waitUntil`.
