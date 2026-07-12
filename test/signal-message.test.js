/**
 * Signal Message Dispatch — Ticket #22
 *
 * Tests that handleIncomingMessage correctly dispatches on message type:
 * - eb:SignalMessage/eb:Receipt  → status = 'receipt_received'
 * - eb:SignalMessage/eb:Error    → status = 'error'
 * - eb:UserMessage               → existing invoice handling (status = 'received')
 *
 * Also tests that signals referencing unknown message IDs are logged but don't throw.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sampleInvoiceData } from './fixtures.js';
import { generateInvoice } from '../src/ubl/generator.js';
import { buildAS4Message, parseAS4Message, buildAS4Error, EbMSErrorCodes } from '../src/as4/message.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { buildInboundAS4Message } from '../src/simulator.js';
import * as apCore from '../src/index.js';
import { resetMockStores } from '../src/store/mock.js';

const { enableSimulation, handleIncomingMessage } = apCore;

// ── Helpers to build AS4 signal messages ─────────────────────────────────────────

/**
 * Build a minimal AS4 MIME multipart containing only a SOAP signal envelope
 * (no payload attachment — signals like Receipt/Error don't carry UBL).
 */
function buildAS4SignalMime({ soapEnvelope, messageId = 'signal-msg-001@test.ap' }) {
  const boundary = 'MIME-Boundary-AS4-Signal';
  return [
    `--${boundary}`,
    'Content-Type: application/xop+xml; charset=UTF-8; type="application/soap+xml"',
    `Content-ID: <root.0@as4.test>\r\n`,
    soapEnvelope,
    `\r\n--${boundary}--\r\n`,
  ].join('\n');
}

/**
 * Build a Receipt SignalMessage SOAP envelope.
 */
