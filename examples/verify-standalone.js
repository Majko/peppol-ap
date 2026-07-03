#!/usr/bin/env node
/**
 * Standalone verification of the Peppol AP Core
 * Tests the full pipeline end-to-end without Vitest
 *
 * Usage: node examples/verify-standalone.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { generateInvoice, generateCreditNote } from '../src/ubl/generator.js';
import { parseUBL } from '../src/ubl/parser.js';
import { validateUBL } from '../src/ubl/validator.js';
import { buildSBDH, parseSBDH } from '../src/as4/sbdh.js';
import { buildAS4Message, parseAS4Message } from '../src/as4/message.js';
import * as apCore from '../src/index.js';

const {
  sendInvoice,
  validateDocument,
  lookupParticipant,
  getStatus,
  registerWebhook,
  getHealth,
  buildCompleteAS4Message,
  handleIncomingMessage,
} = apCore;

// Sample invoice data
const sampleInvoiceData = {
  id: 'FA-2026-9999',
  issueDate: '2026-07-03',
  dueDate: '2026-08-02',
  invoiceTypeCode: '380',
  currencyCode: 'EUR',
  buyerReference: 'Test-Objednavka-001',

  seller: {
    endpointID: 'SK2023456789',
    endpointSchemeID: '9914',
    name: 'Testovacia Firma s.r.o.',
    streetName: 'Testova 42',
    cityName: 'Bratislava',
    postalZone: '821 01',
    countryCode: 'SK',
    vatID: 'SK2023456789',
    legalRegistrationName: 'Testovacia Firma s.r.o.',
    companyID: 'SK12345678',
  },

  buyer: {
    endpointID: 'SK4498765432',
    endpointSchemeID: '9914',
    name: 'Testovaci Odberatel s.r.o.',
    streetName: 'Obchodna 15',
    cityName: 'Kosice',
    postalZone: '040 01',
    countryCode: 'SK',
    vatID: 'SK4498765432',
    legalRegistrationName: 'Testovaci Odberatel s.r.o.',
    companyID: '87654321',
    companyIDSchemeID: '0130',
  },

  payment: {
    meansCode: '30',
    iban: 'SK6811000000001234567890',
    bic: 'TATRSKBX',
  },

  vatBreakdown: [
    { taxableAmount: 1000.0, taxAmount: 230.0, category: 'S', rate: 23.0 },
  ],

  monetaryTotal: {
    lineExtensionAmount: 1000.0,
    taxExclusiveAmount: 1000.0,
    taxInclusiveAmount: 1230.0,
    allowanceTotalAmount: 0,
    chargeTotalAmount: 0,
    payableAmount: 1230.0,
  },

  lines: [
    {
      id: 1,
      quantity: 10,
      unitCode: 'C62',
      lineExtensionAmount: 1000.0,
      itemName: 'Konzultacne sluzby',
      vatCategory: 'S',
      vatRate: 23.0,
      priceAmount: 100.0,
    },
  ],
};

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ${PASS} ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${FAIL} ${name}: ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ${PASS} ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${FAIL} ${name}: ${e.message}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════
// 1. UBL Generation
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 1. UBL Document Generation ===\x1b[0m');

test('generate valid Invoice XML', () => {
  const xml = generateInvoice(sampleInvoiceData);
  if (!xml.includes('<Invoice')) throw new Error('Missing Invoice root');
  if (!xml.includes('FA-2026-9999')) throw new Error('Missing invoice number');
  if (!xml.includes('SK2023456789')) throw new Error('Missing seller endpoint');
});

test('generate valid CreditNote XML', () => {
  const data = { ...sampleInvoiceData, invoiceTypeCode: '381' };
  const xml = generateCreditNote(data);
  if (!xml.includes('<CreditNote'))
    throw new Error('Missing CreditNote root');
  if (!xml.includes('381')) throw new Error('Missing credit note type code');
});

// ═══════════════════════════════════════════════════════
// 2. UBL Parsing
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 2. UBL Parsing ===\x1b[0m');

test('round-trip invoice through generate and parse', () => {
  const xml = generateInvoice(sampleInvoiceData);
  const parsed = parseUBL(xml);

  if (parsed.id !== 'FA-2026-9999') throw new Error('Wrong ID');
  if (parsed.currencyCode !== 'EUR') throw new Error('Wrong currency');
  if (parsed.seller.vatID !== 'SK2023456789')
    throw new Error('Wrong seller VAT');
  if (parsed.buyer.endpointID !== 'SK4498765432')
    throw new Error('Wrong buyer endpoint');
  if (parsed.lines.length !== 1)
    throw new Error('Expected 1 line, got ' + parsed.lines.length);
  if (parsed.vatBreakdown.length !== 1)
    throw new Error('Expected 1 VAT breakdown, got ' + parsed.vatBreakdown.length);
});

// ═══════════════════════════════════════════════════════
// 3. Validation
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 3. Validation ===\x1b[0m');

test('validate a correct invoice', () => {
  const xml = generateInvoice(sampleInvoiceData);
  const result = validateUBL(xml);
  if (!result.valid) {
    throw new Error('Valid invoice rejected:\n  ' +
      result.errors.map((e) => `${e.rule}: ${e.message}`).join('\n  '));
  }
});

test('reject an invalid invoice (wrong type code)', () => {
  const badData = { ...sampleInvoiceData, invoiceTypeCode: '999' };
  const xml = generateInvoice(badData);
  const result = validateUBL(xml);
  if (result.valid) throw new Error('Invalid invoice was accepted');
});

test('reject mismatched monetary totals', () => {
  const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
  badData.monetaryTotal.taxInclusiveAmount = 9999.99;
  const xml = generateInvoice(badData);
  const result = validateUBL(xml);
  if (result.valid) throw new Error('Bad totals not caught');
});

// ═══════════════════════════════════════════════════════
// 4. SBDH
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 4. SBDH Envelope ===\x1b[0m');

test('build and parse SBDH', () => {
  const ublXml = generateInvoice(sampleInvoiceData);

  const sbdhXml = buildSBDH({
    senderId: '9914:SK2023456789',
    receiverId: '9914:SK4498765432',
    instanceIdentifier: 'uuid:test-12345',
    creationDateAndTime: '2026-07-03T12:00:00Z',
    documentType: 'Invoice',
    documentTypeIdentifier:
      'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##...',
    processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    countryC1: 'SK',
    ublXml,
  });

  if (!sbdhXml.includes('StandardBusinessDocumentHeader'))
    throw new Error('Missing SBDH header');
  if (!sbdhXml.includes('9914:SK2023456789'))
    throw new Error('Missing sender');

  const parsed = parseSBDH(sbdhXml);
  if (parsed.senderId !== '9914:SK2023456789')
    throw new Error('Wrong parsed sender');
  if (parsed.receiverId !== '9914:SK4498765432')
    throw new Error('Wrong parsed receiver');
});

// ═══════════════════════════════════════════════════════
// 5. AS4 Message
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 5. AS4 Message ===\x1b[0m');

test('build and parse AS4 message', () => {
  const ublXml = generateInvoice(sampleInvoiceData);
  const sbdhXml = buildSBDH({
    senderId: '9914:SK2023456789',
    receiverId: '9914:SK4498765432',
    instanceIdentifier: 'uuid:test-12345',
    creationDateAndTime: '2026-07-03T12:00:00Z',
    documentType: 'Invoice',
    documentTypeIdentifier:
      'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##...',
    processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    countryC1: 'SK',
    ublXml,
  });

  const as4Message = buildAS4Message({
    messageId: 'uuid:test-msg-1@ap.mojafaktura.sk',
    fromApId: 'POP000123',
    toApId: 'POP000456',
    senderParticipantId: '9914:SK2023456789',
    receiverParticipantId: '9914:SK4498765432',
    payload: sbdhXml,
    documentType: 'invoice',
    processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  });

  if (!as4Message.includes('soap:Envelope'))
    throw new Error('Missing SOAP envelope');
  if (!as4Message.includes('POP000123'))
    throw new Error('Missing sender AP');
  if (!as4Message.includes('FA-2026-9999'))
    throw new Error('Missing invoice data in payload');

  // Parse it back
  const parsed = parseAS4Message(as4Message);
  if (parsed.fromApId !== 'POP000123')
    throw new Error('Wrong parsed from AP');
  if (parsed.toApId !== 'POP000456')
    throw new Error('Wrong parsed to AP');
});

// ═══════════════════════════════════════════════════════
// 6. AP Core Interface
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 6. AP Core Interface ===\x1b[0m');

test('health check', () => {
  const health = getHealth();
  if (health.status !== 'ok') throw new Error('AP Core not healthy');
  if (!health.apId) throw new Error('Missing AP ID');
});

testAsync('validate document via AP Core', async () => {
  const xml = generateInvoice(sampleInvoiceData);
  const result = validateDocument(xml);
  if (!result.valid) {
    throw new Error('Validation failed:\n  ' +
      result.errors.map((e) => `${e.rule}: ${e.message}`).join('\n  '));
  }
});

test('register webhook', () => {
  const result = registerWebhook({
    url: 'https://app.example.com/api/webhook/invoice-received',
    secret: 'whsec_test',
  });
  if (!result.success) throw new Error('Webhook registration failed');
});

testAsync('lookup participant', async () => {
  const result = await lookupParticipant('9914:SK2023456789');
  if (result.participantId !== '9914:SK2023456789')
    throw new Error('Wrong participant ID');
});

testAsync('send invoice (validated but offline)', async () => {
  const ublXml = generateInvoice(sampleInvoiceData);
  const result = await sendInvoice({
    senderId: '9914:SK2023456789',
    receiverId: '0088:SK4498765432',
    ublXml,
  });

  if (result.error === 'validation_failed')
    throw new Error('Validation failed: ' + JSON.stringify(result.details));
  if (!result.messageId)
    throw new Error('No message ID returned');
});

test('get message status', () => {
  const status = getStatus('test-message-id');
  if (!status.status) throw new Error('No status returned');
});

test('build complete AS4 message from invoice data', () => {
  const { as4Message, ublXml, messageId } = buildCompleteAS4Message({
    senderId: '9914:SK2023456789',
    receiverId: '0088:SK4498765432',
    invoiceData: sampleInvoiceData,
    fromApId: 'POP000123',
    toApId: 'POP000456',
  });

  if (!messageId) throw new Error('No message ID');
  if (!as4Message.includes('<Invoice')) throw new Error('Missing UBL in AS4');
  if (!ublXml.includes('FA-2026-9999'))
    throw new Error('Wrong invoice number');
});

// ═══════════════════════════════════════════════════════
// 7. End-to-End Pipeline: Generate → Validate → SBDH → AS4
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m=== 7. End-to-End Pipeline ===\x1b[0m');

test('complete pipeline: generate → validate → SBDH → AS4 → parse back', () => {
  // Step 1: Generate UBL
  const ublXml = generateInvoice(sampleInvoiceData);

  // Step 2: Validate
  const validation = validateUBL(ublXml);
  if (!validation.valid) throw new Error('Validation failed before pipeline');

  // Step 3: Build SBDH
  const sbdhXml = buildSBDH({
    senderId: '9914:SK2023456789',
    receiverId: '9914:SK4498765432',
    instanceIdentifier: 'uuid:e2e-test-001',
    creationDateAndTime: new Date().toISOString(),
    documentType: 'Invoice',
    documentTypeIdentifier:
      'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
    processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    countryC1: 'SK',
    ublXml,
  });

  // Step 4: Build AS4 message
  const as4Message = buildAS4Message({
    messageId: 'uuid:e2e-test-001@ap.mojafaktura.sk',
    fromApId: 'POP000123',
    toApId: 'POP000456',
    senderParticipantId: '9914:SK2023456789',
    receiverParticipantId: '9914:SK4498765432',
    payload: sbdhXml,
    documentType: 'invoice',
    processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  });

  // Step 5: Parse the AS4 message back
  const parsed = parseAS4Message(as4Message);
  if (parsed.fromApId !== 'POP000123')
    throw new Error('End-to-end: Wrong from AP');
  if (!parsed.payload)
    throw new Error('End-to-end: No payload extracted');

  // Step 6: Parse the SBDH from the payload
  const sbdhParsed = parseSBDH(parsed.payload);
  if (sbdhParsed.senderId !== '9914:SK2023456789')
    throw new Error('End-to-end: Wrong sender in SBDH');

  // Step 7: Extract and parse the UBL
  const ublMatch = parsed.payload.match(/<(Invoice|CreditNote)[\s\S]*?<\/(Invoice|CreditNote)>/);
  if (!ublMatch) throw new Error('End-to-end: No UBL in payload');

  const reParsedUBL = parseUBL(ublMatch[0]);
  if (reParsedUBL.id !== 'FA-2026-9999')
    throw new Error('End-to-end: Wrong invoice ID after full round-trip');

  console.log(`  ${INFO} Full round-trip verified: JSON → UBL → SBDH → AS4 → parse back → correct`);
});

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log(`\n\x1b[1m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m\n`);

if (failed > 0) {
  process.exit(1);
}
