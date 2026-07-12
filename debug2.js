import { generateInvoice } from './src/ubl/generator.js';
import { sampleInvoiceData } from './test/fixtures.js';
import { parseUBL } from './src/ubl/parser.js';
import { validateUBL } from './src/ubl/validator.js';

console.log('=== ZERO MONETARY TOTALS TEST ===');
const zeroData = JSON.parse(JSON.stringify(sampleInvoiceData));
zeroData.monetaryTotal.lineExtensionAmount = 0;
zeroData.monetaryTotal.taxExclusiveAmount = 0;
zeroData.monetaryTotal.taxInclusiveAmount = 0;
zeroData.lines[0].lineExtensionAmount = 0;
zeroData.vatBreakdown[0].taxableAmount = 0;
zeroData.vatBreakdown[0].taxAmount = 0;
const zeroXml = generateInvoice(zeroData);
const zeroResult = validateUBL(zeroXml);
console.log('valid:', zeroResult.valid);
console.log('errors:', JSON.stringify(zeroResult.errors, null, 2));

console.log('\n=== ZERO TAXABLEAMOUNT TEST ===');
const zeroTA = JSON.parse(JSON.stringify(sampleInvoiceData));
zeroTA.vatBreakdown[0].taxableAmount = 0;
zeroTA.vatBreakdown[0].taxAmount = 0;
zeroTA.vatBreakdown[0].category = 'E';
zeroTA.vatBreakdown[0].rate = 0;
const zeroTAXml = generateInvoice(zeroTA);
const zeroTAResult = validateUBL(zeroTAXml);
console.log('valid:', zeroTAResult.valid);
console.log('errors:', JSON.stringify(zeroTAResult.errors, null, 2));

console.log('\n=== BR-44 TEST: TaxExemptionReason without Code ===');
const xml1 = generateInvoice(sampleInvoiceData);
const brokenXml1 = xml1.replace(
  /(<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>)/,
  '$1<cbc:TaxExemptionReason>Exempt from VAT</cbc:TaxExemptionReason>'
);
const br44Result1 = validateUBL(brokenXml1);
console.log('valid:', br44Result1.valid);
console.log('errors:', JSON.stringify(br44Result1.errors, null, 2));

// Also check what parser sees
const br44Parsed = parseUBL(brokenXml1);
console.log('vatBreakdown[0]:', JSON.stringify(br44Parsed.vatBreakdown[0], null, 2));

console.log('\n=== BR-46 TEST: seller companyID ===');
const badSK = JSON.parse(JSON.stringify(sampleInvoiceData));
badSK.seller.countryCode = 'SK';
badSK.seller.companyID = 'SK1234567890'; // 11 digits - invalid
badSK.seller.vatID = 'SK1234567890'; // also set vatID for consistency
const br46Xml = generateInvoice(badSK);
const br46Result = validateUBL(br46Xml);
console.log('valid:', br46Result.valid);
console.log('errors:', JSON.stringify(br46Result.errors, null, 2));

// What does parser see?
const br46Parsed = parseUBL(br46Xml);
console.log('seller.vatID:', br46Parsed.seller.vatID);
console.log('seller.companyID:', br46Parsed.seller.companyID);
