/**
 * Simulation mode state — extracted to its own module to avoid circular
 * import dependencies (src/index.js ↔ src/as4/message.js).
 */

let simulationMode = false;

// ═══════════════════════════════════════════════════════════════════════════
// Circuit breaker state — per endpoint
// ═══════════════════════════════════════════════════════════════════════════

const CB_CONFIG = {
  failureThreshold: 5,    // open after 5 consecutive failures
  resetTimeoutMs: 60_000, // attempt reopen after 60 s
};

/**
 * @typedef {Object} CircuitBreakerState
 * @property {'closed'|'open'|'half-open'} state
 * @property {number} failureCount
 * @property {number} lastFailureTime  epoch ms, 0 if never
 */

/** @type {Map<string, CircuitBreakerState>} */
const _cbMap = new Map();

/**
 * Get (or initialise) the circuit-breaker record for an endpoint.
 * @param {string} endpoint  e.g. "https://crl.peppol.sim.local"
 * @returns {CircuitBreakerState}
 */
function _cbState(endpoint) {
  if (!_cbMap.has(endpoint)) {
    _cbMap.set(endpoint, { state: 'closed', failureCount: 0, lastFailureTime: 0 });
  }
  return _cbMap.get(endpoint);
}

/**
 * Record a failure for an endpoint. Advances the circuit toward OPEN.
 * @param {string} endpoint
 */
export function cbRecordFailure(endpoint) {
  const cb = _cbState(endpoint);
  cb.failureCount++;
  cb.lastFailureTime = Date.now();
  if (cb.failureCount >= CB_CONFIG.failureThreshold) {
    cb.state = 'open';
  }
}

/**
 * Record a success for an endpoint. Resets to CLOSED.
 * @param {string} endpoint
 */
export function cbRecordSuccess(endpoint) {
  const cb = _cbState(endpoint);
  cb.state = 'closed';
  cb.failureCount = 0;
  cb.lastFailureTime = 0;
}

/**
 * Check whether an endpoint's circuit allows requests.
 * Transitions OPEN → half-open when resetTimeoutMs has elapsed.
 * @param {string} endpoint
 * @returns {'allowed'|'blocked'} result
 */
export function cbAllowRequest(endpoint) {
  const cb = _cbState(endpoint);
  if (cb.state === 'closed') return 'allowed';
  if (cb.state === 'open') {
    const elapsed = Date.now() - cb.lastFailureTime;
    if (elapsed >= CB_CONFIG.resetTimeoutMs) {
      cb.state = 'half-open';
      return 'allowed';
    }
    return 'blocked';
  }
  // half-open — allow through to probe
  return 'allowed';
}

/**
 * Get the current circuit-breaker snapshot for an endpoint (for debugging/monitoring).
 * @param {string} endpoint
 * @returns {Readonly<CircuitBreakerState>}
 */
export function cbGetState(endpoint) {
  return { ..._cbState(endpoint) };
}

/**
 * Reset circuit-breaker state for an endpoint (e.g. after manual intervention).
 * @param {string} endpoint
 */
export function cbReset(endpoint) {
  _cbMap.delete(endpoint);
}

// ═══════════════════════════════════════════════════════════════════════════
// CRL / OCSP simulation with soft-fail
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulate a CRL distribution-point check in simulation mode.
 * Soft-fail: if CRL is unavailable or times out, log a warning and return OK.
 * If the circuit for the CRL endpoint is OPEN, return OK immediately.
 *
 * @param {string} endpoint  CRL DP URL
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function simCheckCRL(endpoint) {
  if (cbAllowRequest(endpoint) === 'blocked') {
    return { ok: true, reason: 'circuit_open' };
  }
  try {
    // Simulate network call — in simulation mode we just resolve quickly
    await _simTimeout(50);
    cbRecordSuccess(endpoint);
    return { ok: true };
  } catch (err) {
    cbRecordFailure(endpoint);
    // Soft-fail: warn but don't block the send
    console.warn(`[CRL] Soft-fail for ${endpoint}: ${err.message}`);
    return { ok: true, reason: 'soft_fail' };
  }
}

/**
 * Simulate an OCSP responder check in simulation mode.
 * Soft-fail: if OCSP is unavailable or times out, log a warning and return OK.
 * If the circuit for the OCSP endpoint is OPEN, return OK immediately.
 *
 * @param {string} endpoint  OCSP responder URL
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function simCheckOCSP(endpoint) {
  if (cbAllowRequest(endpoint) === 'blocked') {
    return { ok: true, reason: 'circuit_open' };
  }
  try {
    await _simTimeout(50);
    cbRecordSuccess(endpoint);
    return { ok: true };
  } catch (err) {
    cbRecordFailure(endpoint);
    console.warn(`[OCSP] Soft-fail for ${endpoint}: ${err.message}`);
    return { ok: true, reason: 'soft_fail' };
  }
}

/** Simple simulation delay */
function _simTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulation mode flag
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enable simulation mode — all Peppol network operations happen in-memory.
 * No DNS/SML/SMP lookups, no real AS4 transport. Returns realistic MDN receipts.
 */
export function enableSimulation() {
  simulationMode = true;
}

/**
 * Disable simulation mode and use real Peppol network
 */
export function disableSimulation() {
  simulationMode = false;
}

/**
 * Check if simulation mode is active
 */
export function isSimulationEnabled() {
  return simulationMode;
}

/** Expose the raw flag for modules that need to test it without calling a function */
export { simulationMode };
