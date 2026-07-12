/**
 * Tests for incoming WS-Security signature verification
 * Verifies that handleIncomingMessage correctly validates (or bypasses)
 * the ds:Signature in incoming AS4 SOAP messages.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { verifyIncomingSignature } from '../src/as4/message.js';
import { buildAS4Message, parseAS4Message } from '../src/as4/message.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { generateInvoice } from '../src/ubl/generator.js';
import { sampleInvoiceData, sampleSBDH } from './fixtures.js';
import * as apCore from '../src/index.js';

const SIM_KEY_PATH = resolve(process.cwd(), 'test/fixtures/keys/sim-signing-key.pem');
const SIM_CERT_PATH = resolve(process.cwd(), 'test/fixtures/keys/sim-signing-cert.pem');
const AP_ID = 'POP000123';
const RECEIVER_AP_ID = 'POP000456';
const MESSAGE_ID = 'uuid:test-signature@ap.mojafaktura.sk';

function buildTestAS4Message(payload, signingKeyPath = null) {
  return buildAS4Message({
    messageId: MESSAGE_ID,
    fromApId: AP_ID,
    toApId: RECEIVER_AP_ID,
    senderParticipantId: sampleSBDH.senderId,
    receiverParticipantId: sampleSBDH.receiverId,
    payload,
    documentType: 'invoice',
    processId: sampleSBDH.processID,
    signingKeyPath,
  });
}

describe('verifyIncomingSignature', () => {
  beforeEach(() => {
    // Ensure simulation is disabled for these tests
    apCore.disableSimulation();
  });

  describe('valid signature', () => {
    it('should pass when SOAP envelope is signed with the sender key and certificate is in BinarySecurityToken', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });
      const mimeMessage = buildTestAS4Message(sbdhXml, SIM_KEY_PATH);

      // Parse to get raw SOAP
      const parsed = await parseAS4Message(mimeMessage);
      expect(parsed.rawSoap).toBeTruthy();
      // xml-crypto produces <Signature xmlns="..."> (no prefix) — verify it exists
      expect(parsed.rawSoap).toContain('<Signature xmlns=');

      // Verify — certificate is extracted from BinarySecurityToken in envelope
      const result = await verifyIncomingSignature(parsed.rawSoap, sampleSBDH.senderId);
      expect(result.valid).toBe(true);
      expect(result.simulated).toBeFalsy();
    });

    it('should pass when certificate is provided explicitly', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });
      const mimeMessage = buildTestAS4Message(sbdhXml, SIM_KEY_PATH);

      const parsed = await parseAS4Message(mimeMessage);

      // Read the cert from file and pass it explicitly
      const { readFileSync } = await import('node:fs');
      const certPem = readFileSync(SIM_CERT_PATH, 'utf8');

      const result = await verifyIncomingSignature(parsed.rawSoap, sampleSBDH.senderId, certPem);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid signature', () => {
    it('should fail when no ds:Signature is present', async () => {
      // Build an unsigned SOAP envelope manually
      const unsignedEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <eb:Messaging>
      <eb:UserMessage>
        <eb:MessageInfo>
          <eb:Timestamp>2026-07-11T10:00:00Z</eb:Timestamp>
          <eb:MessageId>${MESSAGE_ID}</eb:MessageId>
        </eb:MessageInfo>
      </eb:UserMessage>
    </eb:Messaging>
    <wsse:Security soap:mustUnderstand="true">
      <wsse:BinarySecurityToken EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3">dGVzdC1jZXJ0</wsse:BinarySecurityToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <xop:Include xmlns:xop="http://www.w3.org/2004/08/xop/include" href="cid:payload@sender"/>
  </soap:Body>
</soap:Envelope>`;

      const result = await verifyIncomingSignature(unsignedEnvelope, sampleSBDH.senderId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No Signature found');
    });

    it('should fail when signature has been tampered with (corrupt SignatureValue)', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });
      const mimeMessage = buildTestAS4Message(sbdhXml, SIM_KEY_PATH);

      const parsed = await parseAS4Message(mimeMessage);
      // xml-crypto produces <SignatureValue> without a namespace prefix
      const tamperedSoap = parsed.rawSoap.replace(
        /(<SignatureValue>)([\s\S]*?)(<\/SignatureValue>)/,
        (_, open, _value, close) => `${open}INVALID_BASE64_SIGNATURE${close}`
      );

      const result = await verifyIncomingSignature(tamperedSoap, sampleSBDH.senderId);
      expect(result.valid).toBe(false);
      // Either signature verification failed or keyinfo issue
      expect(result.error).toMatch(/signature|keyinfo|KeyInfo/i);
    });

    it('should fail when SOAP body is modified after signing', async () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });
      const mimeMessage = buildTestAS4Message(sbdhXml, SIM_KEY_PATH);

      const parsed = await parseAS4Message(mimeMessage);
      // Tamper with the body content — only soap:Body is signed, not headers
      const tamperedSoap = parsed.rawSoap.replace(
        /(<xop:Include[^>]*href=")([^"]+)(")/,
        (_, prefix, href, suffix) => `${prefix}cid:tampered-payload${suffix}`
      );

      const result = await verifyIncomingSignature(tamperedSoap, sampleSBDH.senderId);
      expect(result.valid).toBe(false);
    });
  });

  describe('simulation mode', () => {
    it('should bypass verification and return valid=true in simulation mode', async () => {
      apCore.enableSimulation();

      // Even an unsigned envelope should pass
      const unsignedEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <wsse:Security soap:mustUnderstand="true"/>
  </soap:Header>
  <soap:Body>
    <test>no signature here</test>
  </soap:Body>
</soap:Envelope>`;

      const result = await verifyIncomingSignature(unsignedEnvelope, sampleSBDH.senderId);
      expect(result.valid).toBe(true);
      expect(result.simulated).toBe(true);

      apCore.disableSimulation();
    });
  });
});

describe('handleIncomingMessage — signature integration', () => {
  beforeEach(() => {
    apCore.disableSimulation();
  });

  it('should throw INVALID_SIGNATURE when incoming message has no signature (non-sim mode)', async () => {
    const ublXml = generateInvoice(sampleInvoiceData);
    const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

    // Build unsigned AS4 message
    const mimeMessage = buildTestAS4Message(sbdhXml, null);

    await expect(apCore.handleIncomingMessage(mimeMessage)).rejects.toThrow(/signature/i);
  });

  it('should succeed when incoming message has a valid signature', async () => {
    const ublXml = generateInvoice(sampleInvoiceData);
    const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

    // Build signed AS4 message using sim signing key
    const mimeMessage = buildTestAS4Message(sbdhXml, SIM_KEY_PATH);

    const result = await apCore.handleIncomingMessage(mimeMessage);
    expect(result.messageId).toBeTruthy();
    expect(result.status).toMatch(/received|error/);
  });

  it('should bypass signature verification in simulation mode', async () => {
    apCore.enableSimulation();

    const ublXml = generateInvoice(sampleInvoiceData);
    const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });

    // Build unsigned message
    const mimeMessage = buildTestAS4Message(sbdhXml, null);

    // Should NOT throw even though unsigned
    const result = await apCore.handleIncomingMessage(mimeMessage);
    expect(result.messageId).toBeTruthy();

    apCore.disableSimulation();
  });
});
