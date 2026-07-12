import { sampleInvoiceData } from './test/fixtures.js';
import { generateInvoice } from './src/ubl/generator.js';
import { parseUBL } from './src/ubl/parser.js';

const xml = generateInvoice(sampleInvoiceData);
// Check what CompanyID values appear in the XML
const companyIdMatches = xml.match(/<cbc:CompanyID>[^<]*<\/cbc:CompanyID>/g);
console.log('CompanyID elements:', companyIdMatches);

// Also check the partyTaxScheme sections
const partyTaxSchemeMatches = xml.match(/<cac:PartyTaxScheme>[\s\S]*?<\/cac:PartyTaxScheme>/g);
console.log('\nPartyTaxScheme sections:');
partyTaxSchemeMatches?.forEach((m, i) => console.log(i, m.slice(0, 200)));

// What does the parser extract?
const parsed = parseUBL(xml);
console.log('\nParsed seller.companyID:', parsed.seller?.companyID);
console.log('Parsed seller.vatID:', parsed.seller?.vatID);
console.log('Parsed buyer.companyID:', parsed.buyer?.companyID);
console.log('Parsed buyer.vatID:', parsed.buyer?.vatID);