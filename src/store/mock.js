/**
 * Mock in-memory storage adapter.
 *
 * Behaviour mirrors the original `const transactions = new Map()` that was
 * previously module-scoped in src/index.js. Drop-in replacement — all 90
 * existing tests must remain green without modification.
 */

// ── TransactionStore ────────────────────────────────────────────────────────────

const _transactions = new Map();

/** @type {TransactionStore} */
export const transactionStore = {
  /** @param {Transaction} tx */
  async save(tx) {
    _transactions.set(tx.messageId, { ...tx });
  },

  /** @param {string} messageId */
  async get(messageId) {
    return _transactions.get(messageId) ?? null;
  },

  /**
   * @param {{ direction?: string, status?: string, senderId?: string, receiverId?: string, limit?: number, from?: string, to?: string }} [filters]
   * @returns {Promise<Transaction[]>}
   */
  async list(filters = {}) {
    let txs = Array.from(_transactions.values());
    if (filters.direction)   txs = txs.filter(t => t.direction === filters.direction);
    if (filters.status)     txs = txs.filter(t => t.status === filters.status);
    if (filters.senderId)   txs = txs.filter(t => t.senderId === filters.senderId);
    if (filters.receiverId) txs = txs.filter(t => t.receiverId === filters.receiverId);
    if (filters.from)       txs = txs.filter(t => t.timestamp && t.timestamp >= filters.from);
    if (filters.to)         txs = txs.filter(t => t.timestamp && t.timestamp <= filters.to + 'T23:59:59.999Z');
    // Ordered newest-first
    txs.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
    if (filters.limit) txs = txs.slice(0, filters.limit);
    return txs;
  },

  /**
   * @param {number} days
   * @returns {Promise<number>} count deleted
   */
  async deleteOlderThan(days) {
    const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
    let deleted = 0;
    for (const [messageId, tx] of _transactions) {
      if (tx.timestamp && tx.timestamp < cutoff) {
        _transactions.delete(messageId);
        deleted++;
      }
    }
    return deleted;
  },

  /**
   * @returns {Promise<{ oldest: string|null, newest: string|null }>}
   */
  async getRetentionRange() {
    const all = Array.from(_transactions.values()).filter(t => t.timestamp);
    if (all.length === 0) return { oldest: null, newest: null };
    all.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
    return { oldest: all[0].timestamp, newest: all[all.length - 1].timestamp };
  },

  /**
   * @param {string} messageId
   * @param {string} status
   * @param {Record<string, unknown>} [metadata]
   */
  async updateStatus(messageId, status, metadata = {}) {
    const tx = _transactions.get(messageId);
    if (!tx) return;
    tx.status = status;
    if (metadata.errorMessage !== undefined) tx.errorMessage = metadata.errorMessage;
    if (status === 'delivered' || status === 'error') {
      tx.completedAt = new Date().toISOString();
    }
  },
};

// ── SMPCache ───────────────────────────────────────────────────────────────────

const _smpCache = new Map();

/** @type {SMPCache} */
export const smpCache = {
  /** @param {string} participantId */
  async get(participantId) {
    const entry = _smpCache.get(participantId);
    if (!entry) return null;
    if (new Date(entry.expiresAt) < new Date()) {
      _smpCache.delete(participantId);
      return null;
    }
    return entry;
  },

  /** @param {string} participantId @param {SMPEntry} entry @param {number} ttlSeconds */
  async set(participantId, entry, ttlSeconds) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    _smpCache.set(participantId, { ...entry, expiresAt });
  },

  /** @param {string} participantId */
  async invalidate(participantId) {
    _smpCache.delete(participantId);
  },
};

// ── APIdentityStore ────────────────────────────────────────────────────────────

const _identities = new Map();
let _activeCertId = null;

/** @type {APIdentityStore} */
export const identityStore = {
  /** Returns the most recently stored active cert, or null. */
  async getActiveCert() {
    if (!_activeCertId) return null;
    return _identities.get(_activeCertId) ?? null;
  },

  /** @param {string} certId */
  async getCert(certId) {
    return _identities.get(certId) ?? null;
  },

  /**
   * Returns the private key PEM of the active cert, or null.
   * Used for decrypting incoming AS4 xenc:EncryptedData payloads.
   */
  async getDecryptionKey() {
    const cert = await identityStore.getActiveCert();
    return cert?.privKeyPem ?? null;
  },

  /**
   * @param {CertEntry} entry
   * If isActive is true, deactivates any previously active cert.
   */
  async storeCert(entry) {
    if (entry.isActive) {
      for (const [id, cert] of _identities) {
        if (cert.isActive) {
          cert.isActive = false;
          _identities.set(id, cert);
        }
      }
      _activeCertId = entry.certId;
    }
    _identities.set(entry.certId, { ...entry });
  },
};

// ── Convenience factory helpers ────────────────────────────────────────────────

/** Reset all in-memory stores — use only in tests. */
export function resetMockStores() {
  _transactions.clear();
  _smpCache.clear();
  _identities.clear();
  _activeCertId = null;
}

/**
 * Seed a mock certificate and optional private key for tests.
 * @param {string} certId - Certificate identifier
 * @param {boolean} isActive - Whether the certificate is active
 * @param {string} [privKeyPem] - Optional RSA private key in PEM format (for decryption tests)
 */
export function seedMockCert(certId = 'mock-cert-001', isActive = true, privKeyPem = null) {
  const entry = {
    certId,
    certPem: '-----BEGIN CERTIFICATE-----\nMOCKCERT\n-----END CERTIFICATE-----',
    privKeyPem: privKeyPem ?? '[REDACTED PRIVATE KEY]',
    isActive,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
  identityStore.storeCert(entry);
  return entry;
}
