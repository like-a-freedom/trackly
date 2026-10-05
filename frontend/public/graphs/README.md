# Local routing data

Coverage: Dmitrov–Pravdinsky, Moscow region, bbox south/west/north/east
`55.95,37.30,56.48,38.03`. Six profiles: hiking, walking, running, cycling,
MTB, driving. The UI identifies coverage and rejects points outside it.

Source: OpenStreetMap contributors, downloaded from the VK Overpass mirror
https://maps.mail.ru/osm/tools/overpass/api/interpreter on 2026-10-05. The
download retries the primary mirror and falls back to other public Overpass
mirrors on failure, so a transient mirror error cannot fail the build.
Source timestamp and attribution are in manifest.json. OpenStreetMap data is
licensed under ODbL 1.0: https://www.openstreetmap.org/copyright . Generated
routing databases remain subject to that license. Retain attribution when
redistributing them. https://opendatacommons.org/licenses/odbl/1-0/

Reproduce from frontend: `python3 scripts/prepare-routing.py`.
For the exact downloaded extract, use `--extract /path/to/overpass.json`; to pin
a specific mirror set `OVERPASS_URL=https://<mirror>/api/interpreter`.
The builder validates extract completeness and creates FastGraph32 packs plus
little-endian f64 node positions. Versions hash both files with SHA256; a changed
network invalidates the browser cache. Large binary packs are local build assets,
excluded from Git; prepare them before a standalone frontend production build. Docker and CI prepare
the territory automatically; their generated manifest replaces the local manifest.

Routing optimizes distance with highway/access/oneway rules. This is route
planning, not turn-by-turn navigation: turn restrictions are not modelled.
Surface classes are unknown where the pack has no surface data. Source extraction
query: `[out:json][timeout:180];way["highway"](55.95,37.30,56.48,38.03);out body geom;`.
