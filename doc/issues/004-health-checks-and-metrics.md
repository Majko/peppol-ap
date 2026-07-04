# Health Checks + Prometheus Metrics

## Parent

Depends on Slice 1 — Storage adapter interface + mock (doc/issues/001-storage-adapter-interface.md)

## What to build

Add three HTTP endpoints for operational observability, instrument the AP Core with Prometheus metrics, and implement graceful shutdown.

### Endpoints

| Method | Path | Purpose | Returns |
|--------|------|---------|---------|
| GET | `/health/live` | Liveness probe (is the process alive?) | `200 { status: "ok" }` |
| GET | `/health/ready` | Readiness probe (can we accept traffic?) | `200 { status: "ok", db: "connected" }` or `503 { status: "error", db: "disconnected" }` |
| GET | `/health/metrics` | Prometheus scrape endpoint | Prometheus text format (`content-type: text/plain`) |

### Liveness (`/health/live`)

- Returns 200 immediately
- No dependencies checked
- Used by orchestrator/k8s to know the process is running
- Response time: < 1 ms

### Readiness (`/health/ready`)

- Checks that the store (DB) is reachable by running a lightweight query (e.g. `SELECT 1` for SQLite)
- Returns 200 if reachable, 503 if not
- Used by load balancer to know if this instance can accept traffic
- Timeout: 2 seconds

### Metrics (`/health/metrics`)

Using `prom-client`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ap_core_requests_total` | Counter | `method`, `path`, `status_code` | Total HTTP requests |
| `ap_core_request_duration_seconds` | Histogram | `method`, `path` | Request latency (buckets: 0.01, 0.05, 0.1, 0.5, 1, 5) |
| `ap_core_transactions_total` | Counter | `direction`, `status` | Total AS4 transactions |
| `ap_core_smp_cache_hits_total` | Counter | — | SMP cache hits |
| `ap_core_smp_cache_misses_total` | Counter | — | SMP cache misses |
| `ap_core_workers_active` | Gauge | — | Number of active cluster workers |
| `ap_core_uptime_seconds` | Gauge | — | Seconds since process start |

### Graceful shutdown

On `SIGTERM`:

1. Set health check to unhealthy (return 503)
2. Stop accepting new requests (call `server.close()`)
3. Wait for in-flight requests to complete (track via a counter, drain with timeout)
4. Flush metrics
5. Close store connection
6. Exit with code 0

On `SIGINT` (Ctrl+C in dev):

1. Same as SIGTERM but exit with code 0 immediately after cleanup

### Middleware architecture

```javascript
// src/middleware/metrics.js
export function requestMetricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer({ method: req.method, path: req.route?.path || req.path });
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, path: req.route?.path || req.path, status: res.statusCode });
    end();
  });
  next();
}
```

### Files to modify

| File | Change |
|------|--------|
| `server/index.js` | Register `/health/live`, `/health/ready`, `/health/metrics` routes. Add metrics middleware. Add graceful shutdown handlers. |
| `src/index.js` | Expose `getStore()` (or a health check method) so the server can check DB reachability. Track transaction counts via the metrics registry. |
| `package.json` | Add `prom-client` dependency |

### Files to create

| File | Purpose |
|------|---------|
| `src/middleware/metrics.js` | Shared metrics registry, middleware, and helper functions |
| `src/middleware/shutdown.js` | Graceful shutdown handler |
| `test/health.test.js` | Tests for liveness, readiness, metrics endpoints |

## Acceptance criteria

- [ ] `GET /health/live` returns `200 { status: "ok" }` with no DB dependency
- [ ] `GET /health/ready` returns `200 { status: "ok", db: "connected" }` when store is reachable
- [ ] `GET /health/ready` returns `503 { status: "error", db: "disconnected" }` when store is unreachable (tested by pointing to a non-existent SQLite path)
- [ ] `GET /health/metrics` returns Prometheus-format text with all 7 metrics present
- [ ] Metrics middleware increments `ap_core_requests_total` per request
- [ ] Metrics middleware records `ap_core_request_duration_seconds` histogram
- [ ] `SIGTERM` triggers graceful shutdown: readiness → 503 → drain → close → exit
- [ ] In-flight requests complete during shutdown (tested by sending a slow request and SIGTERM)
- [ ] `npm test` is green

## Blocked by

- Slice 1 — Storage adapter interface + mock (doc/issues/001-storage-adapter-interface.md)
