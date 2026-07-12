# CLI Log Commands + Retention Management

**Status:** implemented

**Blocked by:** ap-core-infrastructure/02 - SQLite storage adapter (needs transactions table with created_at column)

## What to build

SPA 9.4.2 requires: *"Logging all activities... kept for at least 3 months... on reasonable request, reveal or give access to relevant data from the logs."*

Add CLI commands to the AP Core for querying, exporting, and pruning the transaction log. This satisfies the SPA requirement without needing a GUI.

### CLI interface

```bash
# Get a single transaction by messageId
peppol-ap logs get <messageId>

# List transactions with filters
peppol-ap logs list [--participant <id>] [--direction send|receive]
                     [--status sent|delivered|error] [--from <date>]
                     [--to <date>] [--limit <n>] [--format json|table]

# Export transactions for external analysis
peppol-ap logs export --from <date> --to <date>
                       [--format csv|json] [--output <path>]

# Prune old logs (retention enforcement)
peppol-ap logs prune --older-than <days>
peppol-ap logs prune --dry-run  # preview without deleting

# Retention status
peppol-ap logs retention-status  # show oldest/newest record dates
```

### Implementation

Each command maps to a `TransactionStore` method:

| CLI command | Store method |
|------------|-------------|
| `logs get <id>` | `transactionStore.get(messageId)` |
| `logs list --filters` | `transactionStore.list(filters)` |
| `logs export --from --to` | `transactionStore.list({ from, to })` + CSV serialization |
| `logs prune --older-than` | `transactionStore.deleteOlderThan(days)` |
| `logs retention-status` | `transactionStore.getRetentionRange()` |

### Retention enforcement

The prune command should:
1. Default to 90 days (SPA minimum)
2. Be configurable via `AP_CORE_LOG_RETENTION_DAYS` env var (in case local law requires longer)
3. Run silently — no output unless `--verbose`
4. Be safe to run as a cron job (weekly cleanup)

### New methods on TransactionStore interface

```typescript
interface TransactionStore {
  // ...existing methods...
  deleteOlderThan(days: number): Promise<number>;  // returns count deleted
  getRetentionRange(): Promise<{ oldest: string; newest: string }>;
}
```

### New files

| File | Purpose |
|------|---------|
| `src/cli/logs.js` | CLI command implementations using `commander` or raw `process.argv` |

### Modified files

| File | Change |
|------|--------|
| `src/store/interfaces.js` | Add `deleteOlderThan`, `getRetentionRange` |
| `src/store/mock.js` | Implement mock versions |
| `src/store/sqlite.js` | Implement SQL queries for deletion + range |
| `package.json` | Add `"logs": "node src/cli/logs.js"` script (or wire into existing CLI) |

### SQLite implementation

```sql
-- deleteOlderThan
DELETE FROM transactions WHERE created_at < datetime('now', '-' || ? || ' days');

-- getRetentionRange
SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM transactions;
```

### Database considerations

- The `created_at` column must be indexed for performance on large datasets
- Pruning should run inside a transaction to ensure atomicity
- Consider using WAL mode for concurrent read access during cleanup

## Acceptance criteria

- [ ] `peppol-ap logs get <messageId>` returns the full transaction record
- [ ] `peppol-ap logs list` supports all filters: participant, direction, status, date range, limit
- [ ] `peppol-ap logs export` produces valid CSV with headers
- [ ] `peppol-ap logs prune --older-than 90` deletes records older than 90 days
- [ ] `peppol-ap logs prune --dry-run` shows count without deleting
- [ ] `peppol-ap logs retention-status` shows oldest and newest record dates
- [ ] `deleteOlderThan` is implemented on both mock and SQLite adapters
- [ ] `getRetentionRange` is implemented on both mock and SQLite adapters
- [ ] Prune runs safely as a cron job (idempotent, no output on success)
- [ ] All existing tests remain green
