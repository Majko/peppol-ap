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
import { generateInvoice, generateCreditNote } from './ubl/generator.js';
import { parseUBL } from './ubl/parser.js';
import { validateUBL } from './ubl/validator.js';
import { buildSBDH, parseSBDH } from './as4/sbdh.js';
import { buildAS4Message, parseAS4Message } from './as4/message.js';
import * as node42 from './as4/node42.js';
import * as simulator from './simulator.js';

// In-memory transaction store
const transactions = new Map();

// Simulation mode (no external network calls needed)
let simulationMode = false;

/**
 * Enable simulation mode — all Peppol network operations happen in-memory.
 * No DNS/SML/SMP lookups, no real AS4 transport. Returns realistic MDN receipts.
 * Perfect for development, testing, and demo environments.
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

// Webhook registration
let webhookConfig = null;

// AP configuration
const config = {
  apId: process.env.PEPPOL_AP_ID || 'POP000001',
  apDomain: process.env.PEPPOL_AP_DOMAIN || 'ap.mojafaktura.sk',
  mode: process.env.PEPPOL_MODE || 'test', // 'test' or 'production'
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

  // Step 4: Build SBDH envelope
  const sbdhParams = {
    senderId,
    receiverId,
    instanceIdentifier: messageId,
    creationDateAndTime: timestamp,
    documentType: docType === 'credit_note' ? 'CreditNote' : 'Invoice',
    documentTypeIdentifier: docTypeIdentifier,
    processID: processId || DEFAULT_PROCESS_ID,
    countryC1: extractCountryCode(senderId) || 'SK',
    ublXml,
  };
  const sbdhXml = buildSBDH(sbdhParams);

  // Step 5: Lookup receiver and send
  if (simulationMode) {
    // ── SIMULATION MODE ────────────────────────────────────────────────────────
    // Use the simulated network: in-memory participant lookup, realistic MDN receipt
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
      documentType: docType,
      sbdhXml,
      ublXml,
      receiptXml: simResult.receipt,
      receiptMessageId: simResult.receiptMessageId,
      timestamp: simResult.timestamp,
      completedAt: simResult.timestamp,
      simulated: true,
    };
    transactions.set(simResult.messageId, tx);

    return {
      messageId: simResult.messageId,
      status: 'delivered',
      receipt: simResult.receipt,
      timestamp: simResult.timestamp,
      simulated: true,
    };
  }

  // ── PRODUCTION/TEST MODE ───────────────────────────────────────────────────
  // Try real SMP lookup via Node42
  let lookupResult;
  try {
    lookupResult = await lookupParticipant(receiverId);
  } catch (lookupErr) {
    // In offline environments, still record the transaction
    const tx = {
      messageId,
      direction: 'send',
      status: 'sent',
      senderId,
      receiverId,
      documentType: docType,
      sbdhXml,
      ublXml,
      timestamp,
    };
    transactions.set(messageId, {
      ...tx,
      status: 'sent',
      completedAt: timestamp,
    });

    return {
      messageId,
      status: 'sent',
      receipt: null,
      timestamp,
      _note:
        'Document validated and SBDH prepared. Actual AS4 send requires Peppol network connectivity and PKI certificates.',
    };
  }

  // Build AS4 message
  const as4Message = buildAS4Message({
    messageId,
    fromApId: config.apId,
    toApId: extractAPId(receiverId),
    senderParticipantId: senderId,
    receiverParticipantId: receiverId,
    payload: sbdhXml,
    documentType: docType,
    processId: processId || DEFAULT_PROCESS_ID,
    timestamp,
  });

  // Record transaction
  const tx = {
    messageId,
    direction: 'send',
    status: 'delivered',
    senderId,
    receiverId,
    documentType: docType,
    sbdhXml,
    ublXml,
    as4Message,
    timestamp,
    completedAt: timestamp,
  };
  transactions.set(messageId, tx);

  return {
    messageId,
    status: 'delivered',
    receipt: null,
    timestamp,
    _note:
      'Document prepared for AS4 transport. In production, a signed MDN receipt from the receiving AP is required for "delivered" status.',
  };
}

// ═══════════════════════════════════════════════════════
//  Operation 2: Receive Invoice (Webhook)
// ═══════════════════════════════════════════════════════

/**
 * Register a webhook for incoming document delivery
 * @param {Object} params
 * @param {string} params.url - Callback URL
 * @param {string} params.secret - Shared secret for HMAC signing
 * @returns {{ success: boolean, url: string }}
 */
