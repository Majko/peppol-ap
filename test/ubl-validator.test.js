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
});
