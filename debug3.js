import { sampleInvoiceData } from './test/fixtures.js';
import { generateInvoice } from './src/ubl/generator.js';
import { parseUBL } from './src/ubl/parser.js';
import { validateUBL } from './src/ubl/validator.js';

// Test basic validation
const xml = generateInvoice(sampleInvoiceData);
const result = validateUBL(xml);
console.log('Basic invoice valid:', result.valid);
console.log('Errors:', result.errors.map(e => e.rule));

// Test BR-44 with both reason and code
const xml2 = generateInvoice(sampleInvoiceData);
const goodXml = xml2.replace(
  /(<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>)/,
  '$1<cbc:TaxExemptionReason>Exempt from VAT</cbc:TaxExemptionReason><cbc:TaxExemptionReasonCode>E</cbc:TaxExemptionReasonCode>'
);
const parsed2 = parseUBL(goodXml);
console.log('\nParsed vatBreakdown[0] with reason+code:', JSON.stringify(parsed2.vatBreakdown[0]));
const result2 = validateUBL(goodXml);
console.log('Valid with reason+code:', result2.valid);
console.log('Errors:', result2.errors.map(e => e.rule));
