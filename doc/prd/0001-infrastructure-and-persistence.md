# PRD 0001 — AP Core Infrastructure & Persistence

## Problem Statement

The AP Core currently runs as a single-process Node.js server with entirely in-memory storage. The in-memory `Map` for transactions is lost on restart, there is no database, no clustering, no deployment configuration, and no observability. While this is fine for prototyping, it cannot meet even the minimum Peppol TIA SLA (98.5% availability) because:

- A server restart loses all transaction history, making duplicate detection impossible
- Only one CPU core is utilised, limiting throughput to ~1 invoice/second
- No health-check endpoints exist for load balancer integration
- No Docker/deployment config exists for repeatable provisioning
- No SMP cache means every send incurs a full DNS+SMP lookup penalty

The project has defined its target architecture as active-active across 2 EU regions behind a load balancer. We need to bridge the gap from prototype to production-readiness while remaining lightweight enough for early-stage operation.

## Solution

Introduce a production-ready infrastructure layer to the AP Core while keeping the Service Platform concerns (companies, users, invoices) separate. Specifically:

1. **Persistent store adapter** — abstract storage behind an interface, ship with SQLite (dev) and DynamoDB (production) adapters
2. **Node.js cluster mode** — use the built-in `cluster` module to utilise all CPU cores
3. **Nginx reverse proxy config** — TLS termination, upstream load balancing, rate limiting
4. **Docker deployment** — `Dockerfile` + `docker-compose.yml` for repeatable builds
5. **Health checks & graceful shutdown** — endpoints and shutdown hooks for orchestration
6. **SMP response cache** — persistent cache of participant lookup results
7. **Transaction persistence** — messages survive restart, enabling dedup and replay
8. **Prometheus metrics endpoint** — request rate, latency, error count, queue depth

## User Stories

1. As an AP operator, I want transaction records to survive a server restart, so that I never lose audit trail data.
2. As an AP operator, I want duplicate incoming messages to be detected across restarts, so that I never double-deliver a document to a downstream system.
3. As an AP operator, I want the AP Core to use all available CPU cores, so that I can handle peak loads without scaling out prematurely.
4. As an AP operator, I want a health-check endpoint that returns readiness and liveness state, so that a load balancer can route traffic correctly.
5. As an AP operator, I want my server to shut down gracefully, finishing in-flight AS4 transfers before exiting.
6. As an AP operator, I want a Docker image and docker-compose setup, so that I can deploy repeatably across environments.
7. As an AP operator, I want cached SMP lookup results to survive restarts, so that I don't incur DNS+SMP penalties on cold start.
8. As an AP operator, I want Prometheus metrics for request latency, error rates, and transaction volume, so that I can monitor SLA compliance.
9. As an AP operator, I want an Nginx config that handles TLS termination and upstream load balancing, so that my Node.js processes don't handle TLS directly.
10. As an AP operator, I want outgoing webhooks to be signed with HMAC, so that downstream systems can verify payload authenticity.
11. As an AP operator, I want the production AS4 send path (`dryrun: false`) to work with valid PKI certificates, so that I can send real Peppol messages.
12. As a developer, I want the storage layer to be tested with unit tests (mock adapter) and integration tests (real SQLite), so that I can refactor confidently.

## Implementation Decisions

### D1: Storage adapter interface

The AP Core currently uses `const transactions = new Map()` in module scope. We will replace this with an interface-based storage layer:

```typescript
interface TransactionStore {
  save(tx: Transaction): Promise<void>;
  get(messageId: string): Promise<Transaction | null>;
  list(filters?: TransactionFilter): Promise<Transaction[]>;
  updateStatus(messageId: string, status: string, metadata?: Record<string, unknown>): Promise<void>;
}

interface SMPCache {
  get(participantId: string): Promise<SMPEntry | null>;
  set(participantId: string, entry: SMPEntry, ttlSeconds: number): Promise<void>;
  invalidate(participantId: string): Promise<void>;
}

interface APIdentityStore {
  getActiveCert(): Promise<CertEntry | null>;
  getCert(certId: string): Promise<CertEntry | null>;
  storeCert(entry: CertEntry): Promise<void>;
}
```

