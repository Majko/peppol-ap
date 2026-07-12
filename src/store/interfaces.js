/**
 * Storage adapter interface contracts.
 *
 * Any storage adapter (mock, SQLite, DynamoDB…) must implement these shapes.
 * JSDoc types in types.js describe the data shapes.
 */

/**
 * TransactionStore — persists and retrieves AS4 transaction records.
 * @interface TransactionStore
 */

/**
 * @param {Transaction} tx
 * @returns {Promise<void>}
 */
export async function saveTransaction(tx) {
  throw new Error('Not implemented');
}

/**
 * @param {string} messageId
 * @returns {Promise<Transaction|null>}
 */
export async function getTransaction(messageId) {
  throw new Error('Not implemented');
}

/**
 * @param {Object} [filters]
 * @param {'send'|'receive'} [filters.direction]
 * @param {string} [filters.status]
 * @param {string} [filters.senderId]
 * @param {string} [filters.receiverId]
 * @param {string} [filters.from]
 * @param {string} [filters.to]
 * @param {number} [filters.limit]
 * @returns {Promise<Transaction[]>}
 */
export async function listTransactions(filters) {
  throw new Error('Not implemented');
}

/**
 * @param {number} days
 * @returns {Promise<number>} count deleted
 */
export async function deleteOlderThan(days) {
  throw new Error('Not implemented');
}

/**
 * @returns {Promise<{oldest: string|null, newest: string|null}>}
 */
export async function getRetentionRange() {
  throw new Error('Not implemented');
}

/**
 * @param {string} messageId
 * @param {string} status
 * @param {Record<string, unknown>} [metadata]
 * @returns {Promise<void>}
 */
export async function updateTransactionStatus(messageId, status, metadata) {
  throw new Error('Not implemented');
}

/**
 * SMPCache — caches SMP lookup results to avoid redundant network calls.
 * @interface SMPCache
 */

/**
 * @param {string} participantId
 * @returns {Promise<SMPEntry|null>}
 */
export async function getSMPEntry(participantId) {
  throw new Error('Not implemented');
}

/**
 * @param {string} participantId
 * @param {SMPEntry} entry
 * @param {number} ttlSeconds
 * @returns {Promise<void>}
 */
export async function setSMPEntry(participantId, entry, ttlSeconds) {
  throw new Error('Not implemented');
}

/**
 * @param {string} participantId
 * @returns {Promise<void>}
 */
export async function invalidateSMPEntry(participantId) {
  throw new Error('Not implemented');
}

/**
 * APIdentityStore — manages the AP's PKI certificates and private keys.
 * @interface APIdentityStore
 */

/**
 * @returns {Promise<CertEntry|null>}
 */
export async function getActiveCert() {
  throw new Error('Not implemented');
}

/**
 * @param {string} certId
 * @returns {Promise<CertEntry|null>}
 */
export async function getCert(certId) {
  throw new Error('Not implemented');
}

/**
 * @param {CertEntry} entry
 * @returns {Promise<void>}
 */
export async function storeCert(entry) {
  throw new Error('Not implemented');
}
