# Trackly Observability Configuration

Configuration for monitoring the Trackly application using VictoriaMetrics, vmagent, and Grafana.

## Structure

```
observability/
├── vmagent.yml              # vmagent configuration for scraping metrics
├── alerts.yml               # Alerting rules
├── dashboards/
│   ├── technical-metrics.json   # Technical metrics (HTTP, DB, resources)
│   ├── product-metrics.json     # Product metrics (tracks, POIs, activity)
│   └── caddy-frontend.json      # Caddy reverse proxy metrics
└── README.md                # This documentation
```

## Components

### 1. VictoriaMetrics (victoriametrics:8428)
Time-series database used to store metrics. In production, an external instance is recommended.

### 2. vmagent
Scraper agent that gathers metrics from various sources and sends them to VictoriaMetrics.

**Configuration**: `vmagent.yml`

**Metric sources**:
- `trackly_backend:8080/metrics` - backend application metrics (Prometheus format)
- `frontend:2019/metrics` - Caddy metrics (if enabled)
- `postgres_exporter:9187/metrics` - PostgreSQL metrics (optional)

**Scrape intervals**:
- Backend: 15 seconds
- Frontend/Caddy: 30 seconds
- PostgreSQL: 30 seconds

### 3. Alerting Rules
**File**: `alerts.yml`

**Alert groups**:

#### Backend Health
- `BackendDown` - backend is down (critical)
- `HighErrorRate` - error rate > 5% (warning)
- `HighLatency` - p95 latency > 2s (warning)
- `VeryHighLatency` - p95 latency > 5s (critical)

#### Database Health
- `DatabaseConnectionPoolExhausted` - >90% of DB connections in use (warning)
- `SlowDatabaseQueries` - p95 DB query time > 1s (warning)

#### Track Processing
- `HighTrackUploadFailureRate` - >10% of uploads are failing (warning)
- `SlowTrackParsing` - p95 parsing time > 5s (warning)
- `ElevationEnrichmentFailures` - >30% enrichment failures (warning)
- `SlowElevationEnrichment` - p95 enrichment time > 10s (warning)

#### Resource Usage
- `HighMemoryUsage` - process memory usage > 1GB (warning)
- `TooManyBackgroundTasks` - >50 background tasks (warning)

#### Product Metrics
- `NoTracksUploadedRecently` - no uploads in the last 2 hours (info)
- `HighTrackDeduplicationRate` - >50% duplicates (info)

#### Frontend Health (Caddy)
- `FrontendDown` - Caddy is down (critical)
- `FrontendHighErrorRate` - >5% 5xx error rate (warning)
- `FrontendHighLatency` - p95 latency > 3s (warning)
- `BackendUpstreamUnhealthy` - upstream backend is unhealthy (critical)
- `FrontendHighMemoryUsage` - >512MB memory usage (warning)
- `FrontendHighGoroutines` - >1000 goroutines (warning)

### 4. Grafana Dashboards

#### Technical Metrics Dashboard
**File**: `dashboards/technical-metrics.json`

**Sections**:
1. **Service Health Overview**
   - Backend status
   - HTTP request rate
   - HTTP error rate
   - Requests in flight

2. **HTTP Performance Metrics**
   - Request latency (p50, p95, p99) per endpoint
   - Request/response size (p95)

3. **Database Metrics**
   - Connection pool usage
   - Query latency per operation
   - Query rate

4. **Track Processing Performance**
   - Track upload/parsing latency
   - Elevation enrichment latency
   - Track simplification & slope recalculation

5. **Resource Usage**
   - Background tasks count

#### Product Metrics Dashboard
**File**: `dashboards/product-metrics.json`

**Sections**:
1. **Track Upload Activity**
   - Tracks uploaded (24h, 7d)
   - Deduplicated tracks
   - Upload failures
   - Tracks deleted
   - Upload success rate
   - Upload activity over time
   - Tracks by source (pie chart)

2. **Track Characteristics**
   - Track length distribution (histogram)
   - Track categories (pie chart)

3. **Feature Usage**
   - Elevation enrichments count
   - POIs created/deleted
   - Elevation success rate
   - Activity over time

4. **API Usage Patterns**
   - Top 10 endpoints by request rate
   - Endpoint usage summary table

5. **Track Export & Data Flow**
   - Track exports by format (GPX, KML, etc.)
   - Total exports (24h)
   - Upload failures by reason (pie chart)
   - Track lifecycle (uploaded, deduplicated, deleted)
   - Enrichment success rate
   - Deduplication rate

#### Caddy Frontend Dashboard
**File**: `dashboards/caddy-frontend.json`

**Sections**:
1. **Service Health**
   - Caddy status
   - Uptime
   - Memory usage
   - Active goroutines
   - Total HTTP requests (24h)

2. **HTTP Traffic**
   - Requests by handler
   - Requests by status code
   - Error rate
   - Request latency (p50, p95, p99)

