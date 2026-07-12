import { validateUBL } from './src/ubl/validator.js';
import { parseUBL } from './src/ubl/parser.js';
import { generateInvoice } from './src/ubl/generator.js';
import { sampleInvoiceData } from './test/fixtures.js';

// Instrument the validator
const badData3 = JSON.parse(JSON.stringify(sampleInvoiceData));
badData3.seller.countryCode = 'SK';
badData3.seller.vatID = 'SK1234567890';
const xml3 = generateInvoice(badData3);

// Manually check the logic
const parsed = parseUBL(xml3);
const SK_VAT_ID_REGEX = /^SK\d{10}$/;

console.log('seller.vatID:', parsed.seller.vatID);
console.log('seller.countryCode:', parsed.seller.countryCode);
console.log('SK_VAT_ID_REGEX.test(parsed.seller.vatID):', SK_VAT_ID_REGEX.test(parsed.seller.vatID));

// Now trace through the actual validation
const result3 = validateUBL(xml3);
console.log('\nFull errors:', JSON.stringify(result3.errors, null, 2));
