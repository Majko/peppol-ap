/**
 * AP Core - Main Interface
 *
 * The certified Peppol transport layer.
 * Exposes the 5 core operations from the AP Core Interface spec:
 * 1. sendInvoice       - Push UBL to Peppol network
 * 2. receiveWebhook    - Receive incoming documents
 * 3. getStatus         - Check delivery status
 * 4. lookupParticipant - Resolve participant via SMP
 * 5. validateDocument  - Schematron validation
 * + buildAS4Message    - Build AS4 message (for testing/sending)
 * + registerWebhook    - Set webhook callback
 */

import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'node:crypto';
import { generateInvoice, generateCreditNote } from './ubl/generator.js';
import { parseUBL } from './ubl/parser.js';
import { validateUBL } from './ubl/validator.js';
import { buildSBDH, parseSBDH } from './as4/sbdh.js';
import { buildAS4Message, parseAS4Message, verifyIncomingSignature, buildAS4Error, signXml, getSimSigningKeyPath } from './as4/message.js';
import { decryptPayload, isEncrypted } from './as4/encryption.js';
import * as node42 from './as4/node42.js';
import * as simulator from './simulator.js';
import { createStore } from './store/factory.js';
import { RetryableError, NonRetryableError, classifySendError } from './errors.js';
import {
  recordTransaction,
  recordTransactionDuration,
  recordSmpLookup,
  recordWebhookFired,
  recordWebhookFailure,
} from './middleware/metrics.js';
import { CertExpiredError, CertNotFoundError, TrustChainValidationError } from './errors.js';

// ── Store initialisation ────────────────────────────────────────────────────────
// Default: mock adapter (zero-config for development and tests)
// Set PEPPOL_STORE_ADAPTER=sqlite and AP_CORE_DB_PATH to use SQLite

const STORE_ADAPTER = process.env.PEPPOL_STORE_ADAPTER || 'mock';
const STORE_DB_PATH  = process.env.AP_CORE_DB_PATH;

/** @type {{ transactionStore: TransactionStore, smpCache: SMPCache, identityStore: APIdentityStore }} */
let stores = createStore(STORE_ADAPTER, { dbPath: STORE_DB_PATH });

/** Allow tests to inject real stores. @internal */
export function _setStores(newStores) {
  stores = newStores;
}

/** Allow tests to read the current stores. @internal */
export function _getStores() {
  return stores;
}

const { transactionStore, smpCache, identityStore } = stores;

import {
  enableSimulation,
  disableSimulation,
  isSimulationEnabled,
} from './simulation.js';
import { simulationMode } from './simulation.js';
export {
  enableSimulation,
  disableSimulation,
  isSimulationEnabled,
  simulationMode,
} from './simulation.js';

// Webhook registration
let webhookConfig = null;

// AP configuration
const config = {
  apId: process.env.PEPPOL_AP_ID || 'POP000001',
  apDomain: process.env.PEPPOL_AP_DOMAIN || 'ap.mojafaktura.sk',
  mode: process.env.PEPPOL_MODE || 'test', // 'test' or 'production'
  dryrun: process.env.AP_CORE_DRY_RUN === 'true',
  truststorePath: process.env.AP_CORE_TRUSTSTORE_PATH || null,
};

// Default Peppol process ID
const DEFAULT_PROCESS_ID =
  'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

/**
 * Get the document type identifier for SBDH
 */
function getDocTypeIdentifier(data, docType) {
  const type =
    docType === 'credit_note' || docType === 'CreditNote' || (data && data.isCreditNote)
      ? 'CreditNote'
      : 'Invoice';
  const ns = `urn:oasis:names:specification:ubl:schema:xsd:${type}-2`;
  return `${ns}::${type}##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1`;
}

/**
 * Generate a Peppol message ID
 */
function generateMessageId() {
  return `uuid:${uuidv4()}@${config.apDomain}`;
}

// ── For backwards-compatible health endpoint (tx count) ──────────────────────────
let _txCount = 0;

// ═══════════════════════════════════════════════════════
//  Operation 1: Send Invoice
// ═══════════════════════════════════════════════════════

/**
 * Send a UBL invoice to a receiver on the Peppol network
 * @param {Object} params
 * @param {string} params.senderId - Sender Peppol participant ID (e.g. "9914:SK2023456789")
 * @param {string} params.receiverId - Receiver Peppol participant ID
 * @param {string} params.ublXml - The UBL XML document
 * @param {string} [params.documentType] - 'invoice' or 'credit_note' (auto-detected if omitted)
 * @param {string} [params.processId] - Peppol process ID
 * @returns {Promise<{messageId: string, status: string, receipt: string|null, timestamp: string}>}
 */
