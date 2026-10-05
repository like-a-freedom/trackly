# Trackly

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Store GPS tracks, find and assess them on a map, import GPX/KML recordings, construct routes, and obtain a permanent link to a saved result.

## Users

People storing recorded GPS tracks and planning routes. Anonymous session owners and authenticated account owners can manage their own tracks; other visitors can inspect accessible tracks.

## Capabilities and Constraints

Vue, Leaflet, Rust/Axum, PostgreSQL/PostGIS. Preserve geometry, segments, waypoints, POI, supported categories, recorded series, routing, Undo/Redo and export. Recorded measurements and planned estimates have different meanings. Ownership is enforced by the API. Feature flags control auth and editor availability. Use bun; do not start the existing application servers. Do not invent additional permissions or claims.

## Brand Commitments

Trackly. The user requested a coherent, structured interface and a complete redesign from first principles, prioritising route creation. The approved mitigation plan defines a map with one working pane, task-based editing, and a collapsible mobile sheet. English is the current interface language.

## Evidence on Hand

The current application and `docs/audit/2026-10-04-ui-ux-audit.md`. Implementation scope and acceptance contracts are in `docs/audit/2026-10-04-design-mitigation-plan.md`.

## Product Principles

- One owner for editable content; contextual tools follow the selected object.
- Preserve work and communicate the exact saved revision.
- Keep the map usable on a small phone.
- Make errors, missing data and permissions explicit.
- Preserve recorded data when planning a derived route.
