import { sampleInvoiceData } from './test/fixtures.js';
import { generateInvoice } from './src/ubl/generator.js';
import { validateUBL } from './src/ubl/validator.js';
import { parseUBL } from './src/ubl/parser.js';

const xml = generateInvoice(sampleInvoiceData);
const parsed = parseUBL(xml);
console.log('Parsed payment:', JSON.stringify(parsed.payment, null, 2));
console.log('Parsed paymentInstructions:', JSON.stringify(parsed.paymentInstructions, null, 2));
const result = validateUBL(xml);
console.log('Valid:', result.valid);
console.log('Errors count:', result.errors.length);
if (result.errors.length > 0) {
  console.log('All errors:', JSON.stringify(result.errors, null, 2));
}
