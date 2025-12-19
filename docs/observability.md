# Observability SRS for Trackly

## 1. Purpose and Scope
- Define observability requirements (metrics, dashboards, alerts, logging practices) for Trackly backend, frontend (Caddy), and data plane (PostgreSQL, host/container runtime).
- Cover golden signals (latency, traffic, errors, saturation) and product metrics tied to the track workflow.
- Use Prometheus-compatible metrics collection (vmagent as scraper), Grafana for analysis/visualization (deployed separately). Tracing is optional but recommended for correlation.

## 2. Stakeholders
- Product & Engineering: reliability, feature validation via product metrics.
- SRE/DevOps: uptime, capacity, alerting, on-call.
- Data/Analytics: usage and conversion of track features.

## 3. System Overview (observability view)
- Frontend served by Caddy reverse proxy (`frontend` container) with metrics exposed via Caddy admin API at `:2019/metrics` (already scraped by vmagent).
- Backend Rust/Axum service (`backend` container) with PostgreSQL (`db`). Metrics endpoints must be added at `/metrics` (Prometheus format). Health endpoint already exists at `/health`.
- vmagent acts as Prometheus scraper and remote-write client (if configured). Grafana runs outside this stack; dashboards must be importable via JSON.

## 4. Standards and Constraints
- Metrics format: Prometheus exposition; histogram buckets explicit; label cardinality controlled (no unbounded user/input values).
- Environment configuration: all endpoints/ports/URLs and feature flags via env vars (12-factor). No secrets in metrics/labels.
- Logs: structured JSON to stdout; timestamps in UTC; include `request_id`/`trace_id` correlation fields when available.
- Retention and storage are handled by the Prometheus/VM backend (out of scope for this SRS), but scrape interval defaults to 15s.

## 5. Golden Signals per component
- Backend API: request latency (p50/p90/p99), error rate (5xx + selected 4xx), request volume, in-flight requests, response size, saturation (threadpool/executor backlog, DB connection usage).
- Track processing pipeline: upload → parse → deduplicate → persist → enrichment (elevation/slope) → classification → export.
- PostgreSQL: connections, cache hit ratio, block read time, replication lag (if any), locks, deadlocks, checkpoints, table bloat (if exporter supports).
- Caddy/frontend edge: request rate, error rate, p95 latency, upstream health, TLS cert validity, saturation (CPU/mem of Caddy process).
- Platform: container CPU/memory, filesystem usage, network I/O (node_exporter or cAdvisor equivalent).

## 6. Functional Requirements
### 6.1 Metrics Exposure
- Backend exposes `/metrics` (no auth inside cluster; optional basic auth for public deployments) using Prometheus format.
- Metrics must be lightweight (sub-ms render) and non-blocking; histogram buckets chosen to avoid high cardinality and to cover common ranges.
- vmagent scrapes:
  - `frontend:2019/metrics` (already in `observability/vmagent.yml`).
  - `backend:8080/metrics` (to be added).
  - `node-exporter:9100/metrics` or `cadvisor:8080/metrics` if present.
  - `postgres-exporter:9187/metrics` if enabled for PostgreSQL.
- Exported metrics must support multi-instance labels: `service`, `instance`, `version`, `env`.

### 6.2 Backend API Metrics (Rust/Axum)
- HTTP server metrics (per route and aggregated):
  - `http_requests_total{method,route,status}` counter.
  - `http_request_duration_seconds_bucket` histogram with buckets (0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10).
  - `http_request_size_bytes_bucket`, `http_response_size_bytes_bucket` histograms.
  - `http_requests_in_flight` gauge.
- Error tracking:
  - `http_requests_errors_total{status_class}` counter (4xx/5xx).
  - `track_upload_failures_total{reason}` counter (reasons: validation, rate_limit, parse_error, duplicate, db_error, size_limit).
- Throughput / business metrics:
  - `tracks_uploaded_total{source=anonymous}` counter.
  - `tracks_deduplicated_total` counter (hash matches existing track).
  - `tracks_deleted_total` counter.
  - `pois_created_total`, `pois_deleted_total` counters.
  - `track_categories_total{category}` counter.
  - `track_length_km_bucket` histogram (log-scale buckets) to see distribution of uploaded tracks.
- Processing and enrichment metrics:
  - `track_parse_duration_seconds_bucket` histogram.
  - `track_simplify_duration_seconds_bucket` histogram.
  - `track_elevation_enrich_duration_seconds_bucket` histogram.
  - `track_elevation_enrich_requests_total{status}` counter; `status` ∈ {success, failed, rate_limited, remote_error}.
  - `track_slope_recalc_duration_seconds_bucket` histogram.
  - `track_export_duration_seconds_bucket` histogram for GPX export.
  - `track_pipeline_latency_seconds` gauge: end-to-end upload to ready state.
