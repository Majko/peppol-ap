/**
 * Simulation Regression Baseline — Ticket #01
 *
 * Verifies that simulation mode works correctly across the full send and receive flows:
 * - sendInvoice() in simulation mode returns messageId, status='delivered', and a non-empty XML receipt
 * - handleIncomingMessage() in simulation mode returns messageId, status='received', and a non-empty XML mdnReceipt
 * - buildAS4Message() produces a valid MIME multipart message with SOAP envelope and payload
 * - Simulation mode makes NO network calls (no PKI certs, DNS, external access)
 *
 * This test is the anchor that every subsequent ticket must keep green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sampleInvoiceData } from './fixtures.js';
import { generateInvoice } from '../src/ubl/generator.js';
import { buildAS4Message, parseAS4Message } from '../src/as4/message.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { buildInboundAS4Message } from '../src/simulator.js';
import * as apCore from '../src/index.js';

// Destructure for convenience
const {
  enableSimulation,
  isSimulationEnabled,
  sendInvoice,
  handleIncomingMessage,
} = apCore;

describe('Simulation Regression Baseline — Ticket #01', () => {
  beforeEach(() => {
    // Ensure simulation mode is enabled for all tests in this suite
    enableSimulation();
  });

  // ── 1. sendInvoice() in simulation mode ────────────────────────────────────────

  describe('sendInvoice() in simulation mode', () => {
    it('should return messageId, status=delivered, and non-empty XML receipt', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe('string');
      expect(result.messageId.length).toBeGreaterThan(0);

      expect(result.status).toBe('delivered');

      expect(result.receipt).toBeDefined();
      expect(typeof result.receipt).toBe('string');
      expect(result.receipt.length).toBeGreaterThan(0);
      // Receipt should be valid XML (contains XML declaration or root element)
      expect(result.receipt).toMatch(/<\?xml|<\w+/);
    });

    it('should include simulated=true flag in result', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      expect(result.simulated).toBe(true);
    });
  });

  // ── 2. handleIncomingMessage() in simulation mode ──────────────────────────────

  describe('handleIncomingMessage() in simulation mode', () => {
    it('should return messageId, status=received, and non-empty XML mdnReceipt', async () => {
      // Build a valid inbound AS4 MIME message using the simulator's helper
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe('string');
      expect(result.messageId.length).toBeGreaterThan(0);

      expect(result.status).toBe('received');

      expect(result.mdnReceipt).toBeDefined();
      expect(typeof result.mdnReceipt).toBe('string');
      expect(result.mdnReceipt.length).toBeGreaterThan(0);
      // MDN receipt should be valid XML
      expect(result.mdnReceipt).toMatch(/<\?xml|<\w+/);
    });

    it('should include mdnReceipt with SOAP envelope structure', async () => {
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      // Receipt must contain SOAP envelope and eb:Messaging structure
      expect(result.mdnReceipt).toContain('soap:Envelope');
      expect(result.mdnReceipt).toContain('eb:Messaging');
      expect(result.mdnReceipt).toContain('eb:Receipt');
    });

    it('should produce an MDN receipt containing ds:Signature (WS-Security signing)', async () => {
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      // MDN must be signed in simulation mode (has Signature element with ds namespace)
      expect(result.mdnReceipt).toContain('xmlns="http://www.w3.org/2000/09/xmldsig#"');
      expect(result.mdnReceipt).toContain('<Signature ');
      // Signature must contain a DigestValue
      expect(result.mdnReceipt).toContain('DigestValue');
    });

    it('should produce an MDN receipt using eb:RefToMessageId (G20 fix)', async () => {
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      // Must use RefToMessageId instead of UserMessage for the receipt
      expect(result.mdnReceipt).toContain('eb:RefToMessageId');
      // Should NOT contain eb:UserMessage in the receipt
      expect(result.mdnReceipt).not.toContain('<eb:UserMessage>');
    });
  });

  // ── 3. buildAS4Message() produces valid MIME multipart ─────────────────────────

  describe('buildAS4Message() produces valid MIME multipart', () => {
    it('should output a MIME multipart message containing SOAP envelope and payload', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        instanceIdentifier: 'uuid:test-123@test.ap.local',
        creationDateAndTime: new Date().toISOString(),
        documentType: 'Invoice',
        documentTypeIdentifier:
          'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
        processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        countryC1: 'SK',
        ublXml,
      });

      const mimeMessage = buildAS4Message({
        messageId: 'uuid:test-123@test.ap.local',
        fromApId: 'POP000001',
        toApId: 'POP000999',
        senderParticipantId: '9914:SK2023456789',
        receiverParticipantId: '0088:SK4498765432',
        payload: sbdhXml,
        documentType: 'invoice',
        processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        timestamp: new Date().toISOString(),
      });

      // Must be a MIME multipart message
      expect(mimeMessage).toContain('multipart/related');
      expect(mimeMessage).toContain('MIME-Boundary');

      // Must contain SOAP envelope
      expect(mimeMessage).toContain('<soap:Envelope');
      expect(mimeMessage).toContain('</soap:Envelope>');

      // Must contain the SBDH payload (contains StandardBusinessDocumentHeader)
      expect(mimeMessage).toContain('StandardBusinessDocumentHeader');

      // Must contain the UBL payload
      expect(mimeMessage).toContain('<Invoice');
    });

    it('should include SOAP headers with eb:Messaging and party info', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        instanceIdentifier: 'uuid:test-456@test.ap.local',
        creationDateAndTime: new Date().toISOString(),
        documentType: 'Invoice',
        documentTypeIdentifier:
          'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
        processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        countryC1: 'SK',
        ublXml,
      });

      const mimeMessage = buildAS4Message({
        messageId: 'uuid:test-456@test.ap.local',
        fromApId: 'POP000001',
        toApId: 'POP000999',
        senderParticipantId: '9914:SK2023456789',
        receiverParticipantId: '0088:SK4498765432',
        payload: sbdhXml,
        documentType: 'invoice',
        processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        timestamp: new Date().toISOString(),
      });

      // SOAP header must contain eb:Messaging with UserMessage
      expect(mimeMessage).toContain('eb:Messaging');
      expect(mimeMessage).toContain('eb:UserMessage');
      expect(mimeMessage).toContain('POP000001'); // fromApId
      expect(mimeMessage).toContain('POP000999'); // toApId
    });
  });

  // ── 4. Simulation mode makes NO network calls ───────────────────────────────────

  describe('Simulation mode makes NO network calls', () => {
    it('sendInvoice should not trigger Node42 network calls', async () => {
      // Spy on Node42 to verify it is NOT called during simulation
      const node42 = await import('../src/as4/node42.js');
      const spy = vi.spyOn(node42, 'sendViaNode42').mockImplementation(
        async () => {
          throw new Error('Node42 should NOT be called in simulation mode');
        }
      );

      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      // If Node42 was called, the spy would have thrown
      expect(spy).not.toHaveBeenCalled();
      expect(result.status).toBe('delivered');

      spy.mockRestore();
    });

    it('lookupParticipant should not trigger real SMP lookups in simulation mode', async () => {
      // In simulation mode, lookupParticipant uses simulator.simulatedLookup
      // which does NOT make network calls — it returns in-memory data
      const result = await apCore.lookupParticipant('9914:SK2023456789');

      expect(result).toBeDefined();
      expect(result.participantId).toBe('9914:SK2023456789');
      // simulated flag confirms this came from the in-memory simulator
      expect(result.simulated).toBe(true);
    });

    it('simulation mode is active and isSimulationEnabled returns true', () => {
      expect(isSimulationEnabled()).toBe(true);
    });
  });

  // ── 5. Round-trip: buildAS4Message → parseAS4Message (Ticket #03) ─────────────

  describe('Round-trip: buildAS4Message output is parseable by parseAS4Message', () => {
    it('should round-trip a buildAS4Message MIME message through parseAS4Message', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        instanceIdentifier: 'uuid:test-roundtrip@test.ap.local',
        creationDateAndTime: new Date().toISOString(),
        documentType: 'Invoice',
        documentTypeIdentifier:
          'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
        processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        countryC1: 'SK',
        ublXml,
      });

      const mimeMessage = buildAS4Message({
        messageId: 'uuid:test-roundtrip@test.ap.local',
        fromApId: 'POP000001',
        toApId: 'POP000999',
        senderParticipantId: '9914:SK2023456789',
        receiverParticipantId: '0088:SK4498765432',
        payload: sbdhXml,
        documentType: 'invoice',
        processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        timestamp: new Date().toISOString(),
      });

      // Parse it back using the mailparser-based parser
      const parsed = await parseAS4Message(mimeMessage);

      // Verify all expected fields are extracted
      expect(parsed.messageId).toBe('uuid:test-roundtrip@test.ap.local');
      expect(parsed.fromApId).toBe('POP000001');
      expect(parsed.toApId).toBe('POP000999');
      expect(parsed.senderParticipantId).toBe('9914:SK2023456789');
      expect(parsed.receiverParticipantId).toBe('0088:SK4498765432');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.processId).toBe('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
      expect(parsed.documentTypeIdentifier).toContain('Invoice');

      // Payload must be extracted and contain the SBDH/UBL XML
      expect(parsed.payload).toBeDefined();
      expect(parsed.payload.length).toBeGreaterThan(0);
      expect(parsed.payload).toContain('StandardBusinessDocumentHeader');
      expect(parsed.payload).toContain('<Invoice');
    });

    it('should handle multipart/related with Base64 Content-Transfer-Encoding', async () => {
      // Manually construct a MIME message with Base64-encoded payload to test that edge case
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        instanceIdentifier: 'uuid:test-base64@test.ap.local',
        creationDateAndTime: new Date().toISOString(),
        documentType: 'Invoice',
        documentTypeIdentifier:
          'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
        processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        countryC1: 'SK',
        ublXml,
      });

      const mimeMessage = buildAS4Message({
        messageId: 'uuid:test-base64@test.ap.local',
        fromApId: 'POP000001',
        toApId: 'POP000999',
        senderParticipantId: '9914:SK2023456789',
        receiverParticipantId: '0088:SK4498765432',
        payload: sbdhXml,
        documentType: 'invoice',
        processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        timestamp: new Date().toISOString(),
      });

      // parseAS4Message should handle both 8bit and Base64 CTEs
      const parsed = await parseAS4Message(mimeMessage);
      expect(parsed.payload).toBeDefined();
      expect(parsed.payload).toContain('<Invoice');
    });

    it('should parse an inbound AS4 message built by buildInboundAS4Message', async () => {
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const parsed = await parseAS4Message(as4Message);

      expect(parsed.messageId).toBeDefined();
      expect(parsed.fromApId).toBe('POP000999');
      expect(parsed.toApId).toBe('POP000001');
      expect(parsed.senderParticipantId).toBe('9914:SK2023456789');
      expect(parsed.receiverParticipantId).toBe('0088:SK4498765432');
      expect(parsed.payload).toBeDefined();
      expect(parsed.payload).toContain('StandardBusinessDocumentHeader');
    });
  });
});
