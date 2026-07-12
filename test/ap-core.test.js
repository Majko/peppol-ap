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
    it('should return status for a known message ID', async () => {
      // First send a document to create a transaction
      const ublXml = generateInvoice(sampleInvoiceData);

      const sendResult = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      // Now get status using the messageId from the result
      const statusResult = await getStatus(sendResult.messageId);
      expect(statusResult.messageId).toBe(sendResult.messageId);
      expect(statusResult.status).toBeDefined();
    });

    it('should return failed for an unknown message ID', async () => {
      const result = await getStatus('non-existent-message-id');

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
    it('should return health status', async () => {
      const health = await getHealth();

      expect(health.status).toMatch(/^(ok|warning)$/);
      expect(health.version).toBe('1.0.0');
      expect(health.apId).toBeDefined();
    });
  });
});

// ── Production AS4 Send Path Tests ─────────────────────────────────────────────────

import { resetMockStores, seedMockCert } from '../src/store/mock.js';
import { CertExpiredError, CertNotFoundError } from '../src/errors.js';
import * as node42 from '../src/as4/node42.js';

describe('Production AS4 Send Path', () => {
  // Each test starts fresh
  beforeEach(() => {
    resetMockStores();
    // Ensure production mode (not simulation) for these tests
    apCore.disableSimulation();
  });

  afterEach(() => {
    // Restore simulation for other test suites
    apCore.enableSimulation();
  });

  describe('sendInvoice — certificate loading', () => {
    it('should throw CertNotFoundError when no active cert is in the identity store', async () => {
      // Simulation is disabled and no cert is seeded — production path tries identityStore.getActiveCert()
      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('cert_not_found');
      expect(result.details[0].message).toBe('No active certificate found in identity store');
    });

    it('should throw CertExpiredError when the active cert has expired', async () => {
      // Seed a cert that expired yesterday
      const expiredCert = {
        certId: 'expired-cert-001',
        certPem: '-----BEGIN CERTIFICATE-----\nEXPIREDCERT\n-----END CERTIFICATE-----',
        privKeyPem: '[REDACTED PRIVATE KEY]',
        isActive: true,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // expired 1 day ago
      };
      const { identityStore: store } = apCore._getStores?.() || {};
      if (store) await store.storeCert(expiredCert);

      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('cert_expired');
      expect(result.details[0].message).toContain('expired at');
    });

    it('should pass cert to node42.sendViaNode42 when a valid active cert exists', async () => {
      // Seed a valid (non-expired) cert
      const validCert = {
        certId: 'valid-cert-001',
        certPem: '-----BEGIN CERTIFICATE-----\nVALIDCERT\n-----END CERTIFICATE-----',
        privKeyPem: '-----BEGIN PRIVATE KEY-----\nVALIDKEY\n-----END PRIVATE KEY-----',
        isActive: true,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // valid for 1 year
      };
      const { identityStore: store } = apCore._getStores?.() || {};
      if (store) await store.storeCert(validCert);

      // Spy on node42.sendViaNode42 to verify it receives correct params
      const originalSend = node42.sendViaNode42;
      const spy = vi.spyOn(node42, 'sendViaNode42').mockImplementation(async () => ({
        messageId: 'mock-msg-id',
        status: 'sent',
        receipt: null,
        timestamp: new Date().toISOString(),
        dryrun: false,
      }));

      const ublXml = generateInvoice(sampleInvoiceData);

      const result = await sendInvoice({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      });

      expect(spy).toHaveBeenCalledOnce();
      const [sbdhXml, opts] = spy.mock.lastCall;
      expect(opts.certPem).toBe(validCert.certPem);
      expect(opts.keyPem).toBe(validCert.privKeyPem);
      expect(opts.certId).toBe(validCert.certId);
      expect(opts.expiresAt).toBe(validCert.expiresAt);
      expect(opts.dryrun).toBe(false); // AP_CORE_DRY_RUN defaults to false
      expect(result.status).toBe('sent');
      expect(result.messageId).toBe('mock-msg-id');

      spy.mockRestore();
    });
  });
});
