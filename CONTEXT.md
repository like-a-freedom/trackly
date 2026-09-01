# Trackly — Domain Glossary

## Track
A GPS recording with geometry (LineString or MultiLineString), timestamps, and optional metadata (name, description, categories). Stored as GeoJSON in PostgreSQL+PostGIS.
_Avoid_: route, path, trail (too generic).

## Track Detail
A full track response from `GET /api/tracks/:id` including elevation profile, speed data, heart rate, and slope segments.
_Avoid_: full track, complete track.

## Track Simplified
A reduced-geometry track response for overview display at lower zoom levels. Backend applies Douglas-Peucker simplification based on zoom.
_Avoid_: lightweight track, small track.

## POI (Point of Interest)
A named geospatial point with optional category. Stored in PostGIS; queried by bounding box.
_Avoid_: marker, pin (those are UI representations).

## User
An authenticated account with name, email, and optional avatar. Identified by OAuth tokens (Google).
_Avoid_: account, member.

## Session
An anonymous tracking session identified by a UUID stored in localStorage. Used for anonymous track ownership.
_Avoid_: visitor, guest.

## Category
A tag applied to a track (e.g., hiking, walking, running, cycling). Many-to-many relationship.
_Avoid_: tag, label.

## Elevation
Vertical profile data: elevation_gain, elevation_down, elevation_profile (distance→elevation array), elevation_dataset.
_Avoid_: altitude (implies instantaneous, not profile).

## Slope
Grade data derived from elevation: slope_min, slope_max, slope_segments.
_Avoid_: gradient, grade.

## Enrichment
The process of fetching external data (elevation from Open-Meteo API) and attaching it to a track.
_Avoid_: augmentation, enhancement.

## Auth
OAuth 2.0 with PKCE for Google sign-in. Managed by `frontend/src/auth/` modules.
_Avoid_: login, authentication (use "auth" as shorthand).

## Refresh Token
A long-lived token used to obtain new access tokens. Stored httpOnly cookie.
_Avoid_: session token, bearer token.

## MapAdapter
Port interface for map rendering. Implementations: LeafletAdapter (production), StubAdapter (tests).
_Avoid_: map service, map provider.

## TrackMap
The main map component (2734 LOC). Renders tiles, GeoJSON, clusters, POIs, elevation overlays.
_Avoid_: map component, map view.

## Deferred Follow-ups
- `TrackDetailPanel.vue` (4156 LOC) — needs splitting
- `AccountView.vue` (~1520 LOC) — needs splitting
- `useSearchState.js` — module-singleton but production-dead; can be deleted
- `useTracks.js` — module-scope singleton; Pinia migration deferred
- `LeafletAdapter.js` — full extraction from TrackMap.vue deferred