- DB interaction metrics:
  - `db_query_duration_seconds_bucket{operation}` histogram for key queries (list_tracks_geojson, get_track_detail_adaptive, insert_track, update_track, delete_track, POI queries).
  - `db_pool_connections{state}` gauges (in_use, idle, max) via sqlx/axum-metrics integration.
- Queue/backpressure (if futures executor/backpressure metrics are available): `runtime_tasks_pending` gauge.

### 6.3 Database Metrics (via postgres_exporter)
- Connection saturation: `pg_stat_activity_count`, `pg_max_connections`, `pg_stat_activity_idle_in_transaction`.
- Cache and I/O: `pg_stat_database_blks_hit`, `pg_stat_database_blks_read`, `pg_stat_database_tup_returned/fetched/inserted/updated/deleted`.
- Write health: checkpoints, WAL segment stats, replication lag (if replica configured).
- Locks and conflicts: `pg_locks_count{mode}`, deadlocks.
- Table/index bloat or vacuum age if exporter provides (otherwise custom view).

### 6.4 Caddy / Edge Metrics (already exposed)
- Request rate, error rate, latency (use existing metrics `caddy_http_requests_total`, `caddy_http_request_duration_seconds_bucket`).
- Upstream health: `caddy_reverse_proxy_upstreams_healthy`.
- Process stats: `process_resident_memory_bytes`, `process_cpu_seconds_total`, uptime.
- TLS expiry: `caddy_tls_cert_expiration_timestamp`.

### 6.5 Platform Metrics (node_exporter/cAdvisor)
- CPU utilization, load average, memory usage, disk space/inode usage, network I/O per container.
- Container restarts and OOM kills (from container runtime metrics or cadvisor).

### 6.6 Logging
- Backend logs: JSON lines, include `level`, `ts`, `logger`, `msg`, `request_id`/`trace_id`, `route`, `status`, `latency_ms`, `user_agent`, `remote_ip`, `session_id` when present. Log to stdout only (12-factor). No PII in logs.
- Caddy logs: keep structured console output as configured; ensure access logs include `request_id` propagated from backend when available.

### 6.7 Tracing (optional but recommended)
- If OpenTelemetry is enabled, propagate W3C trace context across Caddy → backend. Export to OTLP collector (out of scope for this SRS). Metrics should include `trace_id` exemplar support when feasible.

### 6.8 Dashboards (Grafana)
- Provide importable JSON dashboards and follow SRE-first structure (top → bottom): SLIs → Golden Signals → Business metrics → Debugging details.
  - **Caddy Reverse Proxy Overview** (already in `observability/caddy-grafana-dashboard.json`).
  - **Trackly: Technical Metrics** (SRE dashboard - `observability/dashboards/technical-metrics.json`, uid `trackly-technical`): a concise, actionable dashboard organized as:
    - **Service Level Indicators (SLIs)**: Backend Status, Availability SLI (non-5xx), Latency SLI (requests & Apdex), Error Budget/Availability.
    - **Golden Signals (RED / USE)**: Traffic (RPS), Errors (4xx/5xx), Duration (p50/p95/p99), Saturation resources (DB pool, in-flight requests, queue depth), and Background Tasks.
    - **Business Metrics**: Track uploads, deduplication, POIs created/deleted, enrichment attempts and outcomes.
    - **Debugging & Detailed Views**: Bulk operations, GPX export, DB slow queries, background task tests.
  - **Backend API Golden Signals** (detailed views): latency by route, error rates, top failing endpoints, pipeline durations.
  - **Backend Product Metrics**: tracks uploaded over time, dedup hits, categories distribution, POIs created, enrichment success/failure, export counts.
  - **PostgreSQL Health**: connections, cache hit ratio, slow queries, locks, checkpoint stats, replication (if any).
  - **Platform/Host**: CPU/mem/disk/net, per-container usage and restarts.
- All dashboards must be scoped by variables: `env`, `service`, `instance`, `route`, `status_class` where relevant. Default interactive exploration time range: last 6h; technical SLI panels may use short windows (e.g., last 15m) and dashboards can refresh as low as 10s for rapid feedback.

#### 6.8.1 Dashboard implementation notes (promql & panel guidelines)
- Panel annotation standard: every panel should include a `description` that answers: **What**, **Why**, **Targets** (✅/⚠️/🚨 thresholds), **Interpretation**, **Actions** (runbook links or first steps).
- Rare events / low-frequency counters: use `increase(metric[1h])` (or larger window) rather than `rate(...[5m])` to avoid empty series for sparse events (POIs created, tracks deleted, dedup counts).
  - Example: `sum(increase(pois_created_total{job="trackly_backend"}[1h]))`
