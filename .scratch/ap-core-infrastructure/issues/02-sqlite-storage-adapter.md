# SQLite Storage Adapter

**Status:** implemented

**Blocked by:** 01 - Storage adapter interface + mock

## Parent

Depends on ticket 01 — Storage adapter interface + mock

## What to build

Implement a SQLite-backed adapter for all three store interfaces (`TransactionStore`, `SMPCache`, `APIdentityStore`) using `better-sqlite3`. Add inline schema creation with `IF NOT EXISTS`. Wire it via the factory function when `adapter: 'sqlite'` is selected.

Transactions, SMP cache entries, and identity records survive server restart. Duplicate message detection works across restarts. The schema has three tables.

### Schema

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
  payload_key TEXT,
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
  priv_key_pem TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
```

### TransactionStore operations

| Operation | SQL |
|-----------|-----|
| `save(tx)` | `INSERT OR REPLACE INTO transactions (...)` |
| `get(messageId)` | `SELECT * FROM transactions WHERE message_id = ?` |
| `list(filters)` | `SELECT * FROM transactions` + optional WHERE clauses + `ORDER BY created_at DESC LIMIT ?` |
| `updateStatus(messageId, status, metadata)` | `UPDATE transactions SET status = ?, error_message = ?, completed_at = ? WHERE message_id = ?` |

### SMPCache operations

| Operation | SQL |
|-----------|-----|
| `get(participantId)` | `SELECT * FROM smp_cache WHERE participant_id = ? AND datetime('now') < expires_at` |
| `set(participantId, entry, ttlSeconds)` | `INSERT OR REPLACE INTO smp_cache (...) VALUES (..., datetime('now', '+' || ttlSeconds || ' seconds'))` |
| `invalidate(participantId)` | `DELETE FROM smp_cache WHERE participant_id = ?` |

### APIdentityStore operations

| Operation | SQL |
|-----------|-----|
| `getActiveCert()` | `SELECT * FROM identities WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1` |
| `getCert(certId)` | `SELECT * FROM identities WHERE cert_id = ?` |
| `storeCert(entry)` | `INSERT OR REPLACE INTO identities (...)` |

### Database file location

- Default: `~/.peppol-ap/ap-core.db`
- Configurable via `AP_CORE_DB_PATH` env var
- Directory is created automatically if it doesn't exist

### WAL mode

Enable WAL mode for better concurrent read performance when multiple cluster workers access the same DB:

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

### New files

| File | Purpose |
|------|---------|
| `src/store/sqlite.js` | SQLite implementation of all three stores. Exports `createSQLiteStores(dbPath)`. |
| `src/store/schema.js` | SQL schema strings and migration function |
| `test/storage-adapter.test.js` | (extend) Run the same interface contract tests against the SQLite adapter |

### Modified files

| File | Change |
|------|--------|
| `src/store/factory.js` | Add `'sqlite'` case that calls `createSQLiteStores(options.dbPath)` |
| `src/index.js` | Accept `adapter` and `dbPath` from config/env and pass to factory |
| `server/index.js` | Read `AP_CORE_ADAPTER` and `AP_CORE_DB_PATH` from env and pass to AP Core init |
| `package.json` | Add `better-sqlite3` dependency |

## Acceptance criteria

- [ ] `better-sqlite3` dependency added to `package.json`
- [ ] Database file is created at the configured path (or default `~/.peppol-ap/ap-core.db`)
- [ ] All three tables (`transactions`, `smp_cache`, `identities`) are created on first access
- [ ] WAL mode is enabled
- [ ] `TransactionStore.save()` persists and `get()` retrieves across a simulated restart (close + reopen DB)
- [ ] `TransactionStore.get()` returns `null` for unknown `messageId`
- [ ] `TransactionStore.list()` returns transactions ordered by `created_at` DESC, respects `limit`
- [ ] `TransactionStore.updateStatus()` updates the row and sets `completed_at` when status is `delivered` or `error`
- [ ] Duplicate `messageId` detection works: second `save()` with same ID returns existing entry
- [ ] `SMPCache.get()` returns cached entry if not expired, `null` if expired or missing
- [ ] `SMPCache.set()` stores entry with calculated `expires_at`
- [ ] `SMPCache.invalidate()` removes the entry
- [ ] `APIdentityStore.getActiveCert()` returns the most recent active cert
- [ ] `APIdentityStore.storeCert()` with `is_active: 1` deactivates other certs (only one active at a time)
- [ ] All interface contract tests pass for both mock and SQLite adapters
- [ ] `npm test` is green
