/**
 * SQL schema definitions and migration runner.
 * All schema changes should be added as new migration steps here.
 */

export const SCHEMA_VERSION = 1;

/** @type {Record<number, string[]>} */
const migrations = {
  1: [
    `CREATE TABLE IF NOT EXISTS transactions (
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
    )`,
    `CREATE TABLE IF NOT EXISTS smp_cache (
      participant_id TEXT PRIMARY KEY,
      endpoint_url TEXT NOT NULL,
      receiver_cert_pem TEXT,
      transport_profile TEXT DEFAULT 'peppol:as4:2024:v1.0',
      resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS identities (
      cert_id TEXT PRIMARY KEY,
      cert_pem TEXT NOT NULL,
      priv_key_pem TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )`,
  ],
};

/**
 * Run all migrations up to current SCHEMA_VERSION.
 * Idempotent — uses "IF NOT EXISTS" so it's safe to call on an already-initialised DB.
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
  // Ensure schema_version table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  `);

  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  const currentVersion = row?.v ?? 0;

  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const steps = migrations[v];
    if (!steps) continue;
    const insertVersion = db.transaction(() => {
      for (const sql of steps) {
        db.exec(sql);
      }
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(v);
    });
    insertVersion();
    console.log(`[store/schema] Migration ${v} applied`);
  }
}
