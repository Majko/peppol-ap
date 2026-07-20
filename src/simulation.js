/**
 * Simulation mode state — extracted to its own module to avoid circular
 * import dependencies (src/index.js ↔ src/as4/message.js).
 */

let simulationMode = false;

// ═══════════════════════════════════════════════════════════════════════════
// CRL / OCSP simulation (always soft-pass in simulation mode)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulate a CRL distribution-point check in simulation mode.
 * Always passes — soft-fail stubs for when real CRL checking isn't available.
 * @param {string} _endpoint  CRL DP URL (ignored)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function simCheckCRL(_endpoint) {
  return { ok: true };
}

/**
 * Simulate an OCSP responder check in simulation mode.
 * Always passes — soft-fail stubs for when real OCSP checking isn't available.
 * @param {string} _endpoint  OCSP responder URL (ignored)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function simCheckOCSP(_endpoint) {
  return { ok: true };
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
