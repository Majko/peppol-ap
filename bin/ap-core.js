#!/usr/bin/env node
/**
 * Peppol AP Core — CLI
 *
 * Usage:
 *   node bin/ap-core.js report --period=YYYY-MM [--period-last=YYYY-MM] [--json] [--output=./reports/]
 *   node bin/ap-core.js logs list [--direction=send|receive] [--status=<status>] [--from=<date>] [--to=<date>] [--limit=<n>] [--format=json|table]
 *   node bin/ap-core.js logs get <messageId>
 *   node bin/ap-core.js logs export --from=<date> --to=<date> [--format=csv|json] [--output=<path>]
 *   node bin/ap-core.js logs prune --older-than=<days> [--dry-run] [--verbose]
 *   node bin/ap-core.js logs retention-status
 *   node bin/ap-core.js status <messageId>
 *   node bin/ap-core.js tx list [--limit=<n>] [--status=<status>] [--format=json|table]
 */

import { generateMonthlyReport } from '../src/reporting/monthly-report.js';
import { handleLogsCommand } from '../src/cli/logs.js';
import { getStatus, getTransactions } from '../src/index.js';
import { createStore } from '../src/store/factory.js';

// ── Argument parsing ───────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const args = {};
for (const arg of process.argv.slice(2)) {
  const idx = arg.indexOf('=');
  if (idx === -1) {
    const [key, ...rest] = arg.split('=');
    args[key] = rest.join('=') || true;
  } else {
    const key = arg.slice(0, idx);
    const value = arg.slice(idx + 1);
    args[key] = value;
  }
}

// ── Commands ───────────────────────────────────────────────────────────────────

async function cmdReport() {
  const period = args['--period'];
  if (!period) {
    console.error('Error: --period is required (format: YYYY-MM)');
    console.error('Usage: node bin/ap-core.js report --period=2026-06 [--period-last=2026-05] [--json] [--output=./reports/]');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}$/.test(period)) {
    console.error('Error: --period must be in YYYY-MM format');
    process.exit(1);
  }

  const periodLast = args['--period-last'] || null;
  const asJson = args['--json'] === true || args['--json'] === 'true';
  const outputPath = args['--output'] || null;

  const config = {
    period,
    periodLast,
    apId: process.env.PEPPOL_AP_ID || 'POP000001',
    country: process.env.PEPPOL_AP_COUNTRY || 'SK',
  };

  try {
    // Initialise stores so getTransactions() has an adapter
    const stores = createStore(process.env.PEPPOL_STORE_ADAPTER || 'mock', {
      dbPath: process.env.AP_CORE_DB_PATH,
    });

    // Inject stores into the module (match how src/index.js initialises)
    const { _setStores } = await import('../src/index.js');
    _setStores(stores);

    const report = await generateMonthlyReport(config);

    if (asJson) {
      const json = JSON.stringify(report, null, 2);
      if (outputPath) {
        const { writeFileSync, mkdirSync } = await import('fs');
        mkdirSync(outputPath, { recursive: true });
        const filePath = outputPath.endsWith('/')
          ? `${outputPath}monthly-report-${period}.json`
          : `${outputPath}-monthly-report-${period}.json`;
        writeFileSync(filePath, json, 'utf-8');
        console.log(`Report written to ${filePath}`);
      } else {
        console.log(json);
      }
    } else {
      printTextReport(report);
    }
  } catch (err) {
    console.error('Error generating report:', err.message);
    process.exit(1);
  }
}

/**
 * Print a human-readable text report.
 * @param {Object} report
 */
