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
