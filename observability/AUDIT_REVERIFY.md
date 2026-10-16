# Observability Audit — Re-verification (post-4d4eac2)

Cross-checked every claim against `backend/src/metrics.rs`, handler call sites,
`observability/alerts.yml`, `observability/recording_rules.yml`, `observability/vmagent.yml`.

## P0 — Silent correctness bugs

### P0-1 `vmagent.yml` `write_relabel_configs` destroys the pipeline (uncommitted)
The block does three catastrophic things:
- `action: keep` with regex `.*_bucket|.*_sum|.*_count` keeps ONLY histogram series.
  Every counter (`*_total`) and gauge is DROPPED before remote-write.
- `labelkeep` regex omits `le` -> `histogram_quantile` (all latency panels + alerts) breaks.
- `labelkeep` omits `code` -> Caddy `FrontendHighErrorRate` (`code=~"5.."`) breaks.
- `labeldrop session_hash` -> all product recording rules (engagement/retention/sessions)
  and product dashboard panels break.
**Fix:** delete the whole `write_relabel_configs` block. Manage cardinality via VictoriaMetrics
retention + `-search.maxUniqueTimeseries` / `-maxLabelValueLength`, not by dropping labels.

### P0-2 `trackly_session_heartbeat` is only ever emitted for `activity="map"`
`metrics::record_session_activity` is called from exactly one place:
`handlers/observability.rs:19` (map interaction, `activity="map"`).
It is NEVER called for view / upload / edit / search / export / enrich.
Consequences:
- `engagement_score_7d` weights upload=10, view=2, enrich=10, edit=5, search=5, export=5 —
  none of which are emitted, and `map` isn't weighted at all -> real engagement always ~0.
- `sessions_active_*`, `retention_d1/d7/d30`, `new_sessions_1d_approx` count sentinel session only.
- Alerts `LowD7Retention`, `HighChurnRisk` and large parts of the product dashboard monitor nothing.
**Fix (code):** wire `metrics::record_session_activity(session_id, "...")` into the upload,
view, search, edit, export and enrich handlers where `session_id` is available.

## P1 — Alert coverage / correctness

### P1-1 No auth alert coverage at all — FIXED
Added `trackly_auth_security` group: `HighLoginFailureRate`, `SustainedRateLimiting`,
`SuspiciousTokenRefreshFailures`, `AuthSessionsCollapsed`.

### P1-2 `BackendUpstreamUnhealthy` uses a phantom metric — FIXED
Removed the alert (comment left in place explaining why). `caddy_reverse_proxy_upstreams_healthy`
is not emitted by the Caddy prometheus plugin. Backend reachability is covered by
`BackendDown` + `FrontendHighErrorRate`.

## Applied in this pass
- `observability/vmagent.yml`: deleted the broken `write_relabel_configs` block (P0-1).
- `observability/alerts.yml`: added auth group, removed phantom upstream alert (P1-1, P1-2).
- Cross-checked every active alert/recording-rule expression against emitted metrics:
  no phantom metric names remain in any `expr:` (verified programmatically).

## Open — needs your go-ahead (P0-2)
### Wire `trackly_session_heartbeat` into real handlers
Currently only `activity="map"` is ever emitted (`handlers/observability.rs:19`).
To make engagement/retention/sessions meaningful, add
`metrics::record_session_activity(session_id, "...")` to:
- upload (weight 10) — `handlers/tracks/upload.rs` (session_id already extracted)
- view (2), edit (5), search (5), export (5), enrich (10)

Trade-off to confirm: this raises `session_hash` cardinality in VictoriaMetrics
(each anonymous session × activity becomes a series). Mitigations: VM retention,
`-maxLabelValueLength`, `-search.maxUniqueTimeseries`. Authenticated users have
`session_id = None`, so only anonymous sessions contribute — acceptable for now.
I did not touch the running backend for this because it is a cardinality/performance
decision. Say the word and I will implement it.


## Verified OK (no change needed)
- Auth dashboard panels (101-106) use correct labels `success="success"/"failed"` and `by (endpoint)`.
- `track_enrich_requests_total` label is `status`; `queue_full` IS emitted (track_upload.rs:344).
- `elevation_api_calls_total` label `service`; `http_requests_errors_total` exists.
- Recording rules are self-consistent given `session_hash` present (restored by P0-1 fix).
