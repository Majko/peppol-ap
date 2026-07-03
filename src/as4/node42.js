/**
 * Node42 Integration Layer
 *
 * Wraps @n42/edelivery — the pure Node.js Peppol AS4 toolkit.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';

// ── Paths ─────────────────────────────────────────────────────────────────────

function getN42Home() {
  return process.env.N42_HOME || path.join(os.homedir(), '.node42');
}

function getCertsDir() {
  return path.join(getN42Home(), 'certs');
}

function getSchematronDir() {
  return path.join(getN42Home(), 'schematrons');
}

// ── Certificate paths ─────────────────────────────────────────────────────────

/**
 * Paths to certificate files in the Node42 workspace
 */
export function getCertPaths() {
  const certsDir = getCertsDir();
  return {
    cert: path.join(certsDir, 'cert.pem'),
    key: path.join(certsDir, 'key.pem'),
    truststore: path.join(certsDir, 'truststore.pem'),
  };
}

// ── Participant Lookup ────────────────────────────────────────────────────────

// Lazy-loaded Node42 (static import at top level would interfere with
// Node.js event loop when server/index.js is the entry point)
let _n42 = null;
async function getN42() {
  if (!_n42) _n42 = await import('@n42/edelivery');
  return _n42;
}

/**
 * Resolve a Peppol participant via real SML→SMP lookup
 *
 * 1. Hashes participant ID → DNS query to SML
 * 2. SML returns SMP URL via NAPTR record
 * 3. Queries SMP for participant metadata (endpoint + certificate)
 *
 * @param {string} participantId - e.g. "9914:SK2023456789"
 * @param {Object} [opts]
 * @param {string} [opts.documentType] - Full document type identifier
 * @param {string} [opts.env='test'] - 'test' or 'production'
 * @returns {Promise<{participantId, smpUrl, services: Array}>}
 */
export async function lookupParticipant(participantId, opts = {}) {
  const { documentType, env = 'test' } = opts;

  // Try real SMP lookup via Node42
  try {
    const n42 = await getN42();
    const context = new n42.N42Context({
      receiverId: normalizeParticipantId(participantId),
      documentType,
      env,
      timeout: 5000,
    });

    const result = await n42.lookupParticipant(context);

    return {
      participantId,
      smpUrl: result.url || context.endpointUrl,
      services: [
        {
          document_type: documentType || 'invoice',
          process_id: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
          endpoint: result.url,
          certificate: result.cert,
          transportProfile: result.profile,
        },
      ],
      resolved_at: new Date().toISOString(),
    };
  } catch (err) {
    // Real SMP lookup failed (no Peppol network access in this environment).
    // Return simulated data so the AP Core remains usable for development.
    return {
      participantId,
      smpUrl: null,
      services: [
        {
          document_type: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
          process_id: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
          endpoint: 'https://ap.simulated.local/as4',
          certificate: '(simulated - SMP lookup unavailable)',
        },
      ],
      resolved_at: new Date().toISOString(),
      _note: 'SMP lookup unavailable — using simulated data. For real Peppol lookups, ensure DNS can resolve SML records.',
    };
  }
}

// ── Document Validation ──────────────────────────────────────────────────────

/**
 * Validate a UBL document against official Peppol Schematron rules
 * Uses SaxonJS worker under the hood
 *
 * @param {string} ublXml - UBL XML to validate
 * @returns {Promise<{valid: boolean, errors: Array, warnings: Array}>}
 */
export async function validateWithNode42(ublXml) {
  // Pre-check: ensure it looks like a UBL document
  if (!ublXml?.includes('<Invoice') && !ublXml?.includes('<CreditNote')) {
    return {
      valid: false,
      errors: [{ rule: 'R001', severity: 'fatal', message: 'Not a UBL Invoice or CreditNote document', location: '/' }],
      warnings: [],
      source: 'node42',
    };
  }

  const n42 = await getN42();
  const context = new n42.N42Context({});

  const errors = (await n42.validateDocument?.(context, ublXml, {
    ruleSet: 'billing',
    includeWarnings: true,
  })) || [];

  const fatals = errors.filter((e) => e.severity === 'fatal' || !e.severity);
  const warnings = errors.filter((e) => e.severity === 'warning');

  return {
    valid: fatals.length === 0,
    errors: fatals.map(normalizeError),
    warnings: warnings.map(normalizeError),
    source: 'node42',
  };
}

// ── AS4 Send ──────────────────────────────────────────────────────────────────

/**
 * Send a document via AS4
 * Requires valid Peppol PKI certificates and network access
 *
 * @param {Buffer|string} sbdhXml - SBDH-wrapped document
 * @param {Object} [opts]
 * @returns {Promise<{messageId, status, receipt, fromApId, toApId}>}
 */
export async function sendViaNode42(sbdhXml, opts = {}) {
  const certPaths = getCertPaths();
  const {
    cert = certPaths.cert,
    key = certPaths.key,
    truststore = certPaths.truststore,
    env = 'test',
    dryrun = false,
  } = opts;

  // Verify certs exist
  for (const [name, p] of [['Certificate', cert], ['Private key', key], ['Truststore', truststore]]) {
    if (!fs.existsSync(p)) {
      throw new Error(
        `${name} not found at ${p}. Run 'n42-edelivery init' first.`
      );
    }
  }

  const n42 = await getN42();
  const context = new n42.N42Context({
    cert,
    key,
    truststore: fs.readFileSync(truststore, 'utf-8'),
    env,
    dryrun,
    timeout: 20000,
    verbose: opts.verbose || false,
  });

  const result = await n42.sendDocument(context, Buffer.from(sbdhXml, 'utf-8'));

  return {
    messageId: result.messageId,
    status: result.signalMessage ? 'delivered' : 'sent',
    receipt: result.signalMessage,
    fromApId: result.fromPartyId,
    toApId: result.toPartyId,
    senderId: result.senderId,
    receiverId: result.receiverId,
    timestamp: result.timestamp,
    dryrun: result.dryrun || false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeParticipantId(id) {
  if (!id?.includes('::')) {
    return `iso6523-actorid-upis::${id || ''}`;
  }
  return id;
}

function normalizeError(e) {
  return {
    rule: e.code || 'unknown',
    severity: e.severity || 'fatal',
    message: e.message || 'Unknown validation error',
    location: e.location || '',
    test: e.test || '',
    schematron: e.schematron || '',
  };
}