- SQLite adapter ships with the AP Core as the default (filesystem-based, zero-dependency via `better-sqlite3`)
- DynamoDB adapter ships as an optional import for production
- A factory function selects the adapter based on environment config

### D2: SQLite for development / single-server deployments

- Use `better-sqlite3` (synchronous, fast, well-maintained)
- Database file at `~/.peppol-ap/ap-core.db` or configured via `AP_CORE_DB_PATH` env var
- Schema: `transactions`, `smp_cache`, `identities` tables
- Migrations: inline schema creation with `IF NOT EXISTS` (no migration framework needed at this stage)

Schema outline:

```sql
CREATE TABLE IF NOT EXISTS transactions (
  message_id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK(direction IN ('send','receive')),
  status TEXT NOT NULL DEFAULT 'pending',
  sender_id TEXT,
  receiver_id TEXT,
  sender_ap_id TEXT,
  receiver_ap_id TEXT,
  doc_type_id TEXT,
  process_id TEXT,
  transport_profile TEXT,
  payload_key TEXT,                -- reference to object store
  receipt_xml TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS smp_cache (
  participant_id TEXT PRIMARY KEY,
  endpoint_url TEXT NOT NULL,
  receiver_cert_pem TEXT,
  transport_profile TEXT DEFAULT 'peppol:as4:2024:v1.0',
  resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  cert_id TEXT PRIMARY KEY,
  cert_pem TEXT NOT NULL,
  priv_key_pem TEXT NOT NULL,      -- encrypted at application level
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
```

### D3: Cluster mode

- Use Node.js built-in `cluster` module
- Master process forks `N workers` (default: `os.cpus().length`)
- Workers share port 3001 via the master's TCP listener
- Graceful shutdown: workers stop accepting new connections on `SIGTERM`, drain in-flight requests, then exit
- Master restarts workers that exit unexpectedly

```javascript
// Conceptual approach — cluster master
import cluster from 'cluster';
import os from 'os';

const workers = parseInt(process.env.AP_CORE_WORKERS) || os.cpus().length;

if (cluster.isPrimary) {
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    if (!worker.exitedAfterDisconnect) cluster.fork();  // auto-restart
  });
  process.on('SIGTERM', () => {
    for (const id in cluster.workers) cluster.workers[id].kill();
  });
} else {
  startServer();  // worker starts Express
}
```

### D4: Nginx reverse proxy

Provide a reference `nginx/` directory with:

- `nginx.conf` — upstream block for AP workers, TLS termination, rate limiting (10 req/s per IP for the /as4/receive endpoint)
- `sites-available/ap-core` — site config with SSL, proxy_pass, access logs
- `ssl/` — placeholder directory for Let's Encrypt certs
- Script to generate self-signed certs for development (`scripts/generate-dev-certs.sh`)

### D5: Docker deployment

- `Dockerfile` — multi-stage build (builder stage: `npm ci`, production stage: distroless or `node:22-slim`)
- `docker-compose.yml` — AP Core service + optional Prometheus + optional MinIO for payload storage
- Environment-driven config via `.env` file

### D6: Health checks

- `GET /health/live` — returns 200 if the process is alive (no DB dependency)
- `GET /health/ready` — returns 200 if the process is ready to accept traffic (DB reachable, cluster worker initialised)
- `GET /health/metrics` — Prometheus-formatted metrics

### D7: Prometheus metrics

Expose via the `prom-client` npm package:

- `ap_core_requests_total` — counter by method, path, status
- `ap_core_request_duration_seconds` — histogram by method, path
- `ap_core_transactions_total` — counter by direction, status
- `ap_core_smp_cache_hits_total` / `ap_core_smp_cache_misses_total`
- `ap_core_workers_active` — gauge
- `ap_core_uptime_seconds` — gauge

