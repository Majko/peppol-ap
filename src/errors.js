/**
 * AP Core error types.
 */

export class CertExpiredError extends Error {
  /**
   * @param {string} certId
   * @param {string} expiresAt  ISO-8601 timestamp
   */
  constructor(certId, expiresAt) {
    super(`Certificate ${certId} expired at ${expiresAt}`);
    this.name = 'CertExpiredError';
  }
}

export class CertNotFoundError extends Error {
  constructor() {
    super('No active certificate found in identity store');
    this.name = 'CertNotFoundError';
  }
}

/**
 * Base class for errors that can be retried.
 * Retrying is safe because the error indicates a transient failure.
 */
export class RetryableError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]  Optional short code for programmatic handling
   */
  constructor(message, code = 'RETRYABLE') {
    super(message);
    this.name = 'RetryableError';
    this.code = code;
  }
}

/**
 * Base class for errors that must NOT be retried.
 * Retrying would be wasted (e.g. invalid message format) or harmful
 * (e.g. cascading failures from credential exhaustion).
 */
export class NonRetryableError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]  Optional short code for programmatic handling
   */
  constructor(message, code = 'NON_RETRYABLE') {
    super(message);
    this.name = 'NonRetryableError';
    this.code = code;
  }
}

/**
 * Thrown when trust chain validation (OpenPeppol PKI) fails.
 * @param {string} reason  Either 'expired' or 'not_in_pki'
 * @param {string} [senderId]
 */
export class TrustChainValidationError extends Error {
  constructor(reason, senderId) {
    const prefix = reason === 'expired' ? 'Certificate expired' : 'Trust chain validation failed';
    super(senderId ? `${prefix} for sender ${senderId}` : prefix);
    this.name = 'TrustChainValidationError';
    this.reason = reason;
    this.senderId = senderId;
  }
}

/**
 * Classify a raw send-error thrown by Node42 or the network layer.
 * Returns either a RetryableError or NonRetryableError with a short code.
 *
 * @param {Error} err
 * @returns {NonRetryableError|RetryableError}
 */
export function classifySendError(err) {
  const msg = err.message || '';
  const code = err.code || '';

  // ── Non-retryable: certificate problems ──────────────────────────────────
  if (code === 'CERT_EXPIRED' || code === 'cert_expired' || msg.includes('certificate expired')) {
    return new NonRetryableError(msg || 'Certificate expired', 'CERT_EXPIRED');
  }
  if (code === 'CERT_NOT_FOUND' || code === 'cert_not_found' || msg.includes('No active certificate')) {
    return new NonRetryableError(msg || 'No active certificate', 'CERT_NOT_FOUND');
  }

  // ── Non-retryable: signature / validation failures ────────────────────────
  if (msg.includes('signature') || msg.includes('Signature')) {
    return new NonRetryableError(msg, 'SIGNATURE_FAILED');
  }
  if (msg.includes('invalid message') || msg.includes('validation failed') || msg.includes('validation_failed')) {
    return new NonRetryableError(msg, 'VALIDATION_FAILED');
  }
  if (msg.includes('EB:')) {
    // AS4 ebMS error codes are non-retryable — they indicate a semantic problem
    return new NonRetryableError(msg, 'EBMS_ERROR');
  }

  // ── Non-retryable: HTTP 4xx responses ────────────────────────────────────
  if (code === 'EBMS_ERROR' || code === 'HTTP_400' || code === 'HTTP_401' || code === 'HTTP_403' || code === 'HTTP_404') {
    return new NonRetryableError(msg, code);
  }

  // ── Retryable: network / transport / 5xx ────────────────────────────────
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
      code === 'SOCKET_TIMEOUT' || code === 'HTTP_503' || code === 'HTTP_502' ||
      msg.includes('timeout') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') ||
      msg.includes('network') || msg.includes('503') || msg.includes('502')) {
    return new RetryableError(msg, code || 'TRANSPORT_ERROR');
  }

  // Default: treat as retryable but log it
  return new RetryableError(msg, code || 'UNKNOWN');
}
