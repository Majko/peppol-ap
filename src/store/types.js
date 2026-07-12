/**
 * JSDoc type definitions for the storage adapter layer.
 * These are documentation types only — JavaScript has no runtime enforcement.
 */

/**
 * @typedef {Object} Transaction
 * @property {string} messageId
 * @property {'send'|'receive'} direction
 * @property {'pending'|'sent'|'delivered'|'error'|'received'} status
 * @property {string} [senderId]
 * @property {string} [receiverId]
 * @property {string} [senderAPId]
 * @property {string} [receiverAPId]
 * @property {string} [docTypeId]
 * @property {string} [processId]
 * @property {string} [transportProfile]
 * @property {string} [payloadKey]
 * @property {string} [sbdhXml]
 * @property {string} [ublXml]
 * @property {string|null} [receiptXml]
 * @property {string|null} [errorMessage]
 * @property {number} [retries]
 * @property {string} timestamp         ISO 8601
 * @property {string|null} [completedAt]
 */

/**
 * @typedef {Object} SMPEntry
 * @property {string} participantId
 * @property {string} endpointUrl
 * @property {string} [receiverCertPem]
 * @property {string} [transportProfile]
 * @property {string} resolvedAt       ISO 8601
 * @property {string} expiresAt        ISO 8601
 */

/**
 * @typedef {Object} CertEntry
 * @property {string} certId
 * @property {string} certPem
 * @property {string} privKeyPem
 * @property {boolean} isActive
 * @property {string} createdAt        ISO 8601
 * @property {string} expiresAt        ISO 8601
 */

export {};
