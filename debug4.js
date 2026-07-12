import { sampleInvoiceData } from './test/fixtures.js';
import { generateInvoice } from './src/ubl/generator.js';
import { validateUBL } from './src/ubl/validator.js';

console.log('=== BR-46 FAILING TESTS ===\n');

// Test 1: should reject seller CompanyID with invalid SK format (not SK + 10 digits)
{
  const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
  badData.seller.countryCode = 'SK';
  badData.seller.companyID = 'SK1234567890'; // 11 digits - invalid
  const xml = generateInvoice(badData);
  const result = validateUBL(xml);
  console.log('Test: should reject seller CompanyID with invalid SK format (not SK + 10 digits)');
  console.log('  valid:', result.valid, '(expected: false)');
  console.log('  errors:', result.errors.map(e => `${e.rule}:${e.message.slice(0,50)}`));
}

// Test 2: should reject seller CompanyID with SK prefix but non-numeric
{
  const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
  badData.seller.countryCode = 'SK';
  badData.seller.companyID = 'SKABCDEFGHIJ';
  const xml = generateInvoice(badData);
  const result = validateUBL(xml);
  console.log('\nTest: should reject seller CompanyID with SK prefix but non-numeric (BR-46)');
  console.log('  valid:', result.valid, '(expected: false)');
  console.log('  errors:', result.errors.map(e => `${e.rule}:${e.message.slice(0,50)}`));
}

// Test 3: should reject buyer CompanyID with invalid SK format when buyer is SK
{
  const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
  badData.buyer.countryCode = 'SK';
  badData.buyer.companyID = 'SK1'; // too short
  const xml = generateInvoice(badData);
  const result = validateUBL(xml);
  console.log('\nTest: should reject buyer CompanyID with invalid SK format when buyer is SK (BR-46)');
  console.log('  valid:', result.valid, '(expected: false)');
  console.log('  errors:', result.errors.map(e => `${e.rule}:${e.message.slice(0,50)}`));
}

// Test 4: should apply SK VAT ID rule when seller is SK but buyer is not
{
  const mixedData = JSON.parse(JSON.stringify(sampleInvoiceData));
  mixedData.seller.countryCode = 'SK';
  mixedData.seller.companyID = 'SK1'; // invalid
  mixedData.buyer.countryCode = 'DE';
  mixedData.buyer.companyID = 'DE123';
  const xml = generateInvoice(mixedData);
  const result = validateUBL(xml);
  console.log('\nTest: should apply SK VAT ID rule when seller is SK but buyer is not');
  console.log('  valid:', result.valid, '(expected: false)');
  console.log('  errors:', result.errors.map(e => `${e.rule}:${e.message.slice(0,50)}`));
}

// Test 5: should accept seller CompanyID matching SK\\d{10} when seller is SK
{
  const goodData = JSON.parse(JSON.stringify(sampleInvoiceData));
  goodData.seller.countryCode = 'SK';
  goodData.seller.companyID = 'SK2023456789';
  const xml = generateInvoice(goodData);
  const result = validateUBL(xml);
  console.log('\nTest: should accept seller CompanyID matching SK\\d{10} when seller is SK');
  console.log('  valid:', result.valid, '(expected: true)');
  console.log('  errors:', result.errors.map(e => `${e.rule}:${e.message.slice(0,50)}`));
}

// Test 6: should accept buyer CompanyID matching SK\\d{10} when buyer is SK
{
  const goodData = JSON.parse(JSON.stringify(sampleInvoiceData));
  goodData.buyer.countryCode = 'SK';
  goodData.buyer.companyID = 'SK4498765432';
  const xml = generateInvoice(goodData);
  const result = validateUBL(xml);
  console.log('\nTest: should accept buyer CompanyID matching SK\\d{10} when buyer is SK');
  console.log('  valid:', result.valid, '(expected: true)');
  console.log('  errors:', result.errors.map(e => `${e.rule}:${e.message.slice(0,50)}`));
}
