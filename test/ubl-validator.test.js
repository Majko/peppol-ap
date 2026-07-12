/**
 * Tests for UBL Validator module
 * Validates Peppol BIS Billing 3.0 business rules
 */
import { describe, it, expect } from 'vitest';
import { sampleInvoiceData } from './fixtures.js';
import { generateInvoice } from '../src/ubl/generator.js';
import { validateUBL } from '../src/ubl/validator.js';
import { generateCreditNote } from '../src/ubl/generator.js';

describe('UBL Validator', () => {
  it('should validate a correct invoice without errors', () => {
    const xml = generateInvoice(sampleInvoiceData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing CustomizationID', () => {
    const badData = { ...sampleInvoiceData };
    // We simulate by generating and then removing
    const xml = generateInvoice(sampleInvoiceData);
    const brokenXml = xml.replace(
      /<cbc:CustomizationID>.*?<\/cbc:CustomizationID>/,
      ''
    );
    const result = validateUBL(brokenXml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R001')).toBe(true);
  });

  it('should reject missing invoice number', () => {
    const badData = { ...sampleInvoiceData, id: '' };
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R001')).toBe(true);
  });

  it('should reject mismatched tax totals (R029)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.taxInclusiveAmount = 9999.99; // wrong total
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R029')).toBe(true);
  });

  it('should reject mismatched line extension total (R031)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.lineExtensionAmount = 9999.99; // doesn't match lines
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R031')).toBe(true);
  });

  it('should reject mismatched VAT total (R033)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.taxInclusiveAmount = 9999.99;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
  });

  it('should reject invalid invoice type code', () => {
    const badData = { ...sampleInvoiceData, invoiceTypeCode: '999' };
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R003')).toBe(true);
  });

  it('should reject missing seller endpoint ID', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.seller.endpointID = '';
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
  });

  it('should reject missing buyer endpoint ID', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.buyer.endpointID = '';
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
  });

  it('should validate credit notes correctly', () => {
    const creditNoteData = { ...sampleInvoiceData, invoiceTypeCode: '381' };
    const xml = generateCreditNote(creditNoteData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
  });

  it('should reject invalid VAT category code', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.vatBreakdown[0].category = 'ZZ'; // invalid category
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
  });

  it('should reject zero VAT rate for standard category (R065)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.vatBreakdown[0].rate = 0.0;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R065')).toBe(true);
  });

  it('should reject non-zero VAT rate for exempt category (R066)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.vatBreakdown[0].category = 'E';
    badData.vatBreakdown[0].rate = 23.0;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R066')).toBe(true);
  });

  it('should identify Schematron rule IDs in errors', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.taxInclusiveAmount = 9999.99;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        expect(err.rule).toMatch(/^R\d{3}$/);
        expect(err.severity).toMatch(/^(fatal|warning)$/);
        expect(err.message).toBeTypeOf('string');
        expect(err.location).toBeTypeOf('string');
      }
    }
  });

  // ============================================================
  // Ticket 20: Monetary totals non-negativity
  // ============================================================

  it('should reject negative LineExtensionAmount (BR-CO-03)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.lineExtensionAmount = -100.00;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-03')).toBe(true);
  });

  it('should reject negative TaxExclusiveAmount (BR-CO-03)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.taxExclusiveAmount = -50.00;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-03')).toBe(true);
  });

  it('should reject negative TaxInclusiveAmount (BR-CO-03)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.monetaryTotal.taxInclusiveAmount = -999.00;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-03')).toBe(true);
  });

  it('should accept zero monetary totals', () => {
    const zeroData = JSON.parse(JSON.stringify(sampleInvoiceData));
    zeroData.monetaryTotal.lineExtensionAmount = 0;
    zeroData.monetaryTotal.taxExclusiveAmount = 0;
    zeroData.monetaryTotal.taxInclusiveAmount = 0;
    zeroData.lines[0].lineExtensionAmount = 0;
    zeroData.vatBreakdown[0].taxableAmount = 0;
    zeroData.vatBreakdown[0].taxAmount = 0;
    const xml = generateInvoice(zeroData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
  });

  // ============================================================
  // Ticket 20: Tax exemption reason / reason code pairing
  // ============================================================

  it('should reject TaxExemptionReason without TaxExemptionReasonCode (BR-44)', () => {
    // Build XML manually to inject only TaxExemptionReason (no Code)
    const xml = generateInvoice(sampleInvoiceData);
    // Insert TaxExemptionReason into first TaxCategory without Code
    const brokenXml = xml.replace(
      /(<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>)/,
      '$1<cbc:TaxExemptionReason>Exempt from VAT</cbc:TaxExemptionReason>'
    );
    const result = validateUBL(brokenXml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-44')).toBe(true);
  });

  it('should reject TaxExemptionReasonCode without TaxExemptionReason (BR-44)', () => {
    const xml = generateInvoice(sampleInvoiceData);
    // Insert TaxExemptionReasonCode without TaxExemptionReason
    const brokenXml = xml.replace(
      /(<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>)/,
      '$1<cbc:TaxExemptionReasonCode>E</cbc:TaxExemptionReasonCode>'
    );
    const result = validateUBL(brokenXml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-44')).toBe(true);
  });

  it('should accept TaxExemptionReason with TaxExemptionReasonCode', () => {
    const xml = generateInvoice(sampleInvoiceData);
    // Insert both reason and code together
    const goodXml = xml.replace(
      /(<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>)/,
      '$1<cbc:TaxExemptionReason>Exempt from VAT</cbc:TaxExemptionReason><cbc:TaxExemptionReasonCode>E</cbc:TaxExemptionReasonCode>'
    );
    const result = validateUBL(goodXml);

    expect(result.valid).toBe(true);
  });

  // ============================================================
  // Ticket 20: TaxableAmount non-negativity
  // ============================================================

  it('should reject negative TaxableAmount (BR-45)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.vatBreakdown[0].taxableAmount = -100.00;
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-45')).toBe(true);
  });

  it('should accept zero TaxableAmount', () => {
    const zeroData = JSON.parse(JSON.stringify(sampleInvoiceData));
    zeroData.vatBreakdown[0].taxableAmount = 0;
    zeroData.vatBreakdown[0].taxAmount = 0;
    zeroData.vatBreakdown[0].category = 'E';
    zeroData.vatBreakdown[0].rate = 0;
    const xml = generateInvoice(zeroData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
  });

  // ============================================================
  // Ticket 20: SK VAT ID format
  // ============================================================

  const SK_VAT_ID_REGEX = /^SK\d{10}$/;

  it('should reject seller CompanyID with invalid SK format (not SK + 10 digits)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.seller.countryCode = 'SK';
    badData.seller.companyID = 'SK1234567890'; // 11 digits - invalid
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-46')).toBe(true);
  });

  it('should reject seller CompanyID with SK prefix but non-numeric (BR-46)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.seller.countryCode = 'SK';
    badData.seller.companyID = 'SKABCDEFGHIJ'; // letters instead of digits
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-46')).toBe(true);
  });

  it('should reject buyer CompanyID with invalid SK format when buyer is SK (BR-46)', () => {
    const badData = JSON.parse(JSON.stringify(sampleInvoiceData));
    badData.buyer.countryCode = 'SK';
    badData.buyer.companyID = 'SK1'; // too short
    const xml = generateInvoice(badData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-46')).toBe(true);
  });

  it('should accept seller CompanyID matching SK\\d{10} when seller is SK', () => {
    const goodData = JSON.parse(JSON.stringify(sampleInvoiceData));
    goodData.seller.countryCode = 'SK';
    goodData.seller.companyID = 'SK2023456789';
    const xml = generateInvoice(goodData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
  });

  it('should accept buyer CompanyID matching SK\\d{10} when buyer is SK', () => {
    const goodData = JSON.parse(JSON.stringify(sampleInvoiceData));
    goodData.buyer.countryCode = 'SK';
    goodData.buyer.companyID = 'SK4498765432';
    const xml = generateInvoice(goodData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
  });

  it('should NOT apply SK VAT ID rule when neither party is SK', () => {
    const nonSKData = JSON.parse(JSON.stringify(sampleInvoiceData));
    nonSKData.seller.countryCode = 'DE';
    nonSKData.seller.companyID = 'DE123456789'; // not SK format, but DE so should pass
    nonSKData.buyer.countryCode = 'NL';
    nonSKData.buyer.companyID = 'NL987654321';
    const xml = generateInvoice(nonSKData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(true);
  });

  it('should apply SK VAT ID rule when seller is SK but buyer is not', () => {
    const mixedData = JSON.parse(JSON.stringify(sampleInvoiceData));
    mixedData.seller.countryCode = 'SK';
    mixedData.seller.companyID = 'SK1'; // invalid
    mixedData.buyer.countryCode = 'DE';
    mixedData.buyer.companyID = 'DE123';
    const xml = generateInvoice(mixedData);
    const result = validateUBL(xml);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'BR-46')).toBe(true);
  });
});