3. **Reverse Proxy**
   - Upstream health status
   - Upstream request rate
   - Upstream failures
   - Response size distribution

4. **Go Runtime**
   - Memory usage (heap, stack, sys)
   - GC pause duration

## Setup

### Running vmagent in production

```bash
# Docker
docker run -d \
  --name vmagent \
  -v /path/to/observability/vmagent.yml:/etc/vmagent/vmagent.yml \
  -p 8429:8429 \
  victoriametrics/vmagent:latest \
  -promscrape.config=/etc/vmagent/vmagent.yml \
  -remoteWrite.url=http://victoriametrics:8428/api/v1/write
```

### Importing dashboards into Grafana

1. Open Grafana UI
2. Go to Dashboards → Import
3. Upload the JSON file from `observability/dashboards/`
4. Choose the datasource: `victoriametrics` (Prometheus type)
5. Click Import

### Setting up the datasource in Grafana

1. Configuration → Data sources → Add data source
2. Select Prometheus
3. URL: `http://victoriametrics:8428`
4. Name: `victoriametrics`
5. Save & Test

### Alerting configuration

You can configure alerts using either:

1. **Grafana Alerting** (recommended):
   - Import `alerts.yml` as a provisioning file or create rules manually via the UI

2. **VictoriaMetrics vmalert**:
```bash
docker run -d \
  --name vmalert \
  -v /path/to/observability/alerts.yml:/etc/vmalert/alerts.yml \
  victoriametrics/vmalert:latest \
  -datasource.url=http://victoriametrics:8428 \
  -rule=/etc/vmalert/alerts.yml \
  -notifier.url=http://alertmanager:9093
```

## Available Metrics

### HTTP metrics
- `http_requests_total` - number of requests
- `http_request_duration_seconds` - request latency
- `http_requests_in_flight` - current in-flight requests
- `http_request_size_bytes` - request size
- `http_response_size_bytes` - response size
- `http_requests_errors_total` - error count

### Database metrics
- `db_pool_connections` - connection pool state
- `db_query_duration_seconds` - DB query latency

### Track processing metrics
- `tracks_uploaded_total` - tracks uploaded
- `tracks_deduplicated_total` - duplicated tracks
- `track_upload_failures_total` - upload failures
- `tracks_deleted_total` - deleted tracks
- `track_categories_total` - track categories
- `track_length_km_bucket` - distribution of track lengths
- `track_parse_duration_seconds` - parsing time
- `track_pipeline_latency_seconds` - end-to-end pipeline latency
- `track_simplify_duration_seconds` - simplification time
- `track_slope_recalc_duration_seconds` - slope recalculation time

### Elevation enrichment metrics
- `track_enrich_requests_total` - enrichment requests
- `track_enrich_duration_seconds` - enrichment duration

### POI metrics
- `pois_created_total` - POIs created
- `pois_deleted_total` - POIs deleted/unlinked

### Resource metrics
- `background_tasks_in_flight` - background jobs in flight

## Labels

Metrics include the following labels:
- `service` - service name (backend, frontend)
- `env` - environment (dev, prod)
- `instance` - instance ID
- `version` - application version
- `method` - HTTP method
- `route` - endpoint
- `status_class` - status class (2xx, 4xx, 5xx)
- `operation` - DB operation
- `format` - track format (gpx, kml)
- `source` - track source (anonymous)
- `category` - track category
- `reason` - failure reason
- `result` - operation result
- `state` - pool state (idle, in_use)
- `outcome` - result (success, failed)
- `mode` - mode (detail, overview)

## Best practices

1. **Monitor alerts regularly** - configure notification channels (Slack, email, PagerDuty)

2. **Watch cardinality** - avoid labels with very high cardinality (user_id, track_id)

3. **Use recording rules** - create pre-aggregated metrics for frequently used queries

4. **Retention policy** - configure retention on VictoriaMetrics
```
-retentionPeriod=30d  # Keep data for 30 days
```

5. **Backup** - make regular backups of critical metric data

6. **Capacity planning** - monitor data growth and plan scaling ahead

## Troubleshooting

### Metrics not being scraped

1. Verify the endpoint is reachable:
```bash
curl http://backend:8080/metrics
```

2. Check vmagent logs:
```bash
docker logs vmagent
```

3. Validate configuration:
```bash
# Validate YAML
yamllint vmagent.yml
```

### Dashboards show no data

1. Check the Grafana datasource
2. Verify metrics in VictoriaMetrics:
```bash
curl 'http://victoriametrics:8428/api/v1/query?query=up'
```
3. Verify the datasource UID in the dashboard (should be `victoriametrics`)

### Alerts not firing

1. Check alert rules in vmalert/Grafana
2. Verify notifier/contact points
3. Check thresholds in `alerts.yml`

## Useful links

- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/)
- [vmagent Documentation](https://docs.victoriametrics.com/vmagent.html)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)



