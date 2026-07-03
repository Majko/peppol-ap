/**
 * Tests for SBDH module
 */
import { describe, it, expect } from 'vitest';
import { buildSBDH, parseSBDH } from '../src/as4/sbdh.js';
import { sampleSBDH, sampleInvoiceData } from './fixtures.js';
import { generateInvoice } from '../src/ubl/generator.js';

describe('SBDH', () => {
  describe('buildSBDH', () => {
    it('should build a valid SBDH XML envelope', () => {
      const xml = buildSBDH(sampleSBDH);

      expect(xml).toContain('<StandardBusinessDocument');
      expect(xml).toContain('</StandardBusinessDocument>');
      expect(xml).toContain(
        '<StandardBusinessDocumentHeader>'
      );
      expect(xml).toContain(
        'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader'
      );
    });

    it('should include sender and receiver identifiers', () => {
      const xml = buildSBDH(sampleSBDH);

      expect(xml).toContain('9914:SK2023456789');
      expect(xml).toContain('9914:SK4498765432');
      expect(xml).toContain('iso6523-actorid-upis');
    });

    it('should include document identification', () => {
      const xml = buildSBDH(sampleSBDH);

      expect(xml).toContain('uuid:3a1b2c3d');
      expect(xml).toContain('2026-06-15T10:30:00+02:00');
      expect(xml).toContain('Invoice');
      expect(xml).toContain('2.1');
    });

    it('should include business scope with DOCUMENTID, PROCESSID, COUNTRY_C1', () => {
      const xml = buildSBDH(sampleSBDH);

      expect(xml).toContain('DOCUMENTID');
      expect(xml).toContain('PROCESSID');
      expect(xml).toContain('COUNTRY_C1');
      expect(xml).toContain(
        'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice'
      );
      expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
      expect(xml).toContain('SK');
    });

    it('should include document payload when provided', () => {
      const ublXml = generateInvoice(sampleInvoiceData);
      
      const xml = buildSBDH({
        ...sampleSBDH,
        ublXml,
      });
      
      expect(xml).toContain('<Invoice');
      expect(xml).toContain('FA-2026-0042');
      expect(xml).toContain('<StandardBusinessDocumentHeader>');
      // SBDH header comes before payload
      expect(xml.indexOf('<StandardBusinessDocumentHeader>')).toBeLessThan(
        xml.indexOf('<Invoice')
      );
    });
  });

  describe('parseSBDH', () => {
    it('should parse sender and receiver from SBDH XML', () => {
      const xml = buildSBDH(sampleSBDH);
      const parsed = parseSBDH(xml);

      expect(parsed.senderId).toBe('9914:SK2023456789');
      expect(parsed.receiverId).toBe('9914:SK4498765432');
    });

    it('should parse document identification fields', () => {
      const xml = buildSBDH(sampleSBDH);
      const parsed = parseSBDH(xml);

      expect(parsed.instanceIdentifier).toBe(
        'uuid:3a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d'
      );
      expect(parsed.documentType).toBe('Invoice');
      expect(parsed.standard).toBe(
        'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
      );
      expect(parsed.creationDateAndTime).toBe(
        '2026-06-15T10:30:00+02:00'
      );
    });

    it('should parse business scopes', () => {
      const xml = buildSBDH(sampleSBDH);
      const parsed = parseSBDH(xml);

      expect(parsed.documentTypeIdentifier).toContain(
        'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
      );
      expect(parsed.processID).toBe(
        'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
      );
      expect(parsed.countryC1).toBe('SK');
    });
  });

  describe('round-trip', () => {
    it('should preserve sender/receiver through build and parse', () => {
      const xml = buildSBDH(sampleSBDH);

      // Now re-extract - the SBDH won't have an invoice payload in it
      // but we should still get the headers back
      const parsed = parseSBDH(xml);
      expect(parsed.senderId).toBe(sampleSBDH.senderId);
      expect(parsed.receiverId).toBe(sampleSBDH.receiverId);
    });
  });
});
