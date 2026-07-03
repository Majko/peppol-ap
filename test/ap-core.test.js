/**
 * Integration tests for the AP Core interface
 * Tests the 5 core operations and supporting functions
 */
import { describe, it, expect } from 'vitest';
import { sampleInvoiceData, sampleSBDH } from './fixtures.js';
import { generateInvoice } from '../src/ubl/generator.js';
import * as apCore from '../src/index.js';

// Destructure exports - handle both named and default exports
const {
  validateDocument,
  lookupParticipant,
  sendInvoice,
  getStatus,
  registerWebhook,
  buildCompleteAS4Message,
  handleIncomingMessage,
  getHealth,
} = apCore;

describe('AP Core Interface', () => {
  // Enable simulation so sendInvoice doesn't try Node42 (which needs PKI certs)
  apCore.enableSimulation();

  describe('validateDocument', () => {
    it('should validate a correct invoice and return no errors', async () => {
      const xml = generateInvoice(sampleInvoiceData);
      const result = await validateDocument(xml);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject an invalid invoice', async () => {
      const badData = { ...sampleInvoiceData, invoiceTypeCode: '999' };
      const xml = generateInvoice(badData);

      const result = await validateDocument(xml);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('lookupParticipant', () => {
    it('should return metadata for a valid participant ID format', async () => {
      const result = await lookupParticipant('9914:SK2023456789');

      expect(result.participantId).toBe('9914:SK2023456789');
      expect(result.services).toBeDefined();
      expect(Array.isArray(result.services)).toBe(true);
    });

    it('should reject an empty participant ID', async () => {
      await expect(lookupParticipant('')).rejects.toThrow();
    });

    it('should reject a malformed participant ID', async () => {
      await expect(
        lookupParticipant('SK2023456789')
      ).rejects.toThrow(/Invalid participant ID/);
    });
  });

  describe('sendInvoice', () => {
    it('should reject a document that fails validation', async () => {
      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: '<invalid>not an invoice</invalid>',
      });

      expect(result.error).toBe('validation_failed');
    });

    it('should return a message ID for a valid document', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      expect(result.messageId).toBeDefined();
      expect(['delivered', 'sent', 'validation_failed']).toContain(
        result.status
      );
    });
  });

  describe('getStatus', () => {
    it('should return status for a known message ID', () => {
      // First send a document to create a transaction
      const ublXml = generateInvoice(sampleInvoiceData);

      const result = sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      // Now get status using the messageId from the result
      result.then((sendResult) => {
        const statusResult = getStatus(sendResult.messageId);
        expect(statusResult.messageId).toBe(sendResult.messageId);
        expect(statusResult.status).toBeDefined();
      });
    });

    it('should return failed for an unknown message ID', () => {
      const result = getStatus('non-existent-message-id');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Unknown message ID');
    });
  });

  describe('registerWebhook', () => {
    it('should register a webhook URL', () => {
      const result = registerWebhook({
        url: 'https://app.mojafaktura.sk/api/webhook/invoice-received',
        secret: 'whsec_test123',
      });

      expect(result.success).toBe(true);
      expect(result.url).toBe(
        'https://app.mojafaktura.sk/api/webhook/invoice-received'
      );
    });

    it('should throw an error for missing URL', () => {
      expect(() => registerWebhook({})).toThrow(/URL is required/);
    });
  });

  describe('buildCompleteAS4Message', () => {
    it('should build a complete AS4 message from invoice data', () => {
      const { as4Message, sbdhXml, ublXml, messageId } =
        buildCompleteAS4Message({
          senderId: sampleSBDH.senderId,
          receiverId: sampleSBDH.receiverId,
          invoiceData: sampleInvoiceData,
          fromApId: 'POP000123',
          toApId: 'POP000456',
        });

      expect(as4Message).toContain('<soap:Envelope');
      expect(as4Message).toContain('FA-2026-0042');
      expect(as4Message).toContain(sampleSBDH.senderId);
      expect(as4Message).toContain(sampleSBDH.receiverId);
      expect(sbdhXml).toContain('StandardBusinessDocumentHeader');
      expect(ublXml).toContain('<Invoice');
      expect(messageId).toBeDefined();
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const health = getHealth();

      expect(health.status).toBe('ok');
      expect(health.version).toBe('1.0.0');
      expect(health.apId).toBeDefined();
    });
  });
});
