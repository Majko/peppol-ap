/**
 * Tests for UBL Generator module
 * TDD: First tracer bullet - generate a valid UBL invoice XML
 */
import { describe, it, expect } from 'vitest';
import { sampleInvoiceData, sampleCreditNoteData } from './fixtures.js';

// We'll import after implementing
const { generateInvoice, generateCreditNote } = await import('../src/ubl/generator.js');
const { parseUBL } = await import('../src/ubl/parser.js');

describe('UBL Generator', () => {
  describe('generateInvoice', () => {
    it('should generate valid XML for an invoice', () => {
      const xml = generateInvoice(sampleInvoiceData);

      // Must be a string with XML content
      expect(xml).toBeTypeOf('string');
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<Invoice');
      expect(xml).toContain('</Invoice>');
      expect(xml).toContain(
        'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
      );
    });

    it('should include mandatory header fields', () => {
      const xml = generateInvoice(sampleInvoiceData);

      expect(xml).toContain('FA-2026-0042');
      expect(xml).toContain('2026-06-15');
      expect(xml).toContain('380'); // invoice type
      expect(xml).toContain('EUR');
      expect(xml).toContain(
        'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
      );
      expect(xml).toContain(
        'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
      );
    });

    it('should include seller party information', () => {
      const xml = generateInvoice(sampleInvoiceData);

      expect(xml).toContain('Pekáreň Pod Hradom s.r.o.');
      expect(xml).toContain('SK2023456789');
      expect(xml).toContain('Hlavná 15');
      expect(xml).toContain('Bratislava');
      expect(xml).toContain('SK2023456789'); // companyID in PartyTaxScheme
    });

    it('should include buyer party information', () => {
      const xml = generateInvoice(sampleInvoiceData);

      expect(xml).toContain('Mesto Trnava');
      expect(xml).toContain('SK4498765432');
      expect(xml).toContain('Trojičné námestie 1');
      expect(xml).toContain('Trnava');
    });

    it('should include VAT breakdown and monetary totals', () => {
      const xml = generateInvoice(sampleInvoiceData);

      expect(xml).toContain('2000.00');
      expect(xml).toContain('460.00');
      expect(xml).toContain('69.00');
      expect(xml).toContain('S');
      expect(xml).toContain('23.0');
      expect(xml).toContain('AA');
      expect(xml).toContain('10.0');
      expect(xml).toContain('3219.00');
    });

    it('should include invoice lines', () => {
      const xml = generateInvoice(sampleInvoiceData);

      expect(xml).toContain('Ražný chlieb 1kg');
      expect(xml).toContain('Catering - obedové menu');
      expect(xml).toContain('KGM');
      expect(xml).toContain('DAY');
      expect(xml).toContain('20.00');
      expect(xml).toContain('80.00');
    });

    it('should include payment information', () => {
      const xml = generateInvoice(sampleInvoiceData);

      expect(xml).toContain('30'); // payment means code
      expect(xml).toContain('SK6811000000001234567890');
      expect(xml).toContain('TATRSKBX');
    });

    it('should generate parseable XML that round-trips seller info', () => {
      const xml = generateInvoice(sampleInvoiceData);
      const parsed = parseUBL(xml);

      expect(parsed.id).toBe('FA-2026-0042');
      expect(parsed.seller.name).toBe('Pekáreň Pod Hradom s.r.o.');
      expect(parsed.buyer.name).toBe('Mesto Trnava');
      expect(parsed.currencyCode).toBe('EUR');
    });

    it('should generate parseable XML that round-trips totals', () => {
      const xml = generateInvoice(sampleInvoiceData);
      const parsed = parseUBL(xml);

      expect(parsed.monetaryTotal.payableAmount).toBe(3219.0);
      expect(parsed.monetaryTotal.taxExclusiveAmount).toBe(2690.0);
      expect(parsed.monetaryTotal.taxInclusiveAmount).toBe(3219.0);
    });

    it('should generate parseable XML that round-trips lines', () => {
      const xml = generateInvoice(sampleInvoiceData);
      const parsed = parseUBL(xml);

      expect(parsed.lines).toHaveLength(2);
      expect(parsed.lines[0].item.name).toBe('Ražný chlieb 1kg');
      expect(parsed.lines[0].quantity).toBe(100);
      expect(parsed.lines[1].item.name).toBe('Catering - obedové menu');
    });

    it('should generate parseable XML that round-trips VAT breakdown', () => {
      const xml = generateInvoice(sampleInvoiceData);
      const parsed = parseUBL(xml);

      expect(parsed.vatBreakdown).toHaveLength(2);
      expect(parsed.vatBreakdown[0].category).toBe('S');
      expect(parsed.vatBreakdown[0].rate).toBe(23.0);
      expect(parsed.vatBreakdown[1].category).toBe('AA');
      expect(parsed.vatBreakdown[1].rate).toBe(10.0);
    });
  });

  describe('generateCreditNote', () => {
    it('should generate valid XML for a credit note', () => {
      const xml = generateCreditNote(sampleCreditNoteData);

      expect(xml).toContain('<CreditNote');
      expect(xml).toContain('</CreditNote>');
      expect(xml).toContain('381'); // credit note type code
    });
  });
});
