/**
 * Tests for AS4 Message module
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildAS4Message, parseAS4Message, buildAS4Error, EbMSErrorCodes } from '../src/as4/message.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { generateInvoice } from '../src/ubl/generator.js';
import { sampleInvoiceData, sampleSBDH } from './fixtures.js';
import { resolve } from 'node:path';

const AP_ID = 'POP000123';
const RECEIVER_AP_ID = 'POP000456';
const MESSAGE_ID = `uuid:${randomUUID()}@ap.mojafaktura.sk`;
const SIM_KEY_PATH = resolve(process.cwd(), 'test/fixtures/keys/sim-signing-key.pem');

describe('AS4 Message', () => {
  describe('buildAS4Message', () => {
    it('should build a valid AS4 SOAP envelope', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
      });

      expect(message).toContain('<soap:Envelope');
      expect(message).toContain('</soap:Envelope>');
      expect(message).toContain('Content-Type: multipart/related');
      expect(message).toContain('--MIME-Boundary');
    });

    it('should include eb:Messaging header', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
      });

      expect(message).toContain('eb:Messaging');
      expect(message).toContain('eb:UserMessage');
      expect(message).toContain('eb:MessageInfo');
      expect(message).toContain('eb:PartyInfo');
      expect(message).toContain('eb:CollaborationInfo');
      expect(message).toContain('eb:PayloadInfo');
    });

    it('should include sender and receiver AP IDs', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
      });

      expect(message).toContain(AP_ID);
      expect(message).toContain(RECEIVER_AP_ID);
    });

    it('should include the payload SBDH as an attachment', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
      });

      // The payload should appear in the MIME attachment
      expect(message).toContain('FA-2026-0042');
      expect(message).toContain('Pekáreň Pod Hradom');
    });

    it('should include the AgreementRef', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
      });

      expect(message).toContain(
        'urn:fdc:peppol.eu:2017:agreements:tia:ap_provider'
      );
    });

    it('should include originalSender and finalRecipient properties', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
      });

      expect(message).toContain('originalSender');
      expect(message).toContain('finalRecipient');
      expect(message).toContain(sampleSBDH.senderId);
      expect(message).toContain(sampleSBDH.receiverId);
    });

    it('should produce a signed message with ds:Signature when signing key is provided', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
        signingKeyPath: SIM_KEY_PATH,
      });

      // Verify signature elements are present in the SOAP envelope
      expect(message).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
      expect(message).toContain('<SignedInfo>');
      expect(message).toContain('<SignatureValue>');
      expect(message).toContain('<DigestValue>');
      // RSA-SHA256 signature method
      expect(message).toContain('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
      // SHA-256 digest
      expect(message).toContain('http://www.w3.org/2001/04/xmlenc#sha256');
      // Exclusive C14N canonicalization
      expect(message).toContain('http://www.w3.org/2001/10/xml-exc-c14n#');
    });

    it('should be able to parse a signed message and extract fields', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

      const message = buildAS4Message({
        messageId: MESSAGE_ID,
        fromApId: AP_ID,
        toApId: RECEIVER_AP_ID,
        senderParticipantId: sampleSBDH.senderId,
        receiverParticipantId: sampleSBDH.receiverId,
        payload: sbdhXml,
        documentType: 'invoice',
        processId: sampleSBDH.processID,
        signingKeyPath: SIM_KEY_PATH,
      });

      const parsed = await parseAS4Message(message);

      expect(parsed.messageId).toBe(MESSAGE_ID);
      expect(parsed.fromApId).toBe(AP_ID);
      expect(parsed.toApId).toBe(RECEIVER_AP_ID);
      expect(parsed.senderParticipantId).toBe(sampleSBDH.senderId);
      expect(parsed.receiverParticipantId).toBe(sampleSBDH.receiverId);
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.payload).toBeTruthy();
      // The payload should contain the SBDH
      expect(parsed.payload).toContain('StandardBusinessDocumentHeader');
    });
  });

  describe('buildAS4Error', () => {
    it('should produce a valid eb:SignalMessage XML', () => {
      const xml = buildAS4Error(EbMSErrorCodes.EB001_MESSAGE_STRUCTURE, 'Test error');

      expect(xml).toContain('<soap:Envelope');
      expect(xml).toContain('</soap:Envelope>');
      expect(xml).toContain('<eb:Messaging');
      expect(xml).toContain('<eb:SignalMessage>');
      expect(xml).toContain('<eb:Error');
      expect(xml).toContain('<eb:Error'); // Error element present
      expect(xml).toMatch(/<eb:Error[^>]*code="EB:001"[^>]*>/); // code is in attribute
      expect(xml).toContain('<eb:Severity>failure</eb:Severity>');
      expect(xml).toContain('<eb:Description>Test error</eb:Description>');
    });

    it('should include RefToMessageId when provided', () => {
      const refMsgId = 'uuid:original-msg-id@ap.mojafaktura.sk';
      const xml = buildAS4Error(
        EbMSErrorCodes.EB002_REQUIRED_FIELD_MISSING,
        'Missing payload',
        null,
        refMsgId
      );

      expect(xml).toContain('<eb:RefToMessageId>');
      expect(xml).toContain(refMsgId);
    });

    it('should include details in Description when provided', () => {
      const xml = buildAS4Error(
        EbMSErrorCodes.EB003_VALUE_FORMAT,
        'Invalid format',
        'Expected ISO 8601 date but got: not-a-date'
      );

      expect(xml).toContain('Invalid format');
      expect(xml).toContain('Expected ISO 8601 date but got: not-a-date');
    });

    it('should produce EB:004 error for unsupported action', () => {
      const xml = buildAS4Error(EbMSErrorCodes.EB004_UNSUPPORTED_ACTION, 'Unsupported document type');

      expect(xml).toMatch(/<eb:Error[^>]*code="EB:004"[^>]*>/); // code is in attribute
    });

    it('should escape XML special characters in message and details', () => {
      const xml = buildAS4Error(
        EbMSErrorCodes.EB001_MESSAGE_STRUCTURE,
        'Error with <invalid> & "quotes"',
        'Detail with <script> tags'
      );

      expect(xml).toContain('&lt;invalid&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;quotes&quot;');
      expect(xml).toContain('&lt;script&gt;');
    });

    it('should include the error code attribute on eb:Error element', () => {
      const xml = buildAS4Error(EbMSErrorCodes.EB007_SIGNATURE_FAILED, 'Signature verification failed');

      // The code attribute on eb:Error
      expect(xml).toMatch(/<eb:Error[^>]*code="EB:007"/);
    });

    it('should produce a signed error signal with ds:Signature when signing key is provided', () => {
      const xml = buildAS4Error(
        EbMSErrorCodes.EB001_MESSAGE_STRUCTURE,
        'Test error',
        null,
        null,
        SIM_KEY_PATH
      );

      // Verify signature elements are present (Signature is namespace-qualified, prefix varies by xml-crypto output)
      expect(xml).toContain('Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
      expect(xml).toContain('<SignedInfo>');
      expect(xml).toContain('<SignatureValue>');
      expect(xml).toContain('<DigestValue>');
      // RSA-SHA256 signature method
      expect(xml).toContain('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
      // SHA-256 digest
      expect(xml).toContain('http://www.w3.org/2001/04/xmlenc#sha256');
    });
  });
});
