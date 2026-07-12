/**
 * Peppol AP Core — Cluster Mode
 *
 * Master process that forks N worker processes, each running the Express server.
 * Workers share TCP port 3001 via the cluster module's built-in IPC round-robin.
 *
 * Usage:
 *   node server/cluster.js              # Cluster mode (default)
 *   AP_CORE_WORKERS=2 node server/cluster.js  # 2 workers
 *
 * Environment variables:
 *   AP_CORE_WORKERS  - Number of workers (default: os.cpus().length)
 *   PORT             - Server port (default: 3001)
 *   PEPPOL_AP_ID     - AP identifier
 *   PEPPOL_MODE      - 'test' or 'production'
 */

import cluster from 'node:cluster';
import os from 'node:os';
import { startWorker } from './index.js';

const numCPUs = os.cpus().length;
const workerCount = Math.max(1, parseInt(process.env.AP_CORE_WORKERS, 10) || numCPUs);
const PORT = parseInt(process.env.PORT || '3001', 10);

console.log(`[cluster] Master starting ${workerCount} workers (CPUs: ${numCPUs})`);

if (cluster.isPrimary) {
  // ── Master process ──────────────────────────────────────────────────────────

  // Track active workers
  const workers = new Map();

  // Fork N workers
  for (let i = 0; i < workerCount; i++) {
    const worker = cluster.fork();
    workers.set(worker.id, worker);
    console.log(`[cluster] Forked worker ${worker.id} (${i + 1}/${workerCount})`);
  }

  // Re-fork on unexpected exit (crash)
  cluster.on('exit', (worker, code, signal) => {
    if (worker.exitedAfterDisconnect) {
      // Intentional shutdown — don't re-fork
      console.log(`[cluster] Worker ${worker.id} exited intentionally (code=${code})`);
    } else {
      // Unexpected crash — re-fork after 1 second delay
      console.warn(`[cluster] Worker ${worker.id} crashed (code=${code}, signal=${signal}). Re-forking in 1s...`);
      workers.delete(worker.id);
      setTimeout(() => {
        const newWorker = cluster.fork();
        workers.set(newWorker.id, newWorker);
        console.log(`[cluster] Re-forked worker ${newWorker.id} (total: ${workers.size})`);
      }, 1000);
    }
  });

  // Graceful shutdown on SIGTERM / SIGINT
  const shutdown = async (signal) => {
    console.log(`[cluster] Master received ${signal}. Shutting down, waiting for workers...`);
    const workerList = [...workers.values()];

    // Signal all workers to stop
    for (const worker of workerList) {
      console.log(`[cluster] Sending SIGTERM to worker ${worker.id}`);
      worker.process.kill('SIGTERM');
    }

    // Wait for all workers to exit (max 30 seconds)
    const exitPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('[cluster] Workers did not exit in time, sending SIGKILL...');
        for (const worker of workerList) {
          if (!worker.isDead()) {
            worker.process.kill('SIGKILL');
          }
        }
        resolve();
      }, 30_000);

      const checkDone = () => {
        if (workers.size === 0) {
          clearTimeout(timeout);
          resolve();
        }
      };

      // Poll until all workers are gone
      const interval = setInterval(() => {
        const alive = [...workers.values()].filter(w => !w.isDead());
        alive.forEach(w => workers.delete(w.id));
        if (workers.size === 0) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 500);
    });

    await exitPromise;
    console.log('[cluster] All workers exited. Master exiting.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

} else {
  // ── Worker process ──────────────────────────────────────────────────────────

  // Handle SIGTERM: graceful drain then exit
  process.on('SIGTERM', () => {
    console.log(`[cluster] Worker ${process.pid} received SIGTERM, starting graceful shutdown...`);
    startWorker({ graceful: true, port: PORT });
  });

  // Normal startup
  startWorker({ graceful: false, port: PORT });
}
