# Infrastructure & Persistence — Vertical Slice Breakdown

## Slice 1 — Storage adapter interface + mock (prefactor)
**Blocked by:** None — can start immediately
**User stories covered:** 12 (developer testing)

Introduce three TypeScript/JSDoc interfaces (`TransactionStore`, `SMPCache`, `APIdentityStore`). Ship a mock in-memory adapter that implements all three. Refactor `src/index.js` to receive the store via a factory function instead of using the module-scoped `Map`. All 90 existing tests pass using the mock adapter.

**Why first:** Everything else depends on this interface. It's a pure refactor — no new dependencies, no schema, no config. The mock adapter replaces the current `Map` exactly.

---

## Slice 2 — SQLite storage adapter
**Blocked by:** Slice 1
**User stories covered:** 1, 2, 7

Add `better-sqlite3`. Implement SQLite-backed `TransactionStore`, `SMPCache`, and `APIdentityStore`. Inline schema creation with `IF NOT EXISTS`. Wire via config (`AP_CORE_DB_PATH`). Update the factory to select SQLite when configured. Add tests that:
- Save a transaction → restart (simulated by closing and reopening DB) → read it back
- Detect duplicate `messageId` across restarts
- SMP cache entries respect TTL

**Deliverable:** Transactions survive restart, dedup works across restarts, SMP lookups are cached.

---

## Slice 3 — Production AS4 send path + certificate loading
**Blocked by:** Slice 2 (needs identity store)
**User stories covered:** 11

Wire the `APIdentityStore` to load the Peppol PKI certificate + key instead of reading from filesystem. Remove the `dryrun: true` hardcode from `src/as4/node42.js`. Validate cert expiry before sending. Update `sendInvoice()` to use the identity store. Add tests that verify:
- Cert is loaded from store
- Expired cert is rejected before send
- `sendViaNode42()` is called with real (non-dryrun) parameters when a valid cert exists

**Deliverable:** Production AS4 send works end-to-end with certificates from persistent store.

---

## Slice 4 — Health checks + Prometheus metrics
**Blocked by:** Slice 1 (needs store interface, not SQLite specifically)
**User stories covered:** 4, 8

Add three endpoints:
- `GET /health/live` — 200 OK, no dependencies
- `GET /health/ready` — 200 if DB is reachable, 503 if not
- `GET /health/metrics` — Prometheus text format

Add `prom-client` dependency. Instrument: request count, duration histogram, transaction counts, SMP cache hit/miss, active workers. Add graceful shutdown handler (`SIGTERM` → flush metrics → close store → exit). Tests verify each endpoint and that `/health/ready` fails when the store connection is broken.

**Deliverable:** Load balancer can health-check, Prometheus can scrape.

---

## Slice 5 — Cluster mode
**Blocked by:** Slice 4 (needs health checks for worker readiness)
**User stories covered:** 3, 5

Add `cluster` primary/worker setup in `server/index.js`. Master forks `os.cpus().length` workers (overridable via `AP_CORE_WORKERS`). Workers share port 3001. Workers register health endpoints. On `SIGTERM`:
- Workers stop accepting new connections, drain in-flight requests, close store, exit
- Master waits for all workers to exit, then exits
- If a worker crashes unexpectedly, master re-forks it

Add tests (with a separate test entry point that doesn't fork): verify worker count starts correctly, verify graceful shutdown drains in-flight requests, verify worker restart on crash.

**Deliverable:** Multi-core utilisation with graceful shutdown and self-healing.

---

## Slice 6 — Nginx reference config + Docker deployment
**Blocked by:** Slice 5 (cluster mode is the target for the proxy)
**User stories covered:** 6, 9

Create:
- `nginx/nginx.conf` — upstream to AP Core workers, TLS termination (SSL config placeholders), rate limiting (10 req/s for `/as4/receive`)
- `nginx/sites-available/ap-core` — full site block
- `scripts/generate-dev-certs.sh` — self-signed certs for dev
- `Dockerfile` — multi-stage, `node:22-slim`, `npm ci --omit=dev` for production
- `docker-compose.yml` — AP Core service + Prometheus + optional MinIO payload storage
- `.env.example` — all config vars documented

**Deliverable:** One `docker compose up` starts the full stack.

---

## Slice 7 — HMAC webhook signing
**Blocked by:** Slice 1 (needs store interface, changes apply after store)
**User stories covered:** 10

When calling the downstream webhook with a received document, compute `HMAC-SHA256(body, WEBHOOK_SECRET)` and set `X-Peppol-Signature: sha256=<hex>` plus `X-Peppol-Timestamp: <unix-epoch>`. Store the secret in env var. Add webhook replay protection: receiver should reject signatures older than 5 minutes. Tests: verify correct header, verify tampered body is detected, verify expired timestamps are rejected.

**Deliverable:** Downstream systems can cryptographically verify webhook payload authenticity.

---

## Dependency graph

```
Slice 1 (interface + mock)
  ├── Slice 2 (SQLite adapter)
  │   └── Slice 3 (production AS4 send)
  ├── Slice 4 (health checks + metrics)
  │   └── Slice 5 (cluster mode)
  │       └── Slice 6 (Nginx + Docker)
  └── Slice 7 (webhook HMAC)
```

Slices 2, 4, and 7 can be built in parallel after Slice 1. Slice 6 is the last to ship since it ties everything together.
