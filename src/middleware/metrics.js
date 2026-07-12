/**
 * Shared Prometheus metrics registry and instrumentation helpers.
 *
 * Metrics:
 *   peppol_transactions_total        - Counter (labels: direction, status)
 *   peppol_transaction_duration_seconds - Histogram
 *   peppol_smp_lookups_total          - Counter (labels: result=hit|miss|error)
 *   peppol_webhooks_fired_total       - Counter
 *   peppol_webhook_failures_total     - Counter
 *
 * Plus all default Node.js/process metrics from prom-client:
 *   process_cpu_seconds_total, process_resident_memory_bytes,
 *   nodejs_heap_size_total_bytes, nodejs_heap_size_used_bytes,
 *   nodejs_external_memory_bytes, etc.
 */

import client from 'prom-client';
import { register } from 'prom-client';

// ── Default metrics (CPU, memory, Node.js internals) ────────────────────────────
client.collectDefaultMetrics();

// ── Custom app metrics ──────────────────────────────────────────────────────────

/** Total stored transactions */
export const transactionsTotal = new client.Counter({
  name: 'peppol_transactions_total',
  help: 'Total number of stored AS4 transactions',
  labelNames: ['direction', 'status'],
});

/** Transaction send duration */
export const transactionDuration = new client.Histogram({
  name: 'peppol_transaction_duration_seconds',
  help: 'Duration of sendInvoice operations in seconds',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** SMP lookup results */
export const smpLookupsTotal = new client.Counter({
  name: 'peppol_smp_lookups_total',
  help: 'Total SMP lookups by result',
  labelNames: ['result'],
});

/** Webhook calls fired */
export const webhooksFiredTotal = new client.Counter({
  name: 'peppol_webhooks_fired_total',
  help: 'Total webhook calls fired',
});

/** Webhook failures */
export const webhookFailuresTotal = new client.Counter({
  name: 'peppol_webhook_failures_total',
  help: 'Total webhook call failures',
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Increment transaction counter after a store operation */
export function recordTransaction(direction, status) {
  transactionsTotal.inc({ direction, status });
}

/** Record transaction duration */
export function recordTransactionDuration(durationSeconds) {
  transactionDuration.observe(durationSeconds);
}

/** Record SMP lookup result */
export function recordSmpLookup(result) {
  smpLookupsTotal.inc({ result });
}

/** Increment webhook fired counter */
export function recordWebhookFired() {
  webhooksFiredTotal.inc();
}

/** Increment webhook failure counter */
export function recordWebhookFailure() {
  webhookFailuresTotal.inc();
}

/** Return all metrics in Prometheus text format */
export async function getMetrics() {
  return register.contentType + '\n' + (await register.metrics());
}

export { register };