export async function sendInvoice(params) {
  const { senderId, receiverId, ublXml, documentType, processId } = params;
  const timestamp = new Date().toISOString();
  const _startTime = Date.now();

  // Step 1: Validate the UBL XML
  const validation = validateUBL(ublXml);
  if (!validation.valid) {
    return {
      error: 'validation_failed',
      details: validation.errors,
    };
  }

  // Step 2: Determine document type
  let docType = documentType;
  if (!docType) {
    try {
      const parsed = parseUBL(ublXml);
      docType = parsed.isCreditNote ? 'credit_note' : 'invoice';
    } catch {
      docType = 'invoice';
    }
  }

  // Step 3: Generate message ID
  const messageId = generateMessageId();
  const docTypeIdentifier = getDocTypeIdentifier({}, docType);

  // Step 4: Extract seller country from UBL XML for countryC1
  let sellerCountry = 'SK';
  try {
    const parsedForCountry = parseUBL(ublXml);
    sellerCountry = parsedForCountry.seller?.countryCode || 'SK';
  } catch {
    // Keep SK as default
  }

  // Step 5: Build SBDH envelope
  const sbdhParams = {
    senderId,
    receiverId,
    instanceIdentifier: messageId,
    creationDateAndTime: timestamp,
    documentType: docType === 'credit_note' ? 'CreditNote' : 'Invoice',
    documentTypeIdentifier: docTypeIdentifier,
    processID: processId || DEFAULT_PROCESS_ID,
    countryC1: sellerCountry,
    ublXml,
  };
  const sbdhXml = buildSBDH(sbdhParams);

  // Step 6: Lookup receiver and send
  if (simulationMode) {
    // ── SIMULATION MODE ────────────────────────────────────────────────────────
    const simResult = await simulator.simulateSend(
      senderId,
      receiverId,
      ublXml,
      docType
    );

    const tx = {
      messageId: simResult.messageId,
      direction: 'send',
      status: 'delivered',
      senderId,
      receiverId,
      docTypeId: docType,
      sbdhXml,
      ublXml,
      receiptXml: simResult.receipt,
      timestamp: simResult.timestamp,
      completedAt: simResult.timestamp,
    };
    await transactionStore.save(tx);
    _txCount++;
    recordTransaction('send', 'delivered');
    recordTransactionDuration((Date.now() - _startTime) / 1000);

    return {
      messageId: simResult.messageId,
      status: 'delivered',
      receipt: simResult.receipt,
      timestamp: simResult.timestamp,
      simulated: true,
    };
  }

  // ── PRODUCTION MODE ── use Node42's public sendDocument() ────────────────────
  try {
    // Step 5a: Load active cert from identity store
    const activeCert = await identityStore.getActiveCert();
    if (!activeCert) {
      throw new CertNotFoundError();
    }

    // Step 5b: Check cert expiry
    if (activeCert.expiresAt) {
      const expiry = new Date(activeCert.expiresAt);
      if (expiry <= new Date()) {
        throw new CertExpiredError(activeCert.certId, activeCert.expiresAt);
      }
    }

    // Step 5c: Soft-fail CRL/OCSP check (simulation only)
    // If the certificate has CRL or OCSP endpoints, check them.
    // Soft-fail: if unavailable, log a warning but allow the send to proceed.
    if (simulationMode && activeCert.crlUrl) {
      try {
        const { simCheckCRL } = await import('./simulation.js');
        const crlResult = await simCheckCRL(activeCert.crlUrl);
        if (!crlResult.ok) {
          console.warn(`[CRL] Check failed for ${activeCert.crlUrl}: ${crlResult.reason}`);
        }
      } catch {
        // soft-fail — allow send to proceed
      }
    }
    if (simulationMode && activeCert.ocspUrl) {
      try {
        const { simCheckOCSP } = await import('./simulation.js');
        const ocspResult = await simCheckOCSP(activeCert.ocspUrl);
        if (!ocspResult.ok) {
          console.warn(`[OCSP] Check failed for ${activeCert.ocspUrl}: ${ocspResult.reason}`);
        }
      } catch {
        // soft-fail — allow send to proceed
      }
    }

    const result = await node42.sendViaNode42(sbdhXml, {
      certPem: activeCert.certPem,
      keyPem: activeCert.privKeyPem,
      truststorePath: config.truststorePath || undefined,
      certId: activeCert.certId,
      expiresAt: activeCert.expiresAt,
      env: config.mode,
      dryrun: config.dryrun,
    });

    const tx = {
      messageId: result.messageId,
      direction: 'send',
      status: result.status,
      senderId,
      receiverId,
      docTypeId: docType,
      sbdhXml,
      ublXml,
      receiptXml: result.receipt || null,
      timestamp,
      completedAt: result.timestamp || timestamp,
    };
    await transactionStore.save(tx);
    _txCount++;
    recordTransaction('send', result.status);
    recordTransactionDuration((Date.now() - _startTime) / 1000);

    return {
      messageId: result.messageId,
      status: result.status,
      receipt: result.receipt || null,
      timestamp: result.timestamp || timestamp,
    };
  } catch (err) {
    if (err instanceof CertNotFoundError || err instanceof CertExpiredError) {
      // Cert errors — record as error immediately (no pending/retry)
      const tx = {
        messageId,
        direction: 'send',
        status: 'error',
        senderId,
        receiverId,
        docTypeId: docType,
        sbdhXml,
        ublXml,
        timestamp,
        errorMessage: err.message,
      };
      await transactionStore.save(tx);
      _txCount++;
      recordTransaction('send', 'error');
      recordTransactionDuration((Date.now() - _startTime) / 1000);

      return {
        messageId,
        status: 'error',
        receipt: null,
        timestamp,
        error: err.name === 'CertExpiredError' ? 'cert_expired' : 'cert_not_found',
        details: [{ message: err.message }],
      };
    }

    // Node42 send failed — classify as retryable or non-retryable
    const classified = classifySendError(err);
    const tx = {
      messageId,
      direction: 'send',
      status: 'error',
      senderId,
      receiverId,
      docTypeId: docType,
      sbdhXml,
      ublXml,
      timestamp,
      errorMessage: err.message,
    };
    await transactionStore.save(tx);
    _txCount++;
    recordTransaction('send', 'error');
    recordTransactionDuration((Date.now() - _startTime) / 1000);

    return {
      messageId,
      status: 'error',
      receipt: null,
      timestamp,
      error: classified.code,
      details: [{ message: err.message, retryable: classified instanceof RetryableError }],
    };
  }
}