- Latency histograms: use `histogram_quantile` over `sum(increase(...[1h]))` and provide a fallback to avoid empty charts: `histogram_quantile(0.95, sum(increase(track_parse_duration_seconds_bucket{job="trackly_backend"}[1h])) by (le, format)) or vector(0)`.
- Short-lived gauge spikes (in-flight counters, background tasks): use `max_over_time(gauge[5m])` to capture spikes that may be missed by instant reads.
  - Example: `max_over_time(http_requests_in_flight{job="trackly_backend"}[5m])`
  - Example: `max_over_time(background_tasks_in_flight{job="trackly_backend"}[5m])`
- Binary division / ratios across different label sets: use `ignoring()` and stable windowing to avoid missing data and label mismatches. Add fallbacks (`or vector(0)` / `or vector(1)`) to avoid division by zero or no-data:
  - DB pool utilization snippet:

```
((avg_over_time(db_pool_connections{job="trackly_backend", state="in_use"}[5m]) or vector(0))
  / ignoring(state)
  (avg_over_time(db_pool_connections{job="trackly_backend", state="max"}[5m]) or vector(1))) * 100
```

- Availability SLI (robust to missing samples):
```
1 - (sum(rate(http_requests_errors_total{job="trackly_backend", status_class="5"}[5m])) or vector(0))
    / sum(rate(http_requests_total{job="trackly_backend"}[5m]))
```
- Add `or vector(0)` fallbacks where appropriate to ensure panels show `0` instead of "No data" when series are absent.
- Prefer `increase(...[1h])` for stat panels that summarize events over a window (e.g., "POIs Created (1h)").


These implementation notes are applied in `observability/dashboards/technical-metrics.json` (uid `trackly-technical`) and should be used as a template when creating new panels or dashboards for the service.

### 6.9 Alerting (Prometheus rules; to be deployed with vmagent or Alertmanager-compatible stack)
- Backend HTTP:
  - `p95 latency > 1.5s for 5m` or `p99 > 3s for 5m` on primary routes.
  - `error_rate (5xx) > 2% for 5m` or `>5% for 1m` (page).
  - `in_flight` near max concurrency for 5m.
- Upload pipeline:
  - `track_upload_failures_total` rate spikes > baseline by 3x for 10m.
  - `track_pipeline_latency_seconds` > 30s p95 for 10m.
- DB:
  - `connections_used / max_connections > 0.8 for 5m`.
  - `cache_hit_ratio < 0.9 for 15m` (warning), `<0.85` (critical).
  - `deadlocks_total > 0` over 5m.
- Caddy:
  - `http_errors_rate > 2% for 5m`.
  - TLS cert expires in <7 days (warning) and <2 days (critical).
- Platform:
  - `container_cpu_usage_seconds_total` > 85% for 5m.
  - `container_memory_working_set_bytes` > 90% of limit for 5m.
  - Disk space <15% free (warning), <5% (critical).

## 7. Non-Functional Requirements (12-Factor alignment)
- Config via env vars: scrape targets, ports, credentials for exporters (if auth), feature flags for metrics.
- Disposability: metrics endpoints start within 5s of app start; graceful shutdown drains in-flight requests and keeps final metrics flush.
- Dev/prod parity: metrics enabled in dev with low-cardinality labels; sampling or fewer buckets allowed locally.
- Observability code must not materially affect request latency (>1% overhead target).

## 8. Security & Privacy
- No user PII in metrics labels/values. Session or request IDs must be anonymized if emitted (hashed with salt) or avoided entirely; prefer synthetic request IDs.
- Metrics endpoints should be network-restricted (internal network or protected by basic auth/mtls in public setups).
- Logs must avoid storing uploaded file contents, raw GPX/KML data, or precise user coordinates beyond what is already stored as core data.

## 9. Acceptance Criteria
- Backend exposes `/metrics` with HTTP metrics, DB pool gauges, and track pipeline counters/histograms as listed.
- vmagent scrapes backend, Caddy, and (if present) node/postgres exporters; configs supplied in repo for these targets.
- Grafana dashboards JSON present for Caddy (existing) and new backend/product/DB/platform dashboards.
- Alerting rules provided as PrometheusRule YAML snippet or vmagent-compatible rules file.
- Documentation in `docs/observability-srs.md` describing metrics, dashboards, alerts, and configuration knobs (this document).

## 10. Implementation Notes (guidance)
- Backend Rust: use `metrics` or `opentelemetry-metrics` with Prometheus exporter, or `tower-http` metrics layer for HTTP plus custom counters/histograms for domain events. Wrap DB calls with timing macros to emit `db_query_duration_seconds`.
- Prefer static label sets; avoid embedding `track_id` or `bbox` values in labels.
- For postgres_exporter: mount connection string via env; limit queries to default set plus optional bloat/locks if needed.
- For node_exporter/cAdvisor: run as sidecar containers; add scrape jobs to `observability/vmagent.yml` with `job_name` per exporter.
- Keep scrape interval 15s; reduce to 5s for latency-sensitive golden signals if storage allows.
