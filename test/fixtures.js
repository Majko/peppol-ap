/**
 * Test fixtures for Peppol AP Core
 * Based on Lesson 2's bakery invoice example
 */

export const sampleInvoiceData = {
  id: 'FA-2026-0042',
  issueDate: '2026-06-15',
  dueDate: '2026-07-15',
  invoiceTypeCode: '380',
  currencyCode: 'EUR',
  buyerReference: 'Objednavka-2026/89',

  seller: {
    endpointID: 'SK2023456789',
    endpointSchemeID: 'iso6523-actorid-upis',
    name: 'Pekáreň Pod Hradom s.r.o.',
    streetName: 'Hlavná 15',
    cityName: 'Bratislava',
    postalZone: '811 01',
    countryCode: 'SK',
    vatID: 'SK2023456789',
    legalRegistrationName: 'Pekáreň Pod Hradom s.r.o.',
    companyID: 'SK2023456789', // BR-46: SK + 10 digits
    contact: {
      name: 'Jana Nováková',
      telephone: '+421 2 1234 5678',
      email: 'jana@pekaren.sk',
    },
  },

  buyer: {
    endpointID: 'SK4498765432',
    endpointSchemeID: 'iso6523-actorid-upis',
    name: 'Mesto Trnava',
    streetName: 'Trojičné námestie 1',
    cityName: 'Trnava',
    postalZone: '917 01',
    countryCode: 'SK',
    vatID: 'SK4498765432',
    legalRegistrationName: 'Mesto Trnava',
    companyID: 'SK4498765432', // BR-46: SK + 10 digits
  },

  payment: {
    meansCode: '30',
    iban: 'SK6811000000001234567890',
    bic: 'TATRSKBX',
  },

  vatBreakdown: [
    { taxableAmount: 2000.0, taxAmount: 460.0, category: 'S', rate: 23.0 },
    { taxableAmount: 690.0, taxAmount: 69.0, category: 'AA', rate: 10.0 },
  ],

  monetaryTotal: {
    lineExtensionAmount: 2400.0,
    taxExclusiveAmount: 2690.0,
    taxInclusiveAmount: 3219.0,
    allowanceTotalAmount: 50.0,
    chargeTotalAmount: 340.0,
    payableAmount: 3219.0,
  },

  lines: [
    {
      id: 1,
      quantity: 100,
      unitCode: 'KGM',
      lineExtensionAmount: 2000.0,
      item: { name: 'Ražný chlieb 1kg', description: '', countryOfOrigin: '' },
      vatCategory: 'AA',
      vatRate: 10.0,
      priceAmount: 20.0,
    },
    {
      id: 2,
      quantity: 5,
      unitCode: 'DAY',
      lineExtensionAmount: 400.0,
      item: { name: 'Catering - obedové menu', description: '', countryOfOrigin: '' },
      vatCategory: 'S',
      vatRate: 23.0,
      priceAmount: 80.0,
    },
  ],
};

export const sampleCreditNoteData = {
  ...sampleInvoiceData,
  id: 'FA-2026-0043',
  invoiceTypeCode: '381',
};

export const sampleSBDH = {
  senderId: '9914:SK2023456789',
  receiverId: '9914:SK4498765432',
  instanceIdentifier: 'uuid:3a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
  creationDateAndTime: '2026-06-15T10:30:00+02:00',
  documentType: 'Invoice',
  documentTypeIdentifier:
    'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
  processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  countryC1: 'SK',
};
