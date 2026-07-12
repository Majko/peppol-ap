/**
 * Node42 Integration Layer
 *
 * Thin wrappers around @n42/edelivery's **public** API.
 * Only uses functions that Node42 explicitly exports from src/index.js.
 * Anything not exported by Node42 is implemented independently in this
 * project and maintained separately.
 *
 * Public Node42 API (from their src/index.js):
 *   N42Context, N42Error, N42ErrorCode
 *   lookupParticipant, sendDocument, generateReports
 *   parseCert, validateCert, getCertInfo, getKeyInfo, getCertDetails, getKeyDetails
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { CertExpiredError } from '../errors.js';

// Lazy import — avoids top-level await interfering with Node.js event loop
// when server/index.js is the entry point.
let _n42 = null;
async function n42() {
  if (!_n42) _n42 = await import('@n42/edelivery');
  return _n42;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function getN42Home() {
  return process.env.N42_HOME || path.join(os.homedir(), '.node42');
}

function getCertsDir() {
  return path.join(getN42Home(), 'certs');
}

export function getCertPaths() {
  const certsDir = getCertsDir();
  return {
    cert: path.join(certsDir, 'cert.pem'),
    key: path.join(certsDir, 'key.pem'),
    truststore: path.join(certsDir, 'truststore.pem'),
  };
}

// ── Default truststore path (configurable via AP_CORE_TRUSTSTORE_PATH) ──────────

export function getDefaultTruststorePath() {
  return process.env.AP_CORE_TRUSTSTORE_PATH ||
    path.join(getCertsDir(), 'truststore.pem');
}

// ── Participant Lookup (public API: lookupParticipant) ────────────────────────

/**
 * Resolve a Peppol participant via real SML→SMP lookup.
 * Delegates to Node42's public lookupParticipant().
 * Falls back to simulated data when the Peppol network is unreachable.
 */
export async function lookupParticipant(participantId, opts = {}) {
  const { documentType, env = 'test' } = opts;

  try {
    const n42mod = await n42();
    const ctx = new n42mod.N42Context({
      receiverId: normalizeParticipantId(participantId),
      documentType,
      env,
      timeout: 5000,
    });

    const result = await n42mod.lookupParticipant(ctx);

    return {
      participantId,
      smpUrl: result.url || ctx.endpointUrl,
      services: [{
        document_type: documentType || 'invoice',
        process_id: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        endpoint: result.url,
        certificate: result.cert,
        transportProfile: result.profile,
      }],
      resolved_at: new Date().toISOString(),
    };
  } catch {
    return {
      participantId,
      smpUrl: null,
      services: [{
        document_type: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
        process_id: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        endpoint: 'https://ap.simulated.local/as4',
        certificate: '(simulated)',
      }],
      resolved_at: new Date().toISOString(),
      _note: 'SMP unavailable — using simulated data.',
    };
  }
}

// ── AS4 Send (public API: sendDocument) ───────────────────────────────────────

/**
 * Send a document via AS4 using Node42's public sendDocument().
 *
 * @param {string} sbdhXml  - The SBDH-wrapped XML payload
 * @param {Object} opts
 * @param {string}   opts.certPem      - Certificate PEM string (loaded from identity store)
 * @param {string}   opts.keyPem       - Private key PEM string
 * @param {string}   [opts.truststorePath] - Path to truststore PEM file (default: ~/.node42/certs/truststore.pem)
 * @param {string}   [opts.certId]     - Cert ID for expiry error messages
 * @param {string}   [opts.expiresAt]  - ISO-8601 expiry timestamp (checked before send)
 * @param {string}   [opts.env='test'] - Peppol environment
 * @param {boolean}  [opts.dryrun=false] - Skip actual network send
 * @param {boolean}  [opts.verbose=false]
 */
export async function sendViaNode42(sbdhXml, opts = {}) {
  const {
    certPem,
    keyPem,
    truststorePath,
    certId = 'unknown',
    expiresAt,
    env = 'test',
    dryrun = false,
    verbose = false,
  } = opts;

  if (!certPem) {
    throw new Error('certPem is required for AS4 send');
  }
  if (!keyPem) {
    throw new Error('keyPem is required for AS4 send');
  }

  // Cert expiry check — reject expired certs before attempting any network call
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (expiry <= new Date()) {
      throw new CertExpiredError(certId, expiresAt);
    }
  }

  const effectiveTruststore = truststorePath || getDefaultTruststorePath();

  const n42mod = await n42();
  const ctx = new n42mod.N42Context({
    certPem,
    keyPem,
    truststore: fs.existsSync(effectiveTruststore)
      ? fs.readFileSync(effectiveTruststore, 'utf-8')
      : '',
    env,
    dryrun,
    timeout: 20000,
    verbose,
  });

  const result = await n42mod.sendDocument(ctx, Buffer.from(sbdhXml, 'utf-8'));

  return {
    messageId: result.messageId,
    status: result.signalMessage ? 'delivered' : 'sent',
    receipt: result.signalMessage,
    fromApId: result.fromPartyId,
    toApId: result.toPartyId,
    senderId: result.senderId,
    receiverId: result.receiverId,
    timestamp: result.timestamp,
    dryrun: result.dryrun ?? dryrun,
  };
}

// ── Certificate Inspection (public API: getCertInfo, getKeyInfo) ──────────────

export async function getCertificateInfo(certPem) {
  const n42mod = await n42();
  return n42mod.getCertInfo(certPem);
}

export async function getKeyInfo(keyPem) {
  const n42mod = await n42();
  return n42mod.getKeyInfo(keyPem);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeParticipantId(id) {
  if (!id?.includes('::')) return `iso6523-actorid-upis::${id || ''}`;
  return id;
}
