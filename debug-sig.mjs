import { buildAS4Message, parseAS4Message, verifyIncomingSignature } from './src/as4/message.js';
import { buildSBDH } from './src/as4/sbdh.js';
import { generateInvoice } from './src/ubl/generator.js';
import { sampleInvoiceData, sampleSBDH } from './test/fixtures.js';

const KEY_PATH = 'test/fixtures/keys/sim-signing-key.pem';
const ublXml = generateInvoice(sampleInvoiceData);
const sbdhXml = buildSBDH({ ...sampleSBDH, ublXml });
const mimeMessage = buildAS4Message({
  messageId: 'uuid:test@local',
  fromApId: 'POP000123',
  toApId: 'POP000456',
  senderParticipantId: sampleSBDH.senderId,
  receiverParticipantId: sampleSBDH.receiverId,
  payload: sbdhXml,
  documentType: 'invoice',
  processId: sampleSBDH.processID,
  signingKeyPath: KEY_PATH,
});

const parsed = await parseAS4Message(mimeMessage);
const soap = parsed.rawSoap;

// Extract KeyInfo section
const keyInfoMatch = soap.match(/<X509Data>[\s\S]*?<\/X509Data>/);
console.log('KeyInfo found:', !!keyInfoMatch);
if (keyInfoMatch) console.log('KeyInfo:', keyInfoMatch[0].substring(0, 800));

// Check for Signature
const sigMatch = soap.match(/<Signature[^>]*>/);
console.log('Signature tag:', sigMatch ? sigMatch[0] : 'NOT FOUND');

// Try verifying
const result = verifyIncomingSignature(soap, sampleSBDH.senderId);
console.log('Verify result:', JSON.stringify(result));