// ═══════════════════════════════════════════════════════
//  Operation 2: Receive Invoice (Webhook)
// ═══════════════════════════════════════════════════════

/**
 * Register a webhook for incoming document delivery
 * @param {Object} params
 * @param {string} params.url - Callback URL
 * @param {string} [params.secret] - Shared secret for HMAC signing
 * @returns {{ success: boolean, url: string }}
 */
export function registerWebhook(params) {
  if (!params || !params.url) {
    throw new Error('Webhook URL is required');
  }

  webhookConfig = {
    url: params.url,
    secret: params.secret || null,
    registeredAt: new Date().toISOString(),
  };

  return {
    success: true,
    url: webhookConfig.url,
  };
}

/**
 * Handle an incoming AS4 message from another AP
 * This is called when another AP sends a message to our endpoint
 * @param {string} mimeMessage - The raw MIME multipart message
 * @returns {Promise<{ messageId: string, senderId: string, receiverId: string, status: string }>}
 */
export async function handleIncomingMessage(mimeMessage) {
  // Step 1: Parse the AS4 message
  const parsed = await parseAS4Message(mimeMessage);

  // ── Step 1b: Signal message dispatch (ReceiptSignal / ErrorSignal) ──────────
  // Signal messages carry no UBL payload — dispatch them without UBL pipeline
  if (parsed.signalType === 'SignalMessage') {
    const refMsgId = parsed.refMessageId || null;

    // Determine signal subtype from XML content
    const hasReceipt = /<eb:Receipt[\s\S]*?<\/eb:Receipt>/.test(parsed.rawSoap || '');
    const hasError = /<eb:Error[\s\S]*?<\/eb:Error>/.test(parsed.rawSoap || '');

    if (hasReceipt) {
      // ReceiptSignal: update the referenced transaction to receipt_received
      let txFound = false;
      if (refMsgId) {
        try {
          const tx = await transactionStore.get(refMsgId);
          if (tx) {
            tx.status = 'receipt_received';
            tx.receiptXml = parsed.rawSoap;
            await transactionStore.save(tx);
            txFound = true;
          } else {
            console.warn(`ReceiptSignal references unknown messageId: ${refMsgId}`);
          }
        } catch (err) {
          console.error('Failed to store ReceiptSignal:', err.message);
        }
      }
      return {
        messageId: parsed.messageId || refMsgId,
        status: txFound ? 'signal_received' : 'warning',
        signalType: 'Receipt',
        refMessageId: refMsgId,
      };
    }

    if (hasError) {
      // ErrorSignal: extract ebMS error details and update the transaction
      const ebErrAttrMatch = parsed.rawSoap?.match(/<eb:Error[^>]*\bcode="([^"]*)"[^>]*>/);
      const ebErrTagMatch = parsed.rawSoap?.match(/<eb:Error[^>]*>([\s\S]*?)<\/eb:Error>/);
      const ebmsCode = ebErrAttrMatch?.[1] || ebErrTagMatch?.[1] || 'EB:000';
      const ebErrTextMatch = parsed.rawSoap?.match(/<eb:Description[^>]*>([\s\S]*?)<\/eb:Description>/);
      const ebmsMessage = ebErrTextMatch?.[1]?.trim() || null;

      let txFound = false;
      if (refMsgId) {
        try {
          const tx = await transactionStore.get(refMsgId);
          if (tx) {
            tx.status = 'error';
            tx.errorMessage = ebmsMessage ? `[${ebmsCode}] ${ebmsMessage}` : `[${ebmsCode}]`;
            await transactionStore.save(tx);
            txFound = true;
          } else {
            console.warn(`ErrorSignal references unknown messageId: ${refMsgId}`);
          }
        } catch (err) {
          console.error('Failed to store ErrorSignal:', err.message);
        }
      }
      return {
        messageId: parsed.messageId || refMsgId,
        status: txFound ? 'signal_received' : 'warning',
        signalType: 'Error',
        refMessageId: refMsgId,
        ebmsCode,
        ebmsMessage,
      };
    }

    // Unknown signal type — log and return gracefully
    console.warn('Unknown SignalMessage type received:', parsed.rawSoap?.substring(0, 200));
    return {
      messageId: parsed.messageId || refMsgId,
      status: 'warning',
      signalType: 'Unknown',
      refMessageId: refMsgId,
    };
  }

  if (!parsed.payload) {
    throw new Error('No payload found in incoming AS4 message');
  }

  // Step 2: Decrypt xenc:EncryptedData in the SOAP body (skip in simulation mode)
  if (parsed.rawSoap && isEncrypted(parsed.rawSoap)) {
    let decryptionKey = null;
    if (simulationMode) {
      // In simulation mode, decryption is bypassed — encrypted payloads are
      // treated as already-decrypted test fixtures
      // No-op: the encrypted element is left as-is
    } else {
      // Production: retrieve the receiving AP's private key from the identity store
      try {
        decryptionKey = await identityStore.getDecryptionKey();
      } catch (err) {
        const de = new Error(`Failed to retrieve decryption key: ${err.message}`);
        de.code = 'DECRYPTION_ERROR';
        throw de;
      }

      if (!decryptionKey) {
        const de = new Error('No decryption key available — no active certificate in identity store');
        de.code = 'DECRYPTION_ERROR';
        throw de;
      }

      try {
        parsed.rawSoap = await decryptPayload(parsed.rawSoap, decryptionKey);
      } catch (err) {
        const de = new Error(`Payload decryption failed: ${err.message}`);
        de.code = 'DECRYPTION_ERROR';
        throw de;
      }
    }
  }

  // Step 3: Verify WS-Security signature (skip in simulation mode)
  if (parsed.rawSoap) {
    try {
      const sigResult = await verifyIncomingSignature(parsed.rawSoap, parsed.senderParticipantId);
      if (!sigResult.valid) {
        const err = new Error(`Incoming message signature verification failed: ${sigResult.error}`);
        err.code = 'INVALID_SIGNATURE';
        throw err;
      }
    } catch (err) {
      if (err instanceof TrustChainValidationError) {
        // Map to AS4 ebMS error code: EB:005 = cert expired, EB:003 = not in PKI
        const ebmsCode = err.reason === 'expired' ? 'EB:005' : 'EB:003';
        const ebErr = new Error(`Trust chain validation failed: ${err.message}`);
        ebErr.code = ebmsCode;
        ebErr.ebmsReason = err.reason;
        ebErr.ebmsSignal = 'Error';
        throw ebErr;
      }
      throw err;
    }
  }

  // Step 4: Extract SBDH metadata
  let sbdh;
  try {
    sbdh = parseSBDH(parsed.payload);
  } catch {
    // If no SBDH, try parsing the payload directly as UBL
    sbdh = {
      senderId: parsed.senderParticipantId,
      receiverId: parsed.receiverParticipantId,
    };
  }

  // Step 5: Extract UBL from the SBDH payload
  let ublXml = null;
  if (parsed.payload) {
    // Match the XML declaration (optional) followed by the Invoice or CreditNote root element
    const ublMatch = parsed.payload.match(
      /(<\?xml[^?]*\?>\s*)?<(Invoice|CreditNote)[\s\S]*?<\/(Invoice|CreditNote)>/,
    );
    if (ublMatch) {
      ublXml = ublMatch[0];
    }
  }

  // Step 6: Validate the UBL (validate the extracted UBL, not the SBDH wrapper)
  let validationResult = null;
  if (ublXml) {
    validationResult = validateUBL(ublXml);
  }

  // Step 7: Generate MDN receipt (signed acknowledgement)
  const receiptMessageId = generateMessageId();
  let mdnReceipt = buildMDNReceipt(parsed.messageId, receiptMessageId);

  // Sign the MDN in simulation mode using the sim signing key
  if (simulationMode) {
    const simKeyPath = getSimSigningKeyPath();
    if (simKeyPath) {
      try {
        mdnReceipt = signXml(mdnReceipt, simKeyPath);
      } catch (err) {
        console.error('MDN signing failed (simulation):', err.message);
      }
    }
  } else {
    // Production: sign with receiving AP's private key from identity store
    try {
      const signingKey = identityStore?.getSigningKey?.();
      if (signingKey) {
        // identityStore returns { privateKey, certificate } — signXml needs a key path
        // For now, if identityStore has getSigningKeyPath(), use it
        const keyPath = identityStore?.getSigningKeyPath?.();
        if (keyPath) {
          mdnReceipt = signXml(mdnReceipt, keyPath);
        }
      }
    } catch (err) {
      console.error('MDN signing failed (production):', err.message);
    }
  }

  // Step 8: Record the transaction
  const tx = {
    messageId: parsed.messageId,
    direction: 'receive',
    status: validationResult && validationResult.valid ? 'received' : 'error',
    senderId: sbdh.senderId || parsed.senderParticipantId,
    receiverId: sbdh.receiverId || parsed.receiverParticipantId,
    docTypeId: extractDocType(ublXml),
    ublXml,
    receiptXml: mdnReceipt,
    timestamp: new Date().toISOString(),
    errorMessage: validationResult && !validationResult.valid
      ? validationResult.errors.map(e => e.message).join('; ')
      : null,
  };
  await transactionStore.save(tx);
  _txCount++;
  recordTransaction('receive', tx.status);

  // Step 9: Call webhook if registered
  if (webhookConfig && ublXml) {
    await callWebhook({
      event: 'invoice.received',
      messageId: parsed.messageId,
      senderId: tx.senderId,
      receiverId: tx.receiverId,
      ublXml,
      documentType: tx.docTypeId,
      receivedAt: tx.timestamp,
    });
  }

  return {
    messageId: parsed.messageId,
    senderId: tx.senderId,
    receiverId: tx.receiverId,
    status: tx.status,
    mdnReceipt,
    validationErrors: validationResult ? validationResult.errors : [],
  };
}