### D8: HMAC webhook signing

When delivering incoming documents to the downstream webhook:

- Compute `HMAC-SHA256` of the payload body using a shared secret
- Set header `X-Peppol-Signature: sha256=<hex>`
- Downstream verifies using the same secret
- Configurable via `WEBHOOK_SECRET` env var

### D9: Production AS4 send path

- Remove `dryrun: true` hardcode from `src/as4/node42.js`
- Add certificate loading from the `identities` store (SQLite or filesystem)
- Validate cert expiry before sending
- Load truststore from configured path

### D10: SMP cache with persistence

- On `lookupParticipant()`: check cache first → if hit and not expired, return cached entry
- If miss or expired: perform real SMP lookup → store result in `smp_cache` table → return
- Default TTL: 1 hour (configurable via `SMP_CACHE_TTL_SECONDS`)
- Cache is populated on first lookup and persisted in the database

## Testing Decisions

### Seams

We test at two seams:

1. **Storage adapter interface** — unit-test each adapter (mock, SQLite) against the same interface contract. A mock in-memory adapter is used for existing AP Core tests.
2. **Server integration** — spin up the Express app with SQLite adapter on a dynamic port, test all HTTP endpoints with persistence enabled.

### What makes a good test

- Tests external behaviour, not implementation details
- A storage adapter test writes a record, reads it back, updates it, and asserts the state
- A cluster test verifies that `os.cpus().length` workers start, handle requests, and shut down gracefully
- A health-check test verifies that `/health/live` and `/health/ready` return correct status codes (and that ready fails when DB is unavailable)

### Test files

| Test file | Scope | Seam |
|-----------|-------|------|
| `test/storage-adapter.test.js` | Interface contract: mock + SQLite adapters | Unit |
| `test/transactions-persistence.test.js` | Save → restart (simulated) → retrieve | Integration |
| `test/server-persistence.test.js` | HTTP endpoints with SQLite backend | Integration |
| `test/cluster.test.js` | Worker count, request routing, graceful shutdown | Integration |
| `test/health.test.js` | Liveness, readiness, metrics endpoints | Integration |

### Prior art

- Existing `test/ap-core.test.js` uses in-memory `transactions` Map — these will be refactored to use the mock storage adapter
- Existing `test/server-integration.test.js` uses dynamic-port Express — same pattern for persistence tests

## Out of Scope

- PostgreSQL adapter (the Service Platform may use PostgreSQL, but the AP Core storage layer is separate)
- Multi-region replication logic (DynamoDB Global Tables are configured at the cloud level, not in AP Core code)
- Full CI/CD pipeline (GitHub Actions, deployment scripts)
- Peppol certificate procurement and renewal automation
- Service Platform concerns (companies, users, invoice CRUD)
- Migration framework for schema changes
- GUI dashboard for metrics
- Kubernetes manifests (Docker Compose is sufficient for early production)
- Automated load testing (manual benchmarking during scale-up)
- End-to-end Peppol testbed accreditation (requires PKI certs)
- Rate limiting per participant (global rate limiting at Nginx level is sufficient for now)

## Further Notes

- The storage adapter interface is designed to be minimal — three operations for transactions, two for SMP cache. Add operations only when needed.
- SQLite was chosen over a JSON file because it supports concurrent reads (cluster workers), indexed queries, and transactional writes. `better-sqlite3` is synchronous and 2–3× faster than `sql.js` for our access pattern.
- The cluster mode is deliberately simple — no PM2 dependency. If more sophisticated process management is needed later (zero-downtime restarts, rolling updates), we can add PM2 without changing the application code.
- The Nginx config is a reference, not a requirement. Operators may use Caddy, HAProxy, or a cloud LB instead.
- Metrics will initially be basic. Add RED metrics (Rate, Errors, Duration) for the AS4 endpoint first, expand later.
- The HMAC webhook signing uses the same pattern as Stripe/Svix — HTTP header with signature + timestamp for replay protection.
