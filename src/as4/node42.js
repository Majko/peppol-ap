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
 * Requires valid Peppol PKI certificates in ~/.node42/certs/.
 *
 * When PKI certs are in place, this replaces our entire custom send pipeline.
 * Until then, use the simulator or our custom buildAS4Message for development.
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

  for (const [name, p] of [['Certificate', cert], ['Private key', key], ['Truststore', truststore]]) {
    if (!fs.existsSync(p)) {
      throw new Error(`${name} not found at ${p}. Run 'n42-edelivery init' first.`);
    }
  }

  const n42mod = await n42();
  const ctx = new n42mod.N42Context({
    cert, key,
    truststore: fs.readFileSync(truststore, 'utf-8'),
    env, dryrun,
    timeout: 20000,
    verbose: opts.verbose || false,
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
    dryrun: result.dryrun || false,
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