// ═══════════════════════════════════════════════════════
//  Operation 3: Get Status
// ═══════════════════════════════════════════════════════

/**
 * Get the delivery status of a previously sent message
 * @param {string} messageId
 * @returns {{ messageId: string, status: string, receipt: string|null, error: string|null, retries: number, updated_at: string }}
 */
export async function getStatus(messageId) {
  const tx = await transactionStore.get(messageId);

  if (!tx) {
    return {
      messageId,
      status: 'failed',
      receipt: null,
      error: 'Unknown message ID',
      retries: 0,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    messageId: tx.messageId,
    status: tx.status,
    receipt: tx.receiptXml || null,
    error: tx.errorMessage || null,
    retries: tx.retries || 0,
    updated_at: tx.completedAt || tx.timestamp,
  };
}

// ═══════════════════════════════════════════════════════
//  Operation 4: Lookup Participant
// ═══════════════════════════════════════════════════════

/**
 * Resolve a Peppol participant ID to its SMP metadata.
 * In simulation mode, returns simulated data.
 * In production, queries SML → SMP via Node42.
 *
 * Result is cached in SMPCache for TTL seconds to avoid redundant lookups.
 *
 * @param {string} participantId - e.g. "9914:SK2023456789"
 * @returns {Promise<{ participantId: string, smpUrl: string, services: Array }>}
 */
export async function lookupParticipant(participantId) {
  if (!participantId) {
    throw new Error('Participant ID is required');
  }

  // Validate format
  if (!participantId.includes(':')) {
    throw new Error(
      `Invalid participant ID format: "${participantId}". Expected format like "9914:SK2023456789"`
    );
  }

  const [scheme, value] = participantId.split(':');
  if (!scheme || !value) {
    throw new Error(
      `Invalid participant ID: "${participantId}". Both scheme and value required.`
    );
  }

  // Check SMP cache first
  const cached = await smpCache.get(participantId);
  if (cached) {
    recordSmpLookup('hit');
    return cached;
  }

  if (simulationMode) {
    const result = simulator.simulatedLookup(participantId);
    validateSMPDates(result);
    // Cache the result (TTL 5 min in simulation)
    await smpCache.set(participantId, result, 300);
    recordSmpLookup('miss');
    return result;
  }

  // Use Node42 for real SML→SMP lookup
  try {
    const result = await node42.lookupParticipant(participantId, {
      env: config.mode,
    });
    validateSMPDates(result);
    // Cache result (TTL 10 min in production)
    await smpCache.set(participantId, result, 600);
    recordSmpLookup('miss');
    return result;
  } catch (err) {
    recordSmpLookup('error');
    throw err;
  }
}

/**
 * Validate SMP ServiceActivationDate and ServiceExpirationDate.
 * Throws NonRetryableError if the participant's SMP entry is not yet active
 * or has expired.
 * @param {{ ServiceActivationDate?: string, ServiceExpirationDate?: string, participantId: string }} smpResult
 */
function validateSMPDates(smpResult) {
  const now = new Date();

  if (smpResult.ServiceActivationDate) {
    const activationDate = new Date(smpResult.ServiceActivationDate);
    if (now < activationDate) {
      const err = new NonRetryableError(
        `Participant ${smpResult.participantId} SMP entry is not yet active (ServiceActivationDate: ${smpResult.ServiceActivationDate})`,
        'SMP_NOT_ACTIVE'
      );
      console.warn(`[SMP] ${err.message}`);
      throw err;
    }
  }

  if (smpResult.ServiceExpirationDate) {
    const expirationDate = new Date(smpResult.ServiceExpirationDate);
    if (now > expirationDate) {
      const err = new NonRetryableError(
        `Participant ${smpResult.participantId} SMP entry has expired (ServiceExpirationDate: ${smpResult.ServiceExpirationDate})`,
        'SMP_EXPIRED'
      );
      console.warn(`[SMP] ${err.message}`);
      throw err;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Operation 5: Validate Document
// ═══════════════════════════════════════════════════════

/**
 * Validate a UBL document against Peppol BIS Billing 3.0 rules.
 * Uses our comprehensive custom validator (15 rules covering mandatory fields,
 * cross-field math, VAT category/rate consistency, and code lists).
 *
 * Node42's Schematron validation is intentionally NOT used here —
 * validateDocument is not part of Node42's public API and would break
 * on upgrade. Our validator is independently maintained.
 *
 * @param {string} ublXml - The UBL XML to validate
 * @returns {{ valid: boolean, errors: Array, warnings: Array, source: string }}
 */
export function validateDocument(ublXml) {
  const result = validateUBL(ublXml);
  const warnings = result.errors.filter((e) => e.severity === 'warning');
  const fatals = result.errors.filter((e) => e.severity === 'fatal');

  return {
    valid: fatals.length === 0,
    errors: fatals,
    warnings,
    source: 'custom',
  };
}

// ═══════════════════════════════════════════════════════
//  Helper: Build AS4 Message
// ═══════════════════════════════════════════════════════

/**
 * Build a complete AS4 message from invoice data
 * (Convenience function combining UBL generation, SBDH wrapping, and AS4 message building)
 */
export function buildCompleteAS4Message({
  senderId,
  receiverId,
  invoiceData,
  fromApId = config.apId,
  toApId = 'POP000999',
  documentType = 'invoice',
  processId = DEFAULT_PROCESS_ID,
}) {
  // Generate UBL
  const ublXml =
    documentType === 'credit_note' || documentType === 'CreditNote'
      ? generateCreditNote(invoiceData)
      : generateInvoice(invoiceData);

  const messageId = generateMessageId();
  const timestamp = new Date().toISOString();
  const docTypeUpper =
    documentType === 'credit_note' || documentType === 'CreditNote'
      ? 'CreditNote'
      : 'Invoice';
  const docTypeIdentifier = getDocTypeIdentifier({}, documentType);

  // Build SBDH
  const sbdhXml = buildSBDH({
    senderId,
    receiverId,
    instanceIdentifier: messageId,
    creationDateAndTime: timestamp,
    documentType: docTypeUpper,
    documentTypeIdentifier: docTypeIdentifier,
    processID: processId,
    countryC1: invoiceData.seller?.countryCode || 'SK',
    ublXml,
  });

  // Build AS4 message
  const as4Message = buildAS4Message({
    messageId,
    fromApId,
    toApId,
    senderParticipantId: senderId,
    receiverParticipantId: receiverId,
    payload: sbdhXml,
    documentType,
    processId,
    timestamp,
    signingKeyPath: simulationMode ? getSimSigningKeyPath() : undefined,
  });

  return { as4Message, sbdhXml, ublXml, messageId };
}

// ═══════════════════════════════════════════════════════
//  Internal Helpers
// ═══════════════════════════════════════════════════════

/**
 * Build an MDN receipt (Message Disposition Notification)
 */
function buildMDNReceipt(originalMessageId, receiptMessageId) {
  const timestamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
               xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
               xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <soap:Header>
    <eb:Messaging>
      <eb:SignalMessage>
        <eb:MessageInfo>
          <eb:Timestamp>${timestamp}</eb:Timestamp>
          <eb:MessageId>${receiptMessageId}</eb:MessageId>
        </eb:MessageInfo>
        <eb:Receipt>
          <eb:RefToMessageId>${originalMessageId}</eb:RefToMessageId>
        </eb:Receipt>
      </eb:SignalMessage>
    </eb:Messaging>
    <wsse:Security soap:mustUnderstand="true"/>
  </soap:Header>
  <soap:Body/>
</soap:Envelope>`;
}

/**
 * Extract country code from a participant ID like "9914:SK2023456789"
 */
function extractCountryCode(participantId) {
  if (!participantId) return null;
  const parts = participantId.split(':');
  if (parts.length < 2) return null;
  const value = parts[1];
  if (value.length >= 2 && value === value.toUpperCase()) {
    return value.substring(0, 2);
  }
  return 'SK';
}

/**
 * Extract AP ID from a receiver participant ID (placeholder logic)
 */
function extractAPId(participantId) {
  // In production, this comes from SMP lookup
  return 'POP000999';
}

/**
 * Extract document type from UBL XML
 */
function extractDocType(ublXml) {
  if (!ublXml) return 'unknown';
  if (ublXml.includes('<CreditNote')) return 'credit_note';
  if (ublXml.includes('<Invoice')) return 'invoice';
  return 'unknown';
}

/**
 * Compute HMAC-SHA256 signature for webhook payload (Stripe/Svix-compatible scheme).
 *
 * Algorithm:
 *   signature = HMAC-SHA256(secret, body + timestamp)
 *   header value = "sha256=" + hex(signature)
 *
 * Verification (downstream responsibility):
 *   1. Read timestamp from X-Peppol-Timestamp header
 *   2. Reject if timestamp is older than 5 minutes (replay protection)
 *   3. Compute HMAC-SHA256(shared_secret, body + timestamp)
 *   4. Compare against X-Peppol-Signature value (constant-time comparison recommended)
 *   5. If match → payload is authentic
 *
 * @param {string} secret - Shared HMAC secret
 * @param {string} body - Raw JSON body string
 * @param {number} timestamp - Unix epoch seconds
 * @returns {string} Hex-encoded signature prefixed with "sha256="
 */
function computeHmac(secret, body, timestamp) {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  hmac.update(String(timestamp));
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Call the registered webhook with HMAC-SHA256 signature headers.
 *
 * Retry policy: up to 3 attempts with exponential backoff (5s, 15s, 45s).
 * Logs all delivery attempts. Does not throw on failure — failure is logged
 * but does not crash the caller.
 *
 * @param {Object} payload - Webhook event payload
 */
async function callWebhook(payload) {
  if (!webhookConfig) return;

  // Skip actual HTTP delivery in simulation/test mode — avoids retry delays
  // (5s + 15s + 45s backoff) when webhook URL is unreachable in test env.
  if (simulationMode || process.env.AP_CORE_DRY_RUN === 'true') {
    console.log(`[webhook] skipped delivery in simulation mode (url=${webhookConfig.url})`);
    recordWebhookFired();
    return;
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);

  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add HMAC signature headers when a secret is configured
  if (webhookConfig.secret) {
    headers['X-Peppol-Signature'] = computeHmac(webhookConfig.secret, body, timestamp);
    headers['X-Peppol-Timestamp'] = String(timestamp);
  }

  const maxAttempts = 3;
  const backoffMs = [5000, 15000, 45000]; // 5s, 15s, 45s

  recordWebhookFired();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (typeof fetch !== 'undefined') {
        const response = await fetch(webhookConfig.url, {
          method: 'POST',
          headers,
          body,
        });

        if (response.ok) {
          console.log(
            `[webhook] delivered successfully to ${webhookConfig.url} ` +
            `(attempt ${attempt}/${maxAttempts})`
          );
          return;
        }

        // Non-2xx — treat as delivery failure and retry
        console.warn(
          `[webhook] delivery to ${webhookConfig.url} returned HTTP ${response.status} ` +
          `(attempt ${attempt}/${maxAttempts})`
        );
      }
    } catch (err) {
      console.warn(
        `[webhook] call to ${webhookConfig.url} failed: ${err.message} ` +
        `(attempt ${attempt}/${maxAttempts})`
      );
    }

    // Retry with backoff (except on last attempt)
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt - 1]));
    }
  }

  // All retries exhausted
  console.error(
    `[webhook] all ${maxAttempts} delivery attempts to ${webhookConfig.url} failed. ` +
    `Payload: ${body}`
  );
  recordWebhookFailure();
}

// ═══════════════════════════════════════════════════════
//  Health & Status
// ═══════════════════════════════════════════════════════

/**
 * Get AP Core health status
 * @returns {Promise<Object>} Structured health with individual checks
 */
export async function getHealth() {
  const now = new Date().toISOString();

  // Storage check — list transactions to verify store is reachable
  let storageCheck;
  try {
    const txs = await transactionStore.list({ limit: 1 });
    storageCheck = { status: 'ok', message: `Store reachable (${txs.length} transactions)`, timestamp: now };
  } catch (err) {
    storageCheck = { status: 'error', message: `Store unreachable: ${err.message}`, timestamp: now };
  }

  // SMP cache check — verify cache is accessible
  let smpCheck;
  try {
    // Just verify the cache.get works (null return is fine, error means broken)
    await smpCache.get('__health_check__');
    smpCheck = { status: 'ok', message: 'SMP cache operational', timestamp: now };
  } catch (err) {
    smpCheck = { status: 'error', message: `SMP cache error: ${err.message}`, timestamp: now };
  }

  // Certificate store check
  let certCheck;
  try {
    const cert = await identityStore.getActiveCert();
    if (cert) {
      certCheck = { status: 'ok', message: `Active cert: ${cert.certId}`, timestamp: now };
    } else {
      certCheck = { status: 'warning', message: 'No active certificate configured', timestamp: now };
    }
  } catch (err) {
    certCheck = { status: 'error', message: `Cert store error: ${err.message}`, timestamp: now };
  }

  // Config check
  let configCheck;
  const requiredFields = ['apId', 'apDomain', 'mode'];
  const missing = requiredFields.filter(f => !config[f]);
  if (missing.length === 0) {
    configCheck = { status: 'ok', message: `AP ID: ${config.apId}, mode: ${config.mode}`, timestamp: now };
  } else {
    configCheck = { status: 'error', message: `Missing config fields: ${missing.join(', ')}`, timestamp: now };
  }

  // Overall status — worst check wins
  const checks = [storageCheck, smpCheck, certCheck, configCheck];
  const hasError = checks.some(c => c.status === 'error');
  const hasWarning = checks.some(c => c.status === 'warning');

  return {
    status: hasError ? 'error' : hasWarning ? 'warning' : 'ok',
    version: '1.0.0',
    mode: config.mode,
    simulationMode,
    apId: config.apId,
    uptime: process.uptime(),
    transactionCount: _txCount,
    webhookRegistered: webhookConfig !== null,
    timestamp: now,
    checks: {
      storage: storageCheck,
      smp: smpCheck,
      certificate: certCheck,
      config: configCheck,
    },
  };
}

/**
 * Get all transactions (for monitoring/debugging)
 */
export async function getTransactions() {
  return transactionStore.list({ limit: 1000 });
}
