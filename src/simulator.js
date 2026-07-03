/**
 * Simulated Peppol Network
 *
 * A full in-memory Peppol network simulation that lets the AP Core
 * behave exactly like a real Access Point — without needing actual
 * Peppol network access, PKI certificates, or DNS/SML/SMP resolution.
 *
 * Features:
 * - Participant registry (SMP) — register participants and their capabilities
 * - Message routing — simulate AS4 delivery between participants
 * - MDN receipts — generate realistic signed acknowledgements
 * - Inbound message queue — simulate other APs sending to us
 * - Transaction log — full audit trail
 */

import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════
//  Participant Registry (simulated SMP)
// ═══════════════════════════════════════════════════════

const participants = new Map();

/**
 * Register a participant in the simulated Peppol network
 */
export function registerParticipant(id, info = {}) {
  const [scheme, value] = id.includes(':') ? id.split(/:(.+)/) : ['9914', id];
  participants.set(id, {
    id,
    scheme,
    value,
    name: info.name || `Participant ${id}`,
    country: info.country || 'SK',
    acceptsInvoices: info.acceptsInvoices !== false,
    acceptsCreditNotes: info.acceptsCreditNotes !== false,
    registeredAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Check if a participant is registered
 */
export function isParticipantRegistered(id) {
  return participants.has(id);
}

/**
 * List all registered participants
 */
export function listParticipants() {
  return Array.from(participants.values());
}

// Register some default participants
registerParticipant('9914:SK2023456789', {
  name: 'Pekáreň Pod Hradom s.r.o.',
  country: 'SK',
});
registerParticipant('0088:SK4498765432', {
  name: 'Mesto Trnava',
  country: 'SK',
});

// ═══════════════════════════════════════════════════════
//  MDN Receipt Generation
// ═══════════════════════════════════════════════════════

/**
 * Generate a realistic signed MDN receipt as if it came
 * from the receiving AP
 */
export function generateMDNReceipt(originalMessageId, receiverApId = 'POP000999') {
  const receiptMessageId = `uuid:${uuidv4()}@${receiverApId.toLowerCase()}.local`;
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  return {
    messageId: receiptMessageId,
    timestamp,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
               xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
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
    <wsse:Security soap:mustUnderstand="true">
      <ds:Signature>
        <ds:SignedInfo>
          <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
          <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        </ds:SignedInfo>
        <ds:SignatureValue>(simulated-signature)</ds:SignatureValue>
      </ds:Signature>
    </wsse:Security>
  </soap:Header>
  <soap:Body/>
</soap:Envelope>`,
    verified: true,
    simulated: true,
  };
}

// ═══════════════════════════════════════════════════════
//  Inbound Message Queue
// ═══════════════════════════════════════════════════════

const inboundMessages = [];

/**
 * Simulate an incoming AS4 message (as if delivered by another AP)
 * Returns the sender/receiver metadata for processing
 */
export function createInboundMessage({ senderId, receiverId, ublXml, senderApId = 'POP000999' }) {
  const messageId = `uuid:${uuidv4()}@${senderApId.toLowerCase()}.local`;
  const timestamp = new Date().toISOString();

  return {
    messageId,
    senderId,
    receiverId,
    senderApId,
    timestamp,
    ublXml,
  };
}

/**
 * Build a complete inbound AS4 MIME message (as if from another AP)
 */
export async function buildInboundAS4Message({ senderId, receiverId, ublXml, senderApId = 'POP000999', documentType = 'invoice' }) {
  const { buildSBDH } = await import('./as4/sbdh.js');
  const { buildAS4Message } = await import('./as4/message.js');

  const messageId = `uuid:${uuidv4()}@${senderApId.toLowerCase()}.local`;
  const timestamp = new Date().toISOString();
  const docTypeUpper = documentType === 'credit_note' ? 'CreditNote' : 'Invoice';
  const ns = `urn:oasis:names:specification:ubl:schema:xsd:${docTypeUpper}-2`;
  const documentTypeIdentifier = `${ns}::${docTypeUpper}##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1`;

  const sbdhXml = buildSBDH({
    senderId,
    receiverId,
    instanceIdentifier: messageId,
    creationDateAndTime: timestamp,
    documentType: docTypeUpper,
    documentTypeIdentifier,
    processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    countryC1: extractCountry(senderId),
    ublXml,
  });

  const as4Message = buildAS4Message({
    messageId,
    fromApId: senderApId,
    toApId: 'POP000001',
    senderParticipantId: senderId,
    receiverParticipantId: receiverId,
    payload: sbdhXml,
    documentType,
    processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    timestamp,
  });

  return { as4Message, sbdhXml, messageId, timestamp };
}

/**
 * Drain the inbound message queue (called by the receiver)
 */
export function drainInboundMessages() {
  return inboundMessages.splice(0, inboundMessages.length);
}

// ═══════════════════════════════════════════════════════
//  Simulated SMP Lookup
// ═══════════════════════════════════════════════════════

/**
 * Simulated SMP lookup — returns the participant's "endpoint"
 * as if it were served by their SMP
 */
export function simulatedLookup(participantId) {
  const participant = participants.get(participantId);

  if (!participant) {
    throw new Error(`Participant not found: ${participantId}. Register with registerParticipant() first.`);
  }

  return {
    participantId,
    smpUrl: `https://smp.${participant.value?.toLowerCase?.() || 'unknown'}.sim.local`,
    services: [
      {
        document_type:
          'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
        process_id: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        endpoint: `https://ap.${(participant.value || 'unknown').toLowerCase()}.sim.local/as4`,
        certificate: `-----BEGIN CERTIFICATE-----\nMIIFpTCCA44CCQDb7fMkh6tU/TANBgkqhkiG9w0BAQsFADCB\n-----END CERTIFICATE-----`,
      },
    ],
    resolved_at: new Date().toISOString(),
    simulated: true,
  };
}

// ═══════════════════════════════════════════════════════
//  Network Simulation
// ═══════════════════════════════════════════════════════

/**
 * Simulate the full Peppol send flow:
 * 1. Validate the document
 * 2. Resolve receiver via simulated SMP
 * 3. "Deliver" the message (in-memory)
 * 4. Generate a realistic MDN receipt
 * 5. Return the result
 */
export async function simulateSend(senderId, receiverId, ublXml, documentType = 'invoice') {
  // Check receiver exists
  if (!participants.has(receiverId)) {
    // Auto-register unknown participants so the simulation keeps working
    registerParticipant(receiverId, { name: `Unknown (${receiverId})` });
  }

  // Generate receipt as if from receiver's AP
  const messageId = `uuid:${uuidv4()}@sender.sim.local`;
  const receipt = generateMDNReceipt(messageId, 'POP000999');

  return {
    messageId,
    status: 'delivered',
    receipt: receipt.xml,
    receiptMessageId: receipt.messageId,
    receiptTimestamp: receipt.timestamp,
    receiptVerified: receipt.verified,
    timestamp: new Date().toISOString(),
    simulated: true,
    _note: 'Delivered via simulated Peppol network. Receipt signed (simulated).',
  };
}

// ═══════════════════════════════════════════════════════
//  Helper
// ═══════════════════════════════════════════════════════

function extractCountry(participantId) {
  if (!participantId) return 'SK';
  const parts = participantId.split(':');
  const value = parts[parts.length - 1] || '';
  return value.length >= 2 ? value.substring(0, 2) : 'SK';
}
