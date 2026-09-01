# ADR 0017: Typed Events Module

## Status
Accepted

## Context
Cross-component communication uses `window.dispatchEvent(new CustomEvent(...))` and `window.addEventListener(...)`. This is untyped, hard to trace, and creates implicit coupling through the global window object.

## Decision
Create `frontend/src/events.js` — a minimal mitt-style event bus (~50 LOC) with JSDoc typedefs for each event payload.

### Events migrated
| Event | Payload | Emitter | Listeners |
|---|---|---|---|
| `track-deleted` | `{ id }` | TrackDetailPanel | HomeView |
| `track-name-updated` | `{ trackId, newName }` | TrackDetailPanel | HomeView |
| `track-description-updated` | `{ trackId, newDescription }` | TrackDetailPanel | HomeView |
| `stop-elevation-polling` | none | TrackView | TrackDetailPanel |
| `track-elevation-updated` | `{ trackId, elevation_* }` | TrackDetailPanel | (future) |
| `mapUrlStateChanged` | `{ zoom, center, source }` | useMapUrlState | HomeView |

### Not migrated
- `document.addEventListener("keydown", ...)` — real DOM events, not custom
- `document.addEventListener("click", ...)` — DOM events
- `window.addEventListener("beforeunload", ...)` — browser event

## Consequences
- Event dispatch is now traceable via `events.on()` / `events.off()` / `events.emit()`
- JSDoc typedefs catch typos at call sites
- `events.clear()` available for test cleanup
- 1083 tests pass, build clean
