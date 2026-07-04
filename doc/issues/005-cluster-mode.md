# Cluster Mode (Multi-Core)

## Parent

Depends on Slice 4 — Health checks + Prometheus metrics (doc/issues/004-health-checks-and-metrics.md)

## What to build

Add Node.js built-in `cluster` module support so the AP Core utilises all available CPU cores. The master process forks workers that share the same TCP port. Workers register health endpoints. Graceful shutdown drains in-flight requests before exiting. The master re-forks workers that crash.

### Architecture

```
[Master process] ←── SIGTERM → wait for all workers → exit
   │
   ├── fork() → [Worker 1] ←── health/metrics endpoints
   ├── fork() → [Worker 2]
   ├── fork() → [Worker 3]   (os.cpus().length workers)
   └── fork() → [Worker N]
           │
           └── TCP port 3001 (shared via master's IPC)
```

### Worker count

- Default: `os.cpus().length`
- Override: `AP_CORE_WORKERS` env var
- Minimum: 1 (if set to 0 or negative)

### Master process responsibilities

1. Fork `N` workers on startup
2. Listen for `worker.on('exit')`:
   - If `worker.exitedAfterDisconnect` is false (unexpected crash): log warning, re-fork after 1 second delay (to avoid restart loops)
   - If true (intentional shutdown): don't re-fork
3. On `SIGTERM`/`SIGINT`:
   - Log "Shutting down, waiting for workers..."
   - Send `SIGTERM` to all workers
   - Wait for all workers to exit (with 30-second timeout)
   - If workers don't exit in time, send `SIGKILL`
   - Exit with code 0

### Worker process responsibilities

1. Start Express server (same as today, no changes needed to application code)
2. Register health check endpoints (`/health/live`, `/health/ready`, `/health/metrics`)
3. On `SIGTERM`:
   - Set readiness to unhealthy (return 503)
   - Call `server.close()` (stop accepting new connections)
   - Wait up to 30 seconds for in-flight requests to complete
   - Close store (SQLite) connection
   - Call `process.exit(0)`

### Shared state considerations

- **SQLite with WAL mode**: Supports multiple readers. Each worker opens its own connection to the same DB file. WAL mode allows concurrent reads without blocking.
- **In-memory state** (SMP cache, metrics): Each worker has its own copy. This is acceptable — SMP cache is per-worker and metrics are aggregated at the Prometheus scrape level.
- **Webhook registration**: Currently a module-scoped variable. Each worker receives its own copy from env/config.

### Entry point structure

```javascript
// server/index.js — current entry point stays as the worker start function
export function startWorker() {
  const app = createApp();
  // ... health checks, metrics, shutdown ...
}

// server/cluster.js — new entry point for cluster mode
import cluster from 'cluster';
import os from 'os';

const workers = Math.max(1, parseInt(process.env.AP_CORE_WORKERS) || os.cpus().length);

if (cluster.isPrimary) {
  // ... master logic ...
} else {
  startWorker();
}
```

### Package.json scripts

```json
{
  "scripts": {
    "start": "node server/cluster.js",
    "start:dev": "node server/index.js --start",
    "start:cluster": "node server/cluster.js"
  }
}
```

### Files to modify

| File | Change |
|------|--------|
| `server/index.js` | Extract worker startup into `startWorker()` function. Add `SIGTERM` handler for graceful shutdown. |
| `package.json` | Add `"start": "node server/cluster.js"` (cluster mode by default). Keep `"start:dev"` for single-process dev. |

### Files to create

| File | Purpose |
|------|---------|
| `server/cluster.js` | Cluster master + worker fork logic |
| `test/cluster.test.js` | Tests for cluster behaviour (without actually forking — test the logic paths) |

### Cluster test strategy

Testing the cluster module directly is tricky (forking in test is fragile). Instead:

1. Unit test the `startWorker()` function: verify it creates an Express app, registers health checks, and shuts down on SIGTERM
2. Unit test the master logic: mock `cluster.fork()`, verify correct number of forks, verify re-fork on crash, verify SIGTERM propagation
3. Integration test: start the server in cluster mode on a dynamic port, verify all workers respond

## Acceptance criteria

- [ ] Server starts in cluster mode with `os.cpus().length` workers by default
- [ ] `AP_CORE_WORKERS` env var overrides worker count
- [ ] All workers share TCP port 3001
- [ ] Each worker responds to `/health/live` and `/health/ready`
- [ ] When a worker crashes (simulated by `process.exit()`), master re-forks it within 1 second
- [ ] When master receives `SIGTERM`, it sends `SIGTERM` to all workers and waits for them to exit
- [ ] Workers drain in-flight requests before exiting (readiness returns 503 during drain)
- [ ] Workers that don't exit within 30 seconds receive `SIGKILL`
- [ ] `npm run start` starts in cluster mode
- [ ] `npm run start:dev` starts in single-process mode (for development)
- [ ] All existing tests remain green

## Blocked by

- Slice 4 — Health checks + Prometheus metrics (doc/issues/004-health-checks-and-metrics.md)
