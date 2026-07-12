import { generateInvoice } from './src/ubl/generator.js';
import { sampleInvoiceData } from './test/fixtures.js';
import { parseUBL } from './src/ubl/parser.js';

// Test fmt function
function fmt(num) {
  if (num == null) return '0.00';
  return Number(num).toFixed(2);
}
console.log('=== fmt function ===');
console.log('fmt(0):', JSON.stringify(fmt(0)), 'length:', fmt(0).length);
console.log('fmt(0.00):', JSON.stringify(fmt(0.00)), 'length:', fmt(0.00).length);

const xml = generateInvoice(sampleInvoiceData);

// Check TaxCategory structure in generated XML
const taxCatMatch = xml.match(/<cac:TaxCategory>[\s\S]*?<\/cac:TaxCategory>/g);
console.log('\n=== TaxCategory in generated XML ===');
console.log(taxCatMatch ? taxCatMatch[0] : 'not found');

// Parse and check vatBreakdown
const parsed = parseUBL(xml);
console.log('\n=== Parsed vatBreakdown ===');
console.log(JSON.stringify(parsed.vatBreakdown, null, 2));

// Test zero monetary totals - check what R031 sees
const zeroData = JSON.parse(JSON.stringify(sampleInvoiceData));
zeroData.monetaryTotal.lineExtensionAmount = 0;
zeroData.monetaryTotal.taxExclusiveAmount = 0;
zeroData.monetaryTotal.taxInclusiveAmount = 0;
zeroData.lines[0].lineExtensionAmount = 0;
zeroData.vatBreakdown[0].taxableAmount = 0;
zeroData.vatBreakdown[0].taxAmount = 0;

const zeroXml = generateInvoice(zeroData);
const zeroParsed = parseUBL(zeroXml);

console.log('\n=== Zero totals parsed ===');
console.log('lines:', zeroParsed.lines.map(l => l.lineExtensionAmount));
console.log('lineExtensionAmount:', zeroParsed.monetaryTotal.lineExtensionAmount);
console.log('taxExclusiveAmount:', zeroParsed.monetaryTotal.taxExclusiveAmount);
console.log('taxInclusiveAmount:', zeroParsed.monetaryTotal.taxInclusiveAmount);
console.log('vatBreakdown:', zeroParsed.vatBreakdown);

// R031 check: lineExtensionAmount should equal sum of lines
const sumLines = zeroParsed.lines.reduce((s, l) => s + (l.lineExtensionAmount || 0), 0);
console.log('\n=== R031 check ===');
console.log('mt.lineExtensionAmount:', zeroParsed.monetaryTotal.lineExtensionAmount);
console.log('sum of lines:', sumLines);

// R029 check
if (zeroParsed.vatBreakdown) {
  const sumVat = zeroParsed.vatBreakdown.reduce((s, v) => s + (v.taxAmount || 0), 0);
  const expected = zeroParsed.monetaryTotal.taxExclusiveAmount + sumVat;
  console.log('\n=== R029 check ===');
  console.log('mt.taxExclusiveAmount:', zeroParsed.monetaryTotal.taxExclusiveAmount);
  console.log('sumVat:', sumVat);
  console.log('expected (taxExclusive + sumVat):', expected);
  console.log('mt.taxInclusiveAmount:', zeroParsed.monetaryTotal.taxInclusiveAmount);
}

// Test BR-46: what does the parser get for seller companyID vs vatID?
console.log('\n=== Seller companyID vs vatID ===');
console.log('companyID (PartyLegalEntity):', parsed.seller.companyID);
console.log('vatID (PartyTaxScheme):', parsed.seller.vatID);

// Check the zero data seller
const zeroSellerVatId = zeroParsed.seller?.vatID;
const zeroSellerCompanyId = zeroParsed.seller?.companyID;
console.log('\n=== Zero data seller IDs ===');
console.log('vatID:', zeroSellerVatId);
console.log('companyID:', zeroSellerCompanyId);
