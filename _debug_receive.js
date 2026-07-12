import { generateInvoice } from './src/ubl/generator.js';
import { buildInboundAS4Message } from './src/simulator.js';
import { parseAS4Message } from './src/as4/message.js';
import { validateUBL } from './src/ubl/validator.js';
import * as apCore from './src/index.js';

apCore.enableSimulation();

const data = {
  id: 'FA-2026-0043',
  issueDate: '2026-06-16',
  dueDate: '2026-07-16',
  invoiceTypeCode: '380',
  currencyCode: 'EUR',
  buyerReference: 'PO-2026/100',
  seller: {
    endpointID: 'SK4498765432',
    endpointSchemeID: '0088',
    name: 'Mesto Trnava',
    cityName: 'Trnava',
    countryCode: 'SK',
  },
  buyer: {
    endpointID: 'SK2023456789',
    endpointSchemeID: '9914',
    name: 'Pekáreň Pod Hradom s.r.o.',
    cityName: 'Bratislava',
    countryCode: 'SK',
  },
  vatBreakdown: [
    { taxableAmount: 1000.0, taxAmount: 230.0, category: 'S', rate: 23.0 },
  ],
  monetaryTotal: {
    lineExtensionAmount: 1000.0,
    taxExclusiveAmount: 1000.0,
    taxInclusiveAmount: 1230.0,
    payableAmount: 1230.0,
  },
  lines: [
    { id: 1, quantity: 1, unitCode: 'X', lineExtensionAmount: 1000.0, itemName: 'Služby', vatCategory: 'S', vatRate: 23.0, priceAmount: 1000.0 },
  ],
};

const ubl = generateInvoice(data);
console.log('=== Generated UBL (first 200 chars) ===');
console.log(ubl.substring(0, 200));

const inbound = await buildInboundAS4Message({
  senderId: '0088:SK4498765432',
  receiverId: '9914:SK2023456789',
  ublXml: ubl,
});
console.log('\n=== AS4 Message (first 300 chars) ===');
console.log(inbound.as4Message.substring(0, 300));

const result = await apCore.handleIncomingMessage(inbound.as4Message);
console.log('\n=== Result ===');
console.log(JSON.stringify(result, null, 2));

// Debug step by step
const parsed = await parseAS4Message(inbound.as4Message);
console.log('\n=== Parsed payload (first 100 chars) ===');
console.log(JSON.stringify(parsed.payload?.substring(0, 100)));
const ublMatch = inbound.as4Message.match(/<(Invoice|CreditNote)[\s\S]*?<\/(Invoice|CreditNote)>/);
console.log('\n=== Extracted UBL (first 100 chars) ===');
console.log(JSON.stringify(ublMatch?.[0]?.substring(0, 100)));
if (ublMatch?.[0]) {
  const vr = validateUBL(ublMatch[0]);
  console.log('\n=== UBL Validation ===');
  console.log(JSON.stringify(vr, null, 2));
}
