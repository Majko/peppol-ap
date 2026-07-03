/**
 * Tests for AS4 Message module
 */
import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { buildAS4Message, parseAS4Message } from '../src/as4/message.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { generateInvoice } from '../src/ubl/generator.js';
import { sampleInvoiceData, sampleSBDH } from './fixtures.js';

const AP_ID = 'POP000123';
const RECEIVER_AP_ID = 'POP000456';
const MESSAGE_ID = `uuid:${uuidv4()}@ap.mojafaktura.sk`;

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
  });
});
