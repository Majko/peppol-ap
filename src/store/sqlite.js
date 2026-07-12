/**
 * SQLite-backed storage adapter.
 * Implements TransactionStore, SMPCache, and APIdentityStore using better-sqlite3.
 */
import Database from 'better-sqlite3';
import { runMigrations } from './schema.js';

/**
 * @param {string} dbPath  File path to the SQLite database
 * @returns {{ transactionStore: import('./types.js').TransactionStore, smpCache: import('./types.js').SMPCache, identityStore: import('./types.js').APIdentityStore }}
 */
export function createSQLiteStores(dbPath) {
  const db = new Database(dbPath);

  // Enable WAL mode for concurrent read access
  db.pragma('journal_mode=WAL');
  db.pragma('busy_timeout=5000');

  // Run schema migrations
  runMigrations(db);

  // ─── TransactionStore ───────────────────────────────────────────────────────

  const transactionStore = {
    /** @type {import('better-sqlite3').Database} */
    db,

    async save(tx) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO transactions
          (message_id, direction, status, sender_id, receiver_id,
           sender_ap_id, receiver_ap_id, doc_type_id, process_id,
           transport_profile, payload_key, receipt_xml, error_message,
           created_at, completed_at)
        VALUES
          (@messageId, @direction, @status, @senderId, @receiverId,
           @senderApId, @receiverApId, @docTypeId, @processId,
           @transportProfile, @payloadKey, @receiptXml, @errorMessage,
           @createdAt, @completedAt)
      `);
      stmt.run({
        messageId: tx.messageId,
        direction: tx.direction,
        status: tx.status || 'pending',
        senderId: tx.senderId ?? null,
        receiverId: tx.receiverId ?? null,
        senderApId: tx.senderApId ?? null,
        receiverApId: tx.receiverApId ?? null,
        docTypeId: tx.docTypeId ?? null,
        processId: tx.processId ?? null,
        transportProfile: tx.transportProfile ?? null,
        payloadKey: tx.payloadKey ?? null,
        receiptXml: tx.receiptXml ?? null,
        errorMessage: tx.errorMessage ?? null,
        createdAt: tx.timestamp ?? new Date().toISOString(),
        completedAt: tx.completedAt ?? null,
      });
    },

    async get(messageId) {
      const row = db.prepare('SELECT * FROM transactions WHERE message_id = ?').get(messageId);
      if (!row) return null;
      return _rowToTransaction(row);
    },

    async list(filters = {}) {
      let sql = 'SELECT * FROM transactions WHERE 1=1';
      const params = {};

      if (filters.direction) {
        sql += ' AND direction = @direction';
        params.direction = filters.direction;
      }
      if (filters.status) {
        sql += ' AND status = @status';
        params.status = filters.status;
      }
      if (filters.senderId) {
        sql += ' AND sender_id = @senderId';
        params.senderId = filters.senderId;
      }
      if (filters.receiverId) {
        sql += ' AND receiver_id = @receiverId';
        params.receiverId = filters.receiverId;
      }
      if (filters.from) {
        sql += ' AND created_at >= @from';
        params.from = filters.from;
      }
      if (filters.to) {
        sql += ' AND created_at <= @to';
        params.to = filters.to + 'T23:59:59.999Z';
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit) {
        sql += ' LIMIT @limit';
        params.limit = filters.limit;
      }

      const rows = db.prepare(sql).all(params);
      return rows.map(_rowToTransaction);
    },

    async updateStatus(messageId, status, metadata = {}) {
      const completedAt =
        status === 'delivered' || status === 'error' || status === 'failed'
          ? new Date().toISOString()
          : null;
      db.prepare(`
        UPDATE transactions
        SET status = @status,
            error_message = @errorMessage,
            receipt_xml = @receiptXml,
            completed_at = COALESCE(@completedAt, completed_at)
        WHERE message_id = @messageId
      `).run({
        status,
        errorMessage: metadata.errorMessage ?? null,
        receiptXml: metadata.receiptXml ?? null,
        completedAt,
        messageId,
      });
    },

    /**
     * @param {number} days
     * @returns {Promise<number>} count deleted
     */
    async deleteOlderThan(days) {
      const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const result = db.prepare(
        `DELETE FROM transactions WHERE created_at < @cutoff`
      ).run({ cutoff });
      return result.changes;
    },

    /**
     * @returns {Promise<{ oldest: string|null, newest: string|null }>}
     */
    async getRetentionRange() {
      const row = db.prepare(
        `SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM transactions`
      ).get();
      return { oldest: row?.oldest ?? null, newest: row?.newest ?? null };
    },
  };

  // ─── SMPCache ──────────────────────────────────────────────────────────────

  const smpCache = {
    async get(participantId) {
      const row = db.prepare(`
        SELECT * FROM smp_cache
        WHERE participant_id = ?
          AND (julianday('now') * 86400 * 1000) < (julianday(expires_at) * 86400 * 1000)
      `).get(participantId);
      if (!row) return null;
      return {
        participantId: row.participant_id,
        endpointUrl: row.endpoint_url,
        receiverCertPem: row.receiver_cert_pem ?? null,
        transportProfile: row.transport_profile,
        resolvedAt: row.resolved_at,
        expiresAt: row.expires_at,
      };
    },

    async set(participantId, entry, ttlSeconds = 3600) {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO smp_cache
          (participant_id, endpoint_url, receiver_cert_pem,
           transport_profile, resolved_at, expires_at)
        VALUES
          (@participantId, @endpointUrl, @receiverCertPem,
           @transportProfile, datetime('now'), @expiresAt)
      `).run({
        participantId,
        endpointUrl: entry.endpointUrl,
        receiverCertPem: entry.receiverCertPem ?? null,
        transportProfile: entry.transportProfile ?? 'peppol:as4:2024:v1.0',
        expiresAt,
      });
    },

    async invalidate(participantId) {
      db.prepare('DELETE FROM smp_cache WHERE participant_id = ?').run(participantId);
    },
  };

  // ─── APIdentityStore ───────────────────────────────────────────────────────

  const identityStore = {
    async getActiveCert() {
      const row = db.prepare(
        'SELECT * FROM identities WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
      ).get();
      if (!row) return null;
      return _rowToCertEntry(row);
    },

    async getCert(certId) {
      const row = db.prepare('SELECT * FROM identities WHERE cert_id = ?').get(certId);
      if (!row) return null;
      return _rowToCertEntry(row);
    },

    /**
     * Returns the private key PEM of the active cert, or null.
     * Used for decrypting incoming AS4 xenc:EncryptedData payloads.
     */
    async getDecryptionKey() {
      const cert = await identityStore.getActiveCert();
      return cert?.privKeyPem ?? null;
    },

    async storeCert(entry) {
      if (entry.isActive) {
        // Deactivate all existing certs first (only one active at a time)
        db.prepare('UPDATE identities SET is_active = 0').run();
      }
      db.prepare(`
        INSERT OR REPLACE INTO identities
          (cert_id, cert_pem, priv_key_pem, is_active, created_at, expires_at)
        VALUES
          (@certId, @certPem, @privKeyPem, @isActive, datetime('now'), @expiresAt)
      `).run({
        certId: entry.certId,
        certPem: entry.certPem,
        privKeyPem: entry.privKeyPem,
        isActive: entry.isActive ? 1 : 0,
        expiresAt: entry.expiresAt,
      });
    },
  };

  return { transactionStore, smpCache, identityStore };
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

/** @param {Record<string,any>} row */
function _rowToTransaction(row) {
  return {
    messageId: row.message_id,
    direction: row.direction,
    status: row.status,
    senderId: row.sender_id ?? undefined,
    receiverId: row.receiver_id ?? undefined,
    senderApId: row.sender_ap_id ?? undefined,
    receiverApId: row.receiver_ap_id ?? undefined,
    docTypeId: row.doc_type_id ?? undefined,
    processId: row.process_id ?? undefined,
    transportProfile: row.transport_profile ?? undefined,
    payloadKey: row.payload_key ?? undefined,
    receiptXml: row.receipt_xml ?? undefined,
    errorMessage: row.error_message ?? undefined,
    timestamp: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

/** @param {Record<string,any>} row */
function _rowToCertEntry(row) {
  return {
    certId: row.cert_id,
    certPem: row.cert_pem,
    privKeyPem: row.priv_key_pem,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