function buildReceiptSignalSoap({ receiptMessageId, refMessageId, timestamp }) {
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
          <eb:RefToMessageId>${refMessageId}</eb:RefToMessageId>
        </eb:Receipt>
      </eb:SignalMessage>
    </eb:Messaging>
  </soap:Header>
  <soap:Body/>
</soap:Envelope>`;
}

/**
 * Build an Error SignalMessage SOAP envelope.
 */
function buildErrorSignalSoap({ errorMessageId, refMessageId, timestamp, code, message }) {
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
          <eb:MessageId>${errorMessageId}</eb:MessageId>
        </eb:MessageInfo>
        <eb:Error category="urn:oasis-open:ebxml-msg:ebms:errors" code="${code}" >
          <eb:ErrorCode>${code}</eb:ErrorCode>
          <eb:Severity>failure</eb:Severity>
          <eb:Description>${message}</eb:Description>
          <eb:RefToMessageId>${refMessageId}</eb:RefToMessageId>
        </eb:Error>
      </eb:SignalMessage>
    </eb:Messaging>
  </soap:Header>
  <soap:Body/>
</soap:Envelope>`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe('Signal Message Dispatch — Ticket #22', () => {
  beforeEach(() => {
    enableSimulation();
    resetMockStores();
  });

  // ── 1. Receipt Signal ──────────────────────────────────────────────────────────

  describe('eb:SignalMessage/eb:Receipt', () => {
    it('should update transaction status to receipt_received when receiving a Receipt signal', async () => {
      // First, send an invoice so a transaction exists to be acknowledged
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const receiptMsgId = `receipt-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildReceiptSignalSoap({
        receiptMessageId: receiptMsgId,
        refMessageId: sentMessageId,
        timestamp,
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: receiptMsgId });

      // Act
      const result = await handleIncomingMessage(mimeMessage);

      // Assert
      expect(result.messageId).toBe(receiptMsgId);

      // Verify transaction was updated
      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.status).toBe('receipt_received');
      expect(tx.receipt).toBeDefined();
      expect(typeof tx.receipt).toBe('string');
    });

    it('should store the receipt XML in the transaction', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const receiptMsgId = `receipt-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildReceiptSignalSoap({
        receiptMessageId: receiptMsgId,
        refMessageId: sentMessageId,
        timestamp,
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: receiptMsgId });
      await handleIncomingMessage(mimeMessage);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.receipt).toContain('<eb:Receipt>');
      expect(tx.receipt).toContain('<eb:RefToMessageId>');
    });

    it('should not try to validate the receipt as a UBL invoice', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const receiptMsgId = `receipt-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildReceiptSignalSoap({
        receiptMessageId: receiptMsgId,
        refMessageId: sentMessageId,
        timestamp,
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: receiptMsgId });

      // Should not throw even though receipt XML is not a valid UBL invoice
      const result = await handleIncomingMessage(mimeMessage);
      expect(result.messageId).toBe(receiptMsgId);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.status).toBe('receipt_received');
    });
  });

  // ── 2. Error Signal ─────────────────────────────────────────────────────────────

  describe('eb:SignalMessage/eb:Error', () => {
    it('should update transaction status to error when receiving an Error signal', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const errorMsgId = `error-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildErrorSignalSoap({
        errorMessageId: errorMsgId,
        refMessageId: sentMessageId,
        timestamp,
        code: EbMSErrorCodes.EB001_MESSAGE_STRUCTURE,
        message: 'Message structure validation failed',
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: errorMsgId });

      // Act
      const result = await handleIncomingMessage(mimeMessage);

      // Assert
      expect(result.messageId).toBe(errorMsgId);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.status).toBe('error');
      expect(tx.error).toBeDefined();
      expect(tx.error).toContain('EB:001');
    });

    it('should store the error details in the transaction', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const errorMsgId = `error-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildErrorSignalSoap({
        errorMessageId: errorMsgId,
        refMessageId: sentMessageId,
        timestamp,
        code: EbMSErrorCodes.EB002_REQUIRED_FIELD_MISSING,
        message: 'Required field SenderID is missing',
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: errorMsgId });
      await handleIncomingMessage(mimeMessage);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.error).toContain('EB:002');
      expect(tx.error).toContain('Required field SenderID is missing');
    });

    it('should map ebMS 3.0 error codes correctly', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const errorMsgId = `error-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildErrorSignalSoap({
        errorMessageId: errorMsgId,
        refMessageId: sentMessageId,
        timestamp,
        code: EbMSErrorCodes.EB006_DECRYPTION_ERROR,
        message: 'Decryption failed',
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: errorMsgId });
      await handleIncomingMessage(mimeMessage);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.error).toContain('EB:006');
    });
  });

  // ── 3. Unknown message ID ───────────────────────────────────────────────────────

  describe('Signal referencing unknown message ID', () => {
    it('should log a warning but not throw when signal references an unknown message ID', async () => {
      const unknownMsgId = 'uuid:unknown-message-id@unknown.ap';
      const receiptMsgId = `receipt-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildReceiptSignalSoap({
        receiptMessageId: receiptMsgId,
        refMessageId: unknownMsgId,
        timestamp,
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: receiptMsgId });

      // Act & assert: should not throw
      const result = await handleIncomingMessage(mimeMessage);
      expect(result.messageId).toBe(receiptMsgId);
      expect(result.status).toBe('warning'); // signal received but tx not found
    });

    it('should still return a valid result structure when message ID is unknown', async () => {
      const unknownMsgId = 'uuid:completely-unknown@test';
      const errorMsgId = `error-${Date.now()}@ap.mojafaktura.sk`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildErrorSignalSoap({
        errorMessageId: errorMsgId,
        refMessageId: unknownMsgId,
        timestamp,
        code: EbMSErrorCodes.EB001_MESSAGE_STRUCTURE,
        message: 'Test error',
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: errorMsgId });

      const result = await handleIncomingMessage(mimeMessage);
      expect(result).toHaveProperty('messageId');
      expect(result).toHaveProperty('status');
    });
  });

  // ── 4. UserMessage unchanged ───────────────────────────────────────────────────

  describe('eb:UserMessage (existing invoice handling)', () => {
    it('should still process UserMessage as an invoice/creditnote', async () => {
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      expect(result.status).toBe('received');
      expect(result.mdnReceipt).toBeDefined();
      expect(result.mdnReceipt).toContain('<eb:Receipt>');
    });

    it('should return validationErrors when UserMessage UBL is invalid', async () => {
      const badInvoice = generateInvoice({ ...sampleInvoiceData, invoiceTypeCode: '999' });
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: badInvoice,
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      expect(result.status).toBe('error');
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });
  });

  // ── 5. Simulation mode ─────────────────────────────────────────────────────────

  describe('Simulation mode signal dispatch', () => {
    it('should dispatch ReceiptSignal correctly in simulation mode', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const receiptMsgId = `receipt-sim-${Date.now()}@sim.local`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildReceiptSignalSoap({
        receiptMessageId: receiptMsgId,
        refMessageId: sentMessageId,
        timestamp,
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: receiptMsgId });

      const result = await handleIncomingMessage(mimeMessage);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.status).toBe('receipt_received');
      expect(result.status).toBeDefined();
    });

    it('should dispatch ErrorSignal correctly in simulation mode', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sendResult = await apCore.sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      const sentMessageId = sendResult.messageId;
      const errorMsgId = `error-sim-${Date.now()}@sim.local`;
      const timestamp = new Date().toISOString();

      const soapEnvelope = buildErrorSignalSoap({
        errorMessageId: errorMsgId,
        refMessageId: sentMessageId,
        timestamp,
        code: EbMSErrorCodes.EB004_UNSUPPORTED_ACTION,
        message: 'Unsupported action in simulation',
      });

      const mimeMessage = buildAS4SignalMime({ soapEnvelope, messageId: errorMsgId });

      await handleIncomingMessage(mimeMessage);

      const tx = await apCore.getStatus(sentMessageId);
      expect(tx.status).toBe('error');
      expect(tx.error).toContain('EB:004');
    });
  });

  // ── 6. Regression: Ticket #01 ─────────────────────────────────────────────────

  describe('Regression: Ticket #01 handleIncomingMessage simulation baseline', () => {
    it('should still return messageId, status=received, and non-empty XML mdnReceipt for UserMessage', async () => {
      const { as4Message } = await buildInboundAS4Message({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: generateInvoice(sampleInvoiceData),
        senderApId: 'POP000999',
        documentType: 'invoice',
      });

      const result = await handleIncomingMessage(as4Message);

      expect(result.messageId).toBeDefined();
      expect(result.status).toBe('received');
      expect(result.mdnReceipt).toBeDefined();
      expect(result.mdnReceipt).toMatch(/<\?xml|<\w+/);
    });
  });
});