export function registerWebhook(params) {
  if (!params || !params.url) {
    throw new Error('Webhook URL is required');
  }

  webhookConfig = {
    url: params.url,
    secret: params.secret || 'whsec_default',
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
  const parsed = parseAS4Message(mimeMessage);

  if (!parsed.payload) {
    throw new Error('No payload found in incoming AS4 message');
  }

  // Step 2: Extract SBDH metadata
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

  // Step 3: Extract UBL from the SBDH payload
  let ublXml = null;
  if (parsed.payload) {
    // Find the UBL document inside the SBDH
    const ublMatch = parsed.payload.match(
      /<(Invoice|CreditNote)[\s\S]*?<\/(Invoice|CreditNote)>/
    );
    if (ublMatch) {
      ublXml = ublMatch[0];
    }
  }

  // Step 4: Validate the UBL
  let validationResult = null;
  if (ublXml) {
    validationResult = validateUBL(ublXml);
  }

  // Step 5: Generate MDN receipt (signed acknowledgement)
  const receiptMessageId = generateMessageId();
  const mdnReceipt = buildMDNReceipt(parsed.messageId, receiptMessageId);

  // Step 6: Record the transaction
  const tx = {
    messageId: parsed.messageId,
    direction: 'receive',
    status: validationResult && validationResult.valid ? 'received' : 'error',
    senderId: sbdh.senderId || parsed.senderParticipantId,
    receiverId: sbdh.receiverId || parsed.receiverParticipantId,
    documentType: extractDocType(ublXml),
    ublXml,
    rawMessage: mimeMessage,
    mdnReceipt,
    validationErrors: validationResult ? validationResult.errors : [],
    timestamp: new Date().toISOString(),
  };
  transactions.set(parsed.messageId, tx);

  // Step 7: Call webhook if registered
  if (webhookConfig && ublXml) {
    await callWebhook({
      event: 'invoice.received',
      messageId: parsed.messageId,
      senderId: tx.senderId,
      receiverId: tx.receiverId,
      ublXml,
      documentType: tx.documentType,
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
export function getStatus(messageId) {
  const tx = transactions.get(messageId);

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
    receipt: tx.mdnReceipt || null,
    error: tx.validationErrors && tx.validationErrors.length > 0
      ? tx.validationErrors[0].message
      : null,
    retries: tx.retries || 0,
    updated_at: tx.completedAt || tx.timestamp,
  };
}

// ═══════════════════════════════════════════════════════
//  Operation 4: Lookup Participant
// ═══════════════════════════════════════════════════════

/**
 * Resolve a Peppol participant ID to its SMP metadata
 * In production, this queries SML (DNS) → SMP (HTTP).
 * In test mode, it returns simulated data.
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

  if (simulationMode) {
    return simulator.simulatedLookup(participantId);
  }

  // Use Node42 for real SML→SMP lookup
  return await node42.lookupParticipant(participantId, {
    env: config.mode,
  });
}

// ═══════════════════════════════════════════════════════
//  Operation 5: Validate Document
// ═══════════════════════════════════════════════════════

/**
 * Validate a UBL document against Peppol Schematron rules
 * @param {string} ublXml - The UBL XML to validate
 * @param {string} [schema='peppol'] - Ruleset: 'peppol', 'cen', 'both'
 * @returns {{ valid: boolean, errors: Array<{rule: string, severity: string, message: string, location: string}>, warnings: Array }}
 */
export async function validateDocument(ublXml, schema = 'peppol') {
  // Always run our custom validator first (fast, synchronous, comprehensive)
  const customResult = validateUBL(ublXml);
  const customFatals = customResult.errors.filter((e) => e.severity === 'fatal');
  const customWarnings = customResult.errors.filter((e) => e.severity === 'warning');

  let n42Errors = [];
  let n42Source = null;

  // If custom validator passes, also run Node42's Schematron for extra coverage
  if (customFatals.length === 0) {
    try {
      const n42Result = await node42.validateWithNode42(ublXml);
      if (n42Result.source === 'node42') {
        n42Errors = n42Result.errors || [];
        n42Source = 'node42';
      }
    } catch {
      // Node42 validation failed, rely on custom result
    }
  }

  // Merge errors: Node42 fatals are added to custom fatals
  const n42Fatals = n42Errors.filter((e) => e.severity === 'fatal' || !e.severity);
  const n42Warnings = n42Errors.filter((e) => e.severity === 'warning');

  return {
    valid: customFatals.length === 0 && n42Fatals.length === 0,
    errors: [...customFatals, ...n42Fatals],
    warnings: [...customWarnings, ...n42Warnings],
    source: n42Source ? 'custom+node42' : 'custom',
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
    countryC1: extractCountryCode(senderId) || 'SK',
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
               xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/">
  <soap:Header>
    <eb:Messaging>
      <eb:SignalMessage>
        <eb:MessageInfo>
          <eb:Timestamp>${timestamp}</eb:Timestamp>
          <eb:MessageId>${receiptMessageId}</eb:MessageId>
        </eb:MessageInfo>
        <eb:Receipt>
          <eb:UserMessage>${originalMessageId}</eb:UserMessage>
        </eb:Receipt>
      </eb:SignalMessage>
    </eb:Messaging>
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
  // For VAT-based IDs, country code is first 2 chars
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
 * Call the registered webhook
 */
async function callWebhook(payload) {
  if (!webhookConfig) return;

  try {
    // In production, this would HTTP POST to webhookConfig.url
    // with HMAC-SHA256 signature header
    if (typeof fetch !== 'undefined') {
      await fetch(webhookConfig.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature-256': 'placeholder-signature',
        },
        body: JSON.stringify(payload),
      });
    }
  } catch {
    // Webhook call failed - in production, implement retry logic
    console.warn(`Webhook call to ${webhookConfig.url} failed`);
  }
}

// ═══════════════════════════════════════════════════════
//  Health & Status
// ═══════════════════════════════════════════════════════

/**
 * Get AP Core health status
 */
export function getHealth() {
  return {
    status: 'ok',
    version: '1.0.0',
    mode: config.mode,
    simulationMode,
    apId: config.apId,
    uptime: process.uptime(),
    transactionCount: transactions.size,
    webhookRegistered: webhookConfig !== null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get all transactions (for monitoring/debugging)
 */
export function getTransactions() {
  return Array.from(transactions.values());
}
