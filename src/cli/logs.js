/**
 * AP Core CLI — logs subcommands
 * src/cli/logs.js
 *
 * Implements:
 *   logs list   — filtered transaction list
 *   logs get    — single transaction by messageId
 *   logs export — CSV/JSON export
 *   logs prune  — retention enforcement
 *   logs retention-status — oldest/newest record dates
 */

import { getTransactions, getStatus } from '../index.js';
import { createStore } from '../store/factory.js';

// Env: PEPPOL_STORE_ADAPTER, AP_CORE_DB_PATH, AP_CORE_LOG_RETENTION_DAYS

const RETENTION_DAYS = parseInt(process.env.AP_CORE_LOG_RETENTION_DAYS || '90', 10);

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * @param {string[]} args — command-line args after 'logs'
 */
export async function handleLogsCommand(args) {
  const [subCommand, ...subArgs] = args;

  switch (subCommand) {
    case 'list':
      await cmdList(subArgs);
      break;
    case 'get':
      await cmdGet(subArgs);
      break;
    case 'export':
      await cmdExport(subArgs);
      break;
    case 'prune':
      await cmdPrune(subArgs);
      break;
    case 'retention-status':
      await cmdRetentionStatus(subArgs);
      break;
    default:
      // Fall back: treat subCommand as a filter and run logs list
      // e.g. `logs --direction=send` → logs list --direction=send
      if (subCommand?.startsWith('--')) {
        await cmdList(args);
      } else {
        console.error(`Unknown logs subcommand: ${subCommand}`);
        console.error('Usage:');
        console.error('  logs list [--direction=send|receive] [--status=<status>] [--from=<date>] [--to=<date>] [--limit=<n>] [--format=json|table]');
        console.error('  logs get <messageId>');
        console.error('  logs export --from=<date> --to=<date> [--format=csv|json] [--output=<path>]');
        console.error('  logs prune --older-than=<days> [--dry-run] [--verbose]');
        console.error('  logs retention-status');
        process.exit(1);
      }
  }
}

// ─── logs list ────────────────────────────────────────────────────────────────

async function cmdList(args) {
  const filters = parseFilters(args);
  const format  = extractFlag(args, '--format', 'table');

  let txs = await getTransactions();

  // Apply filters
  if (filters.direction)      txs = txs.filter(t => t.direction === filters.direction);
  if (filters.status)         txs = txs.filter(t => t.status === filters.status);
  if (filters.participant)    txs = txs.filter(t => t.senderId === filters.participant || t.receiverId === filters.participant);
  if (filters.from)           txs = txs.filter(t => t.timestamp && t.timestamp >= filters.from);
  if (filters.to)             txs = txs.filter(t => t.timestamp && t.timestamp <= filters.to + 'T23:59:59.999Z');
  if (filters.limit)          txs = txs.slice(0, parseInt(filters.limit, 10));

  if (format === 'json') {
    console.log(JSON.stringify(txs, null, 2));
    return;
  }

  printTransactionTable(txs, 'Transaction Log');
}

// ─── logs get <messageId> ─────────────────────────────────────────────────────

async function cmdGet(args) {
  const [messageId] = args;

  if (!messageId) {
    console.error('Usage: logs get <messageId>');
    process.exit(1);
  }

  const result = await getStatus(messageId);
  const format = extractFlag(args, '--format', 'table');

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const statusColor = getStatusColor(result.status);
  console.log('\n  AP Core — Transaction Detail');
  console.log('  '.padEnd(52, '─'));
  console.log(`  Message ID    : ${result.messageId}`);
  console.log(`  Status        : ${statusColor}${result.status}\x1b[0m`);
  if (result.receipt) console.log(`  Receipt       : ${result.receipt.substring(0, 60)}…`);
  if (result.error)    console.log(`  Error         : ${result.error}`);
  console.log(`  Retries       : ${result.retries}`);
  console.log(`  Last Updated  : ${result.updated_at}`);
  console.log('  '.padEnd(52, '─'));
  console.log();
}

// ─── logs export ──────────────────────────────────────────────────────────────

