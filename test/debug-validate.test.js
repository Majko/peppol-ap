import { describe, it, expect } from 'vitest';
import { generateInvoice } from '../src/ubl/generator.js';
import { validateUBL } from '../src/ubl/validator.js';

const fixturePayload = {
  id: 'FA-2026-0042',
  issueDate: '2026-06-15',
  dueDate: '2026-07-15',
  invoiceTypeCode: '380',
  currencyCode: 'EUR',
  buyerReference: 'Objednavka-2026/89',
  seller: {
    endpointID: 'SK2023456789', endpointSchemeID: 'iso6523-actorid-upis',
    name: 'Pekáreň Pod Hradom s.r.o.', streetName: 'Hlavná 15', cityName: 'Bratislava',
    postalZone: '811 01', countryCode: 'SK', vatID: 'SK2023456789',
    legalRegistrationName: 'Pekáreň Pod Hradom s.r.o.', companyID: 'SK2023456789',
    contact: { name: 'Jana Nováková', telephone: '+421 2 1234 5678', email: 'jana@pekaren.sk' },
  },
  buyer: {
    endpointID: 'SK4498765432', endpointSchemeID: 'iso6523-actorid-upis',
    name: 'Mesto Trnava', streetName: 'Trojičné námestie 1', cityName: 'Trnava',
    postalZone: '917 01', countryCode: 'SK', vatID: 'SK4498765432',
    legalRegistrationName: 'Mesto Trnava', companyID: 'SK4498765432',
  },
  payment: { meansCode: '30', iban: 'SK6811000000001234567890', bic: 'TATRSKBX' },
  vatBreakdown: [
    { taxableAmount: 2000.0, taxAmount: 460.0, category: 'S', rate: 23.0 },
    { taxableAmount: 690.0, taxAmount: 69.0, category: 'AA', rate: 10.0 },
  ],
  monetaryTotal: {
    lineExtensionAmount: 2400.0, taxExclusiveAmount: 2690.0, taxInclusiveAmount: 3219.0,
    allowanceTotalAmount: 50.0, chargeTotalAmount: 340.0, payableAmount: 3219.0,
  },
  lines: [
    { id: 1, quantity: 100, unitCode: 'KGM', lineExtensionAmount: 2000.0, itemName: 'Ražný chlieb 1kg', vatCategory: 'AA', vatRate: 10.0, priceAmount: 20.0 },
    { id: 2, quantity: 5, unitCode: 'DAY', lineExtensionAmount: 400.0, itemName: 'Catering - obedové menu', vatCategory: 'S', vatRate: 23.0, priceAmount: 80.0 },
  ],
};

describe('debug fixture validation', () => {
  it('validate fixture invoice', () => {
    const xml = generateInvoice(fixturePayload);
    const result = validateUBL(xml);
    console.log('Valid:', result.valid);
    result.errors.filter(e => e.severity === 'fatal').forEach(e => {
      console.log(`  [${e.rule}] ${e.message} @ ${e.location}`);
    });
    expect(result.valid).toBe(true);
  });
});
