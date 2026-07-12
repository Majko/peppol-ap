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

The AP Core currently uses `const transactions = new Map()`. Replace with an interface-based storage layer:

- `TransactionStore` — `save`, `get`, `list`, `updateStatus`
- `SMPCache` — `get`, `set`, `invalidate`
- `APIdentityStore` — `getActiveCert`, `getCert`, `storeCert`
- SQLite adapter ships as default (via `better-sqlite3`)
- DynamoDB adapter as optional import for production
- A factory function selects the adapter based on environment config

### D2: SQLite for development / single-server deployments

- Database file at `~/.peppol-ap/ap-core.db` or `AP_CORE_DB_PATH` env var
- Schema: `transactions`, `smp_cache`, `identities` tables with inline `IF NOT EXISTS` creation
- WAL mode enabled for concurrent read performance

### D3: Cluster mode

- Node.js built-in `cluster` module
- Master forks `os.cpus().length` workers (configurable via `AP_CORE_WORKERS`)
- Workers share port 3001
- Graceful shutdown on `SIGTERM`

### D4: Nginx reverse proxy

- Reference config in `nginx/` directory
- TLS termination, upstream for AP workers, rate limiting

### D5: Docker deployment

- Multi-stage `Dockerfile`
- `docker-compose.yml` with AP Core + optional Prometheus + MinIO

### D6: Health checks + metrics

- `GET /health/live`, `GET /health/ready`, `GET /health/metrics`
- Prometheus via `prom-client`

### D7: HMAC webhook signing

- HMAC-SHA256 of payload body with `WEBHOOK_SECRET`
- Header: `X-Peppol-Signature: sha256=<hex>`

### D8: Production AS4 send path

- Remove `dryrun: true` hardcode
- Load certificate from identity store
- Validate cert expiry before sending

## Testing Decisions

- Storage adapter interface: unit-test each adapter against the same interface contract
- Server integration: Express app with SQLite adapter on dynamic port
- Tests cover: save/read/update cycle, cluster worker count, health endpoints, cert validation
- Existing in-memory-Map tests refactored to use mock storage adapter

## Out of Scope

- PostgreSQL adapter
- Multi-region replication
- Full CI/CD pipeline
- Certificate procurement automation
- Service Platform concerns (companies, users, invoices)
- GUI dashboard
- Kubernetes manifests
- Automated load testing

## Further Notes

- Storage adapter interface kept minimal — add operations only when needed
- SQLite chosen over JSON file for concurrent reads, indexed queries, transactional writes
- Cluster mode deliberately simple — no PM2 dependency
- Nginx config is reference, not requirement
- HMAC signing follows Stripe/Svix pattern