async function cmdExport(args) {
  const from       = extractFlag(args, '--from');
  const to         = extractFlag(args, '--to');
  const format     = extractFlag(args, '--format', 'csv');
  const outputPath = extractFlag(args, '--output');

  if (!from || !to) {
    console.error('Usage: logs export --from=<date> --to=<date> [--format=csv|json] [--output=<path>]');
    process.exit(1);
  }

  let txs = await getTransactions();

  // Apply date filter
  txs = txs.filter(t =>
    t.timestamp &&
    t.timestamp >= from &&
    t.timestamp <= to + 'T23:59:59.999Z'
  );

  // Sort oldest-first for export
  txs.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

  let output;
  if (format === 'json') {
    output = JSON.stringify(txs, null, 2);
  } else {
    output = serializeCSV(txs);
  }

  if (outputPath) {
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, output, 'utf8');
    console.log(`Exported ${txs.length} records to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

// ─── logs prune ───────────────────────────────────────────────────────────────

async function cmdPrune(args) {
  const olderThan  = extractFlag(args, '--older-than') || String(RETENTION_DAYS);
  const dryRun     = args.includes('--dry-run');
  const verbose    = args.includes('--verbose');
  const days       = parseInt(olderThan, 10);

  if (isNaN(days) || days < 0) {
    console.error('--older-than must be a non-negative integer');
    process.exit(1);
  }

  const { transactionStore } = createStore(process.env.PEPPOL_STORE_ADAPTER || 'mock', {
    dbPath: process.env.AP_CORE_DB_PATH,
  });

  if (dryRun) {
    // Show count without deleting
    const allTxs = await transactionStore.list({});
    const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const toDelete = allTxs.filter(t => t.timestamp && t.timestamp < cutoff);
    if (verbose) {
      console.log(`[dry-run] Would delete ${toDelete.length} records older than ${days} days (before ${cutoff})`);
    } else {
      console.log(`${toDelete.length}`);
    }
    return;
  }

  if (typeof transactionStore.deleteOlderThan !== 'function') {
    console.error('Prune is not supported by the current store adapter');
    process.exit(1);
  }

  const deleted = await transactionStore.deleteOlderThan(days);
  if (verbose) {
    console.log(`Pruned ${deleted} records older than ${days} days`);
  }
}

// ─── logs retention-status ────────────────────────────────────────────────────

async function cmdRetentionStatus(args) {
  const format = extractFlag(args, '--format', 'table');
  const { transactionStore } = createStore(process.env.PEPPOL_STORE_ADAPTER || 'mock', {
    dbPath: process.env.AP_CORE_DB_PATH,
  });

  if (typeof transactionStore.getRetentionRange !== 'function') {
    console.error('Retention status is not supported by the current store adapter');
    process.exit(1);
  }

  const range = await transactionStore.getRetentionRange();

  if (format === 'json') {
    console.log(JSON.stringify(range, null, 2));
    return;
  }

  const now = new Date().toISOString();
  const oldestDate = range.oldest ? new Date(range.oldest) : null;
  const newestDate = range.newest ? new Date(range.newest) : null;

  let ageDays = null;
  let retentionOk = null;
  if (oldestDate) {
    ageDays = Math.floor((Date.now() - oldestDate.getTime()) / 86400000);
    retentionOk = ageDays <= RETENTION_DAYS;
  }

  console.log('\n  Retention Status');
  console.log('  '.padEnd(52, '─'));
  console.log(`  Oldest record : ${range.oldest ?? 'n/a'}`);
  console.log(`  Newest record : ${range.newest ?? 'n/a'}`);
  if (ageDays !== null) {
    const ageColor = retentionOk ? '\x1b[32m' : '\x1b[33m';
    console.log(`  Log age       : ${ageColor}${ageDays} days\x1b[0m (retention: ${RETENTION_DAYS} days)`);
    console.log(`  Compliant     : ${retentionOk ? '\x1b[32m✓ Yes\x1b[0m' : '\x1b[33m✗ No\x1b[0m'}`);
  }
  console.log('  '.padEnd(52, '─'));
  console.log();
}

// ─── CSV serialization ────────────────────────────────────────────────────────

function serializeCSV(transactions) {
  const headers = [
    'message_id', 'direction', 'status', 'sender_id', 'receiver_id',
    'doc_type_id', 'timestamp', 'completed_at', 'error_message',
  ];

  const rows = transactions.map(tx =>
    headers.map(h => {
      const val = (tx[h] ?? '');
      // Escape CSV fields that contain commas, quotes, or newlines
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n') + '\n';
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Parse --key=value and --key value style flags into a flat object.
 */
function parseFilters(args) {
  const filters = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eqIdx = a.indexOf('=');
      if (eqIdx !== -1) {
        const key = a.slice(2, eqIdx);
        filters[key] = a.slice(eqIdx + 1);
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

function extractFlag(args, flag, defaultVal) {
  for (const a of args) {
    if (a.startsWith(flag + '=')) return a.slice(flag.length + 1);
  }
  return defaultVal;
}

function getStatusColor(status) {
  switch (status) {
    case 'delivered': case 'received': return '\x1b[32m';
    case 'pending':    case 'sent':    return '\x1b[33m';
    case 'error':     case 'failed':  return '\x1b[31m';
    default:                          return '\x1b[0m';
  }
}

function printTransactionTable(txs, title = 'Transactions') {
  if (txs.length === 0) {
    console.log(`\n  ${title} — no records found\n`);
    return;
  }

  const W_MSGID   = 38;
  const W_DIR     = 8;
  const W_STATUS  = 12;
  const W_SENDER  = 22;
  const W_RECEIVER= 22;
  const W_DATE    = 19;
  const sep = '  ';

  const divider = `  ${'─'.repeat(W_MSGID + W_DIR + W_STATUS + W_SENDER + W_RECEIVER + W_DATE + sep.length * 5)}`;

  console.log(`\n  ${title}`);
  console.log(divider);
  console.log(
    `  ${'MESSAGE ID'.padEnd(W_MSGID)}${sep}` +
    `${'DIR'.padEnd(W_DIR)}${sep}` +
    `${'STATUS'.padEnd(W_STATUS)}${sep}` +
    `${'SENDER'.padEnd(W_SENDER)}${sep}` +
    `${'RECEIVER'.padEnd(W_RECEIVER)}${sep}` +
    `${'DATE'.padEnd(W_DATE)}`
  );
  console.log(divider);

  for (const tx of txs) {
    const color = getStatusColor(tx.status);
    const msgId   = (tx.messageId   || '').substring(0, W_MSGID);
    const dir     = (tx.direction    || '').padEnd(W_DIR);
    const status  = (`${color}${tx.status}\x1b[0m`).padEnd(W_STATUS);
    const sender  = (tx.senderId     || '').substring(0, W_SENDER).padEnd(W_SENDER);
    const recv    = (tx.receiverId   || '').substring(0, W_RECEIVER).padEnd(W_RECEIVER);
    const date    = (tx.timestamp    || '').substring(0, W_DATE).padEnd(W_DATE);

    console.log(
      `  ${msgId}${sep}${dir}${sep}${status}${sep}${sender}${sep}${recv}${sep}${date}`
    );
  }

  console.log(divider);
  console.log(`  ${txs.length} record${txs.length !== 1 ? 's' : ''}\n`);
}
