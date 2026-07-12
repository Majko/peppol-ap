/**
 * Simulation mode state — extracted to its own module to avoid circular
 * import dependencies (src/index.js ↔ src/as4/message.js).
 */

let simulationMode = false;

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
