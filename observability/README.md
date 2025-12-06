# Trackly Observability Configuration

Конфигурация для мониторинга приложения Trackly с использованием VictoriaMetrics, vmagent и Grafana.

## Структура

```
observability/
├── vmagent.yml              # Конфигурация vmagent для сбора метрик
├── alerts.yml               # Правила алертинга
├── dashboards/
│   ├── technical-metrics.json   # Технические метрики (HTTP, DB, ресурсы)
│   └── product-metrics.json     # Продуктовые метрики (треки, POI, активность)
└── README.md                # Эта документация
```

## Компоненты

### 1. VictoriaMetrics (victoriametrics:8428)
База данных временных рядов для хранения метрик. В production используется внешний экземпляр.

### 2. vmagent
Агент для сбора метрик с различных источников и отправки в VictoriaMetrics.

**Конфигурация**: `vmagent.yml`

**Источники метрик**:
- `trackly_backend:8080/metrics` - метрики backend приложения (Prometheus формат)
- `frontend:2019/metrics` - метрики Caddy (если включены)
- `postgres_exporter:9187/metrics` - метрики PostgreSQL (опционально)

**Интервалы сбора**:
- Backend: 15 секунд
- Frontend/Caddy: 30 секунд
- PostgreSQL: 30 секунд

### 3. Alerting Rules
**Файл**: `alerts.yml`

**Группы алертов**:

#### Backend Health
- `BackendDown` - сервис недоступен (critical)
- `HighErrorRate` - высокий уровень ошибок >5% (warning)
- `HighLatency` - p95 latency >2s (warning)
- `VeryHighLatency` - p95 latency >5s (critical)

#### Database Health
- `DatabaseConnectionPoolExhausted` - >90% соединений использовано (warning)
- `SlowDatabaseQueries` - p95 query time >1s (warning)

#### Track Processing
- `HighTrackUploadFailureRate` - >10% загрузок неудачны (warning)
- `SlowTrackParsing` - p95 parsing time >5s (warning)
- `ElevationEnrichmentFailures` - >30% обогащений неудачны (warning)
- `SlowElevationEnrichment` - p95 enrichment time >10s (warning)

#### Resource Usage
- `HighMemoryUsage` - использование памяти >1GB (warning)
- `TooManyBackgroundTasks` - >50 фоновых задач (warning)

#### Product Metrics
- `NoTracksUploadedRecently` - нет загрузок 2 часа (info)
- `HighTrackDeduplicationRate` - >50% дубликатов (info)

### 4. Grafana Dashboards

#### Technical Metrics Dashboard
**Файл**: `dashboards/technical-metrics.json`

**Секции**:
1. **Service Health Overview**
   - Статус backend
   - HTTP request rate
   - HTTP error rate
   - Requests in flight

2. **HTTP Performance Metrics**
   - Request latency (p50, p95, p99) по endpoints
   - Request/Response size (p95)

3. **Database Metrics**
   - Connection pool usage
   - Query latency по операциям
   - Query rate

4. **Track Processing Performance**
   - Track upload/parsing latency
   - Elevation enrichment latency
   - Track simplification & slope recalculation

5. **Resource Usage**
   - Background tasks count

#### Product Metrics Dashboard
**Файл**: `dashboards/product-metrics.json`

**Секции**:
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

## Настройка

### Запуск vmagent в production

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

### Импорт дашбордов в Grafana

1. Откройте Grafana UI
2. Перейдите в Dashboards → Import
3. Загрузите JSON файл из `observability/dashboards/`
4. Выберите datasource: `victoriametrics` (Prometheus type)
5. Нажмите Import

### Настройка datasource в Grafana

1. Configuration → Data sources → Add data source
2. Выберите Prometheus
3. URL: `http://victoriametrics:8428`
4. Name: `victoriametrics`
5. Save & Test

### Настройка алертинга

Alerts можно настроить через:

1. **Grafana Alerting** (рекомендуется):
   - Загрузите `alerts.yml` как provisioning файл
   - Или создайте alert rules вручную в UI

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

## Доступные метрики

### HTTP метрики
- `http_requests_total` - количество запросов
- `http_request_duration_seconds` - latency запросов
- `http_requests_in_flight` - активные запросы
- `http_request_size_bytes` - размер запросов
- `http_response_size_bytes` - размер ответов
- `http_requests_errors_total` - ошибки

### Database метрики
- `db_pool_connections` - состояние connection pool
- `db_query_duration_seconds` - latency запросов к БД

### Track processing метрики
- `tracks_uploaded_total` - загруженные треки
- `tracks_deduplicated_total` - дубликаты
- `track_upload_failures_total` - неудачные загрузки
- `tracks_deleted_total` - удалённые треки
- `track_categories_total` - категории треков
- `track_length_km_bucket` - распределение длины треков
- `track_parse_duration_seconds` - время парсинга
- `track_pipeline_latency_seconds` - end-to-end latency загрузки
- `track_simplify_duration_seconds` - время упрощения
- `track_slope_recalc_duration_seconds` - время пересчёта уклонов

### Elevation enrichment метрики
- `track_enrich_requests_total` - попытки обогащения
- `track_enrich_duration_seconds` - время обогащения

### POI метрики
- `pois_created_total` - созданные POI
- `pois_deleted_total` - удалённые/отвязанные POI

### Resource метрики
- `background_tasks_in_flight` - фоновые задачи

## Labels

Метрики содержат следующие labels:
- `service` - название сервиса (backend, frontend)
- `env` - окружение (dev, prod)
- `instance` - ID инстанса
- `version` - версия приложения
- `method` - HTTP метод
- `route` - endpoint
- `status_class` - класс статуса (2xx, 4xx, 5xx)
- `operation` - операция БД
- `format` - формат трека (gpx, kml)
- `source` - источник (anonymous)
- `category` - категория трека
- `reason` - причина ошибки
- `result` - результат операции
- `state` - состояние (idle, in_use)
- `outcome` - результат (success, failed)
- `mode` - режим (detail, overview)

## Лучшие практики

1. **Регулярно проверяйте алерты** - настройте каналы уведомлений (Slack, email, PagerDuty)

2. **Мониторьте cardinality** - избегайте labels с высокой кардинальностью (user_id, track_id)

3. **Используйте recording rules** - для часто используемых запросов создайте pre-aggregated метрики

4. **Retention policy** - настройте политику хранения в VictoriaMetrics:
   ```
   -retentionPeriod=30d  # Хранить 30 дней
   ```

5. **Backup** - регулярно бэкапьте VictoriaMetrics данные

6. **Capacity planning** - мониторьте рост данных и планируйте масштабирование

## Troubleshooting

### Метрики не собираются

1. Проверьте доступность endpoint:
   ```bash
   curl http://backend:8080/metrics
   ```

2. Проверьте логи vmagent:
   ```bash
   docker logs vmagent
   ```

3. Проверьте конфигурацию:
   ```bash
   # Validate YAML
   yamllint vmagent.yml
   ```

### Дашборды не показывают данные

1. Проверьте datasource в Grafana
2. Проверьте наличие данных в VictoriaMetrics:
   ```bash
   curl 'http://victoriametrics:8428/api/v1/query?query=up'
   ```

3. Проверьте UID datasource в дашборде (должен быть `victoriametrics`)

### Алерты не срабатывают

1. Проверьте правила алертинга в vmalert/Grafana
2. Проверьте notifier/contact points
3. Проверьте пороги (thresholds) в alerts.yml

## Полезные ссылки

- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/)
- [vmagent Documentation](https://docs.victoriametrics.com/vmagent.html)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