function printTextReport(report) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Peppol AP — Monthly Report                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Period:         ${(report.reportPeriod || '').padEnd(39)}║`);
  console.log(`║  Generated:      ${(report.generatedAt || '').padEnd(39)}║`);
  console.log(`║  Service Provider: ${(report.serviceProvider?.id || '').padEnd(38)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  SUMMARY STATISTICS                                        ║');
  console.log(`║    Total transactions:  ${String(report.summary?.totalTransactions || 0).padEnd(39)}║`);
  console.log(`║    Direction — send:    ${String(report.summary?.byDirection?.send || 0).padEnd(39)}║`);
  console.log(`║    Direction — receive:  ${String(report.summary?.byDirection?.receive || 0).padEnd(39)}║`);
  console.log('║    By status:                                                   ║');
  for (const [status, count] of Object.entries(report.summary?.byStatus || {})) {
    const label = `      ${status}:`.padEnd(15);
    console.log(`║    ${label} ${String(count).padEnd(40)}║`);
  }
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  VALUE METRICS                                               ║');
  console.log(`║    Total invoice value:   ${String(report.valueMetrics?.totalValue || 0).padEnd(38)}║`);
  console.log(`║    Average value:         ${String(report.valueMetrics?.avgValue || 0).padEnd(38)}║`);
  console.log(`║    Txns with value:       ${String(report.valueMetrics?.transactionsWithValue || 0).padEnd(38)}║`);
  console.log('║    By country:                                                   ║');
  for (const row of (report.valueMetrics?.byCountry || [])) {
    const label = `      ${row.country}:`.padEnd(10);
    console.log(`║    ${label} count=${String(row.count).padEnd(5)} total=${String(row.totalValue).padEnd(15)} avg=${String(row.avgValue).padEnd(10)}║`);
  }
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  DELIVERY PERFORMANCE                                       ║');
  console.log(`║    Success rate:        ${String(report.deliveryPerformance?.successRate || 0).padEnd(37)}%║`);
  console.log(`║    Avg delivery time:   ${String(report.deliveryPerformance?.avgDeliverySeconds || 'N/A').padEnd(37)}s║`);
  console.log(`║    Delivered count:     ${String(report.deliveryPerformance?.deliveredCount || 0).padEnd(37)}║`);
  if (report.periodOverPeriod) {
    const pop = report.periodOverPeriod;
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  PERIOD-OVER-PERIOD COMPARISON                               ║');
    console.log(`║    Previous period:     ${(pop.previousPeriod || '').padEnd(39)}║`);
    if (pop.transactionCount) {
      const delta = pop.transactionCount.delta !== null ? `${pop.transactionCount.delta > 0 ? '+' : ''}${pop.transactionCount.delta}%` : 'N/A';
      console.log(`║    Tx count change:     ${delta.padEnd(39)}║`);
    }
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// ── Router ────────────────────────────────────────────────────────────────────

// ── Router ────────────────────────────────────────────────────────────────────

// Re-parse process.argv to handle subcommand routing properly
const argv = process.argv.slice(2);
const command = argv[0];
const subArgs = argv.slice(2); // args after the subcommand

if (!command) {
  console.error('Usage: node bin/ap-core.js <command> [options]');
  console.error('Commands:');
  console.error('  report  --period=YYYY-MM       Generate monthly report');
  console.error('  logs    list|get|export|prune  Transaction log management');
  console.error('  status  <messageId>           Show status of a message');
  console.error('  tx      list                  List recent transactions');
  process.exit(1);
}

switch (command) {
  case 'report':
    cmdReport();
    break;

  case 'logs':
    await handleLogsCommand(argv.slice(1));
    break;

  case 'status': {
    const [messageId] = argv.slice(1);
    if (!messageId) {
      console.error('Usage: node bin/ap-core.js status <messageId>');
      process.exit(1);
    }
    const result = await getStatus(messageId);
    const fmt = extractFlag(argv, '--format', 'table');
    if (fmt === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const color = getStatusColor(result.status);
      console.log('\n  AP Core — Transaction Status');
      console.log('  '.padEnd(50, '─'));
      console.log(`  Message ID    : ${result.messageId}`);
      console.log(`  Status        : ${color}${result.status}\x1b[0m`);
      if (result.receipt) console.log(`  Receipt       : ${result.receipt.substring(0, 60)}…`);
      if (result.error)   console.log(`  Error         : ${result.error}`);
      console.log(`  Retries       : ${result.retries}`);
      console.log(`  Last Updated  : ${result.updated_at}`);
      console.log('  '.padEnd(50, '─'));
      console.log();
    }
    break;
  }

  case 'tx': {
    const filters = parseFilterArgs(argv.slice(1));
    const fmt = extractFlag(argv, '--format', 'table');
    let txs = await getTransactions();
    if (filters.status)    txs = txs.filter(t => t.status === filters.status);
    if (filters.direction) txs = txs.filter(t => t.direction === filters.direction);
    if (filters.limit)     txs = txs.slice(0, parseInt(filters.limit, 10));

    if (fmt === 'json') {
      console.log(JSON.stringify(txs, null, 2));
    } else {
      printTxTable(txs, 'Transaction Log');
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function extractFlag(args, flag, defaultVal) {
  for (const a of args) {
    if (a.startsWith(flag + '=')) return a.slice(flag.length + 1);
  }
  return defaultVal;
}

function parseFilterArgs(args) {
  const filters = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eqIdx = a.indexOf('=');
      if (eqIdx !== -1) {
        filters[a.slice(2, eqIdx)] = a.slice(eqIdx + 1);
      } else {
        const key = a.slice(2);
        if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
          filters[key] = args[i + 1];
          i++;
        } else {
          filters[key] = true;
        }
      }
    }
  }
  return filters;
}

function getStatusColor(status) {
  switch (status) {
    case 'delivered': case 'received': return '\x1b[32m';
    case 'pending':    case 'sent':    return '\x1b[33m';
    case 'error':     case 'failed':  return '\x1b[31m';
    default:                          return '\x1b[0m';
  }
}

function printTxTable(txs, title = 'Transactions') {
  if (txs.length === 0) { console.log(`\n  ${title} — no records found\n`); return; }
  const W_MSGID = 38, W_DIR = 8, W_STATUS = 12, W_SENDER = 22, W_RECEIVER = 22, W_DATE = 19;
  const sep = '  ';
  const div = `  ${'─'.repeat(W_MSGID + W_DIR + W_STATUS + W_SENDER + W_RECEIVER + W_DATE + sep.length * 5)}`;
  console.log(`\n  ${title}`);
  console.log(div);
  console.log(`  ${'MESSAGE ID'.padEnd(W_MSGID)}${sep}${'DIR'.padEnd(W_DIR)}${sep}${'STATUS'.padEnd(W_STATUS)}${sep}${'SENDER'.padEnd(W_SENDER)}${sep}${'RECEIVER'.padEnd(W_RECEIVER)}${sep}${'DATE'.padEnd(W_DATE)}`);
  console.log(div);
  for (const tx of txs) {
    const c = getStatusColor(tx.status);
    console.log(
      `  ${(tx.messageId||'').substring(0,W_MSGID)}${sep}` +
      `${(tx.direction||'').padEnd(W_DIR)}${sep}` +
      `${`${c}${tx.status}\x1b[0m`.padEnd(W_STATUS)}${sep}` +
      `${(tx.senderId||'').substring(0,W_SENDER).padEnd(W_SENDER)}${sep}` +
      `${(tx.receiverId||'').substring(0,W_RECEIVER).padEnd(W_RECEIVER)}${sep}` +
      `${(tx.timestamp||'').substring(0,W_DATE).padEnd(W_DATE)}`
    );
  }
  console.log(div);
  console.log(`  ${txs.length} record${txs.length !== 1 ? 's' : ''}\n`);
}
