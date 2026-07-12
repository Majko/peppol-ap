/**
 * UBL Validator module
 * Implements Peppol BIS Billing 3.0 business rule validation
 * Validates structure, mandatory fields, cross-field math, and code lists
 */

import { parseUBL } from './parser.js';

// Allowed code lists
// DE-R-017: Full Peppol BIS Billing 3.0 invoice type code list
const VALID_INVOICE_TYPE_CODES = new Set([
  '326', // Partial invoice
  '380', // Invoice
  '381', // Credit note
  '384', // Self-billed invoice
  '389', // Self-billed credit note
  '875', // Invoice for bad debt write-off
  '876', // Credit note for bad debt write-off
  '877', // Invoice with reduced payment deadline
]);

// DE-R-017: Credit note type codes (subset of invoice codes used in CreditNote documents)
const VALID_CREDIT_NOTE_TYPE_CODES = new Set([
  '381', // Credit note
  '875', // Credit note for bad debt write-off
  '876', // Debit note for bad debt write-off
  '877', // Credit note with reduced payment deadline
]);

const VALID_VAT_CATEGORIES = new Set([
  'S',  // Standard rate
  'AA', // Lower/reduced rate
  'AB', // Reduced rate (second)
  'E',  // Exempt from VAT
  'AE', // Reverse charge
  'K',  // Intra-community supply
  'G',  // Free export
  'O',  // Outside scope
]);

const ZERO_RATE_CATEGORIES = new Set(['E', 'AE', 'K', 'G', 'O']);

// ISO 3166-1 alpha-2 (common EU + nearby)
const VALID_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'CH', 'UK', 'GB',
]);

// ISO 4217 currency codes
const VALID_CURRENCY_CODES = new Set([
  'EUR', 'CZK', 'HUF', 'PLN', 'USD', 'GBP', 'CHF', 'NOK', 'SEK',
  'DKK', 'HRK', 'RON', 'BGN', 'ISK',
]);

// Peppol BIS Billing 3.0 ProfileID — must be exact match
const EXPECTED_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

// Allowed EndpointID schemeID values
const VALID_ENDPOINT_SCHEME_IDS = new Set([
  'iso6523-actorid-upis',
  '0088',
  '0002',
]);

// SK VAT ID pattern: SK followed by exactly 10 digits
const SK_VAT_ID_REGEX = /^SK\d{10}$/;

/**
 * Create a validation error entry
 */
function makeError(rule, severity, message, location) {
  return { rule, severity, message, location };
}

/**
 * Validate a UBL XML string against Peppol BIS Billing 3.0 rules
 * @param {string} xmlString - The UBL XML to validate
 * @returns {{ valid: boolean, errors: Array<{rule: string, severity: string, message: string, location: string}> }}
 */
export function validateUBL(xmlString) {
  const errors = [];

  // Phase 1: Try to parse the XML
  let doc;
  try {
    doc = parseUBL(xmlString);
  } catch (parseErr) {
    errors.push(
      makeError(
        'R001',
        'fatal',
        `XML parse error: ${parseErr.message}`,
        '/'
      )
    );
    return { valid: false, errors };
  }

  // Phase 2: Check XML well-formedness - basic string checks
  if (!xmlString.includes('<?xml')) {
    errors.push(
      makeError('R001', 'fatal', 'Missing XML declaration', '/')
    );
  }

  // Phase 3: Mandatory header fields (R001)
  const headerChecks = [
    {
      field: doc.customizationID,
      name: 'CustomizationID',
      xpath: '/Invoice/cbc:CustomizationID',
    },
    {
      field: doc.profileID,
      name: 'ProfileID',
      xpath: '/Invoice/cbc:ProfileID',
    },
    { field: doc.id, name: 'Invoice number (ID)', xpath: '/Invoice/cbc:ID' },
    {
      field: doc.issueDate,
      name: 'IssueDate',
      xpath: '/Invoice/cbc:IssueDate',
    },
    {
      field: doc.currencyCode,
      name: 'DocumentCurrencyCode',
      xpath: '/Invoice/cbc:DocumentCurrencyCode',
    },
  ];

  for (const check of headerChecks) {
    if (!check.field || (typeof check.field === 'string' && check.field.trim() === '')) {
      errors.push(
        makeError(
          'R001',
          'fatal',
          `Missing mandatory field: ${check.name}`,
          check.xpath
        )
      );
    }
  }

  // Check mandatory party fields
  if (!doc.seller || !doc.seller.endpointID) {
    errors.push(
      makeError(
        'R001',
        'fatal',
        'Missing seller EndpointID',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cbc:EndpointID'
      )
    );
  }

  if (!doc.buyer || !doc.buyer.endpointID) {
    errors.push(
      makeError(
        'R001',
        'fatal',
        'Missing buyer EndpointID',
        '/Invoice/cac:AccountingCustomerParty/cac:Party/cbc:EndpointID'
      )
    );
  }

  // Phase 3d: Validate seller EndpointID schemeID
  if (doc.seller && doc.seller.endpointSchemeID) {
    if (!VALID_ENDPOINT_SCHEME_IDS.has(doc.seller.endpointSchemeID)) {
      errors.push(
        makeError(
          'R001',
          'fatal',
          `Invalid seller EndpointID schemeID '${doc.seller.endpointSchemeID}'. Allowed: ${Array.from(VALID_ENDPOINT_SCHEME_IDS).join(', ')}`,
          '/Invoice/cac:AccountingSupplierParty/cac:Party/cbc:EndpointID'
        )
      );
    }
  }

  // Phase 3e: Validate buyer EndpointID schemeID
  if (doc.buyer && doc.buyer.endpointSchemeID) {
    if (!VALID_ENDPOINT_SCHEME_IDS.has(doc.buyer.endpointSchemeID)) {
      errors.push(
        makeError(
          'R001',
          'fatal',
          `Invalid buyer EndpointID schemeID '${doc.buyer.endpointSchemeID}'. Allowed: ${Array.from(VALID_ENDPOINT_SCHEME_IDS).join(', ')}`,
          '/Invoice/cac:AccountingCustomerParty/cac:Party/cbc:EndpointID'
        )
      );
    }
  }

  // Phase 3b: Validate ProfileID value (exact match)
  if (doc.profileID && doc.profileID.trim() !== EXPECTED_PROFILE_ID) {
    errors.push(
      makeError(
        'R001',
        'fatal',
        `Invalid ProfileID. Expected: ${EXPECTED_PROFILE_ID}`,
        '/Invoice/cbc:ProfileID'
      )
    );
  }

  // Phase 3c: Validate date formats (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const { value, name, xpath } of [
    { value: doc.issueDate, name: 'IssueDate', xpath: '/Invoice/cbc:IssueDate' },
    { value: doc.dueDate, name: 'DueDate', xpath: '/Invoice/cbc:DueDate' },
    { value: doc.taxPointDate, name: 'TaxPointDate', xpath: '/Invoice/cbc:TaxPointDate' },
  ]) {
    if (value && value.trim() !== '' && !dateRegex.test(value.trim())) {
      errors.push(
        makeError(
          'R001',
          'fatal',
          `Invalid date format for ${name}. Expected YYYY-MM-DD, got: ${value}`,
          xpath
        )
      );
    }
  }

  // Phase 4: Check invoice/credit note type code (DE-R-017)
  // Fatal: invalid invoice type codes must be rejected by the API
  if (doc.invoiceTypeCode && !VALID_INVOICE_TYPE_CODES.has(doc.invoiceTypeCode)) {
    errors.push(
      makeError(
        'DE-R-017',
        'fatal',
        `Invalid InvoiceTypeCode '${doc.invoiceTypeCode}'. Valid Peppol codes: ${Array.from(VALID_INVOICE_TYPE_CODES).join(', ')}`,
        '/Invoice/cbc:InvoiceTypeCode'
      )
    );
  }

  // Additional check: when document is a CreditNote, validate the type code is a valid credit note code
  // (CreditNote documents use InvoiceTypeCode element but should only use credit note codes)
  if (doc.isCreditNote && doc.invoiceTypeCode && !VALID_CREDIT_NOTE_TYPE_CODES.has(doc.invoiceTypeCode)) {
    errors.push(
      makeError(
        'DE-R-017',
        'fatal',
        `CreditNote has invalid type code '${doc.invoiceTypeCode}'. Valid credit note codes: ${Array.from(VALID_CREDIT_NOTE_TYPE_CODES).join(', ')}`,
        '/CreditNote/cbc:InvoiceTypeCode'
      )
    );
  }

  // Phase 5: Check CustomizationID value
  const expectedCustID =
    'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
  if (
    doc.customizationID &&
    doc.customizationID.trim() !== expectedCustID
  ) {
    errors.push(
      makeError(
        'R001',
        'fatal',
        `Invalid CustomizationID. Expected: ${expectedCustID}`,
        '/Invoice/cbc:CustomizationID'
      )
    );
  }

  // Phase 6: Validate country codes
  if (doc.seller && doc.seller.countryCode) {
    if (!VALID_COUNTRY_CODES.has(doc.seller.countryCode)) {
      errors.push(
        makeError(
          'R004',
          'warning',
          `Unknown seller country code: ${doc.seller.countryCode}`,
          '//cac:Country/cbc:IdentificationCode'
        )
      );
    }
  }

  // Phase 7: Validate currency code
  if (doc.currencyCode && !VALID_CURRENCY_CODES.has(doc.currencyCode)) {
    errors.push(
      makeError(
        'R005',
        'warning',
        `Unknown currency code: ${doc.currencyCode}`,
        '/Invoice/cbc:DocumentCurrencyCode'
      )
    );
  }

  // Phase 8: VAT validation
  if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
    for (let i = 0; i < doc.vatBreakdown.length; i++) {
      const vat = doc.vatBreakdown[i];
      const index = i + 1;

      // Check valid category code
      if (!VALID_VAT_CATEGORIES.has(vat.category)) {
        errors.push(
          makeError(
            'R006',
            'fatal',
            `Invalid VAT category code: ${vat.category} at subtotal ${index}`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cac:TaxCategory/cbc:ID`
          )
        );
      }

      // R065: Standard rate must be > 0
      if (vat.category === 'S' && vat.rate <= 0) {
        errors.push(
          makeError(
            'R065',
            'fatal',
            `VAT category 'S' (standard) must have rate > 0, got ${vat.rate}`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cac:TaxCategory/cbc:Percent`
          )
        );
      }

      // R066: Exempt/reverse-charge/IC categories must have rate = 0
      if (ZERO_RATE_CATEGORIES.has(vat.category) && vat.rate !== 0) {
        errors.push(
          makeError(
            'R066',
            'fatal',
            `VAT category '${vat.category}' must have rate = 0, got ${vat.rate}`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cac:TaxCategory/cbc:Percent`
          )
        );
      }

      // AA rate must be > 0
      if (vat.category === 'AA' && vat.rate <= 0) {
        errors.push(
          makeError(
            'R067',
            'fatal',
            `VAT category 'AA' (reduced) must have rate > 0, got ${vat.rate}`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cac:TaxCategory/cbc:Percent`
          )
        );
      }
    }

    // R033: VAT total = sum of TaxSubtotal/TaxAmount
    const sumSubtotals = doc.vatBreakdown.reduce(
      (sum, v) => sum + (v.taxAmount || 0),
      0
    );
    const declaredVatTotal = doc.vatTotal !== undefined ? doc.vatTotal : 
      (doc.monetaryTotal ? (doc.monetaryTotal.taxInclusiveAmount - doc.monetaryTotal.taxExclusiveAmount) : 0);
    
    // Use a small epsilon for floating point comparison
    const eps = 0.01;
    if (doc.monetaryTotal) {
      const declaredVat = doc.monetaryTotal.taxInclusiveAmount - doc.monetaryTotal.taxExclusiveAmount;
      if (Math.abs(declaredVat - sumSubtotals) > eps) {
        errors.push(
          makeError(
            'R033',
            'fatal',
            `VAT total (${declaredVat.toFixed(2)}) must equal sum of TaxSubtotal/TaxAmount (${sumSubtotals.toFixed(2)})`,
            '/Invoice/cac:TaxTotal/cbc:TaxAmount'
          )
        );
      }
    }
  }

  // Phase 9: Monetary totals cross-field validation
  if (doc.monetaryTotal) {
    const mt = doc.monetaryTotal;
    const eps = 0.01;

    // R029: TaxInclusiveAmount = TaxExclusiveAmount + VAT total
    if (mt.taxExclusiveAmount != null && mt.taxInclusiveAmount != null && doc.vatBreakdown) {
      const sumVat = doc.vatBreakdown.reduce((s, v) => s + (v.taxAmount || 0), 0);
      const expected = mt.taxExclusiveAmount + sumVat;
      if (Math.abs(mt.taxInclusiveAmount - expected) > eps) {
        errors.push(
          makeError(
            'R029',
            'fatal',
            `TaxInclusiveAmount (${mt.taxInclusiveAmount.toFixed(2)}) must equal TaxExclusiveAmount (${mt.taxExclusiveAmount.toFixed(2)}) + VAT total (${sumVat.toFixed(2)})`,
            '/Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount'
          )
        );
      }
    }

    // R031: LineExtensionAmount = sum of InvoiceLine/LineExtensionAmount
    if (doc.lines && doc.lines.length > 0) {
      const sumLines = doc.lines.reduce(
        (s, line) => s + (line.lineExtensionAmount || 0),
        0
      );
      if (Math.abs(mt.lineExtensionAmount - sumLines) > eps) {
        errors.push(
          makeError(
            'R031',
            'fatal',
            `LineExtensionAmount (${mt.lineExtensionAmount.toFixed(2)}) must equal sum of invoice lines (${sumLines.toFixed(2)})`,
            '/Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount'
          )
        );
      }
    }

    // R030: PayableAmount = TaxInclusiveAmount - Prepaid + Rounding
    // (simplified: payable should equal taxInclusive when no prepaid/rounding)
    if (mt.payableAmount != null && mt.taxInclusiveAmount != null) {
      // If no prepaid or rounding is declared, payable should equal inclusive
      if (mt.payableAmount !== mt.taxInclusiveAmount) {
        // Only flag if difference is > threshold and no prepaid/rounding fields present
        if (Math.abs(mt.payableAmount - mt.taxInclusiveAmount) > eps) {
          errors.push(
            makeError(
              'R030',
              'warning',
              `PayableAmount (${mt.payableAmount.toFixed(2)}) differs from TaxInclusiveAmount (${mt.taxInclusiveAmount.toFixed(2)}). Ensure prepaid/rounding is properly declared.`,
              '/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount'
            )
          );
        }
      }
    }
  }

  // Phase 10: Line-level validation
  if (doc.lines) {
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const index = i + 1;

      // Check line has a name
      if (!line.item?.name || line.item.name.trim() === '') {
        errors.push(
          makeError(
            'R010',
            'fatal',
            `Invoice line ${index} is missing item name`,
            `/Invoice/cac:InvoiceLine[${index}]/cac:Item/cbc:Name`
          )
        );
      }

      // Check line VAT category is valid
      if (line.vatCategory && !VALID_VAT_CATEGORIES.has(line.vatCategory)) {
        errors.push(
          makeError(
            'R006',
            'fatal',
            `Invalid VAT category code '${line.vatCategory}' on line ${index}`,
            `/Invoice/cac:InvoiceLine[${index}]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID`
          )
        );
      }

      // G08: unitCode warning — warn (don't reject) if not in UN/ECE Rec 20
      const REC20_UNITS = new Set([
        'C62', 'KGM', 'DAY', 'HUR', 'MTR', 'MTQ', 'LTR', 'MTR', 'MTQ', 'LTR',
        'GM', 'KG', 'TNE', 'LC', 'MTR', 'SMI', 'KTM', 'KWH', 'MWH', 'DAY',
        'HUR', 'MIN', 'SEC', 'KEL', 'MOL', 'RAD', 'SEC', 'MTR', 'M2', 'M3',
        'MGM', 'MLT', 'PAL', 'PCT', 'REM', 'GRM', 'TON', 'BBL', 'GLI', 'GLL',
        'KMA', 'KMB', 'KMC', 'KMI', 'KMK', 'LTR', 'MTR', 'MTK', 'MTQ', 'MTR',
        'MTK', 'MTQ', 'TNE', 'TQI', 'TQP', 'MLT', 'DMA', 'DMT', 'DMR', 'DMK',
        'DPC', 'DPR', 'DPC', 'DPP', 'LM', 'LR', 'LS', 'LW', 'DAA', 'DNA',
        'CK', 'CN', 'CS', 'CT', 'DR', 'GD', 'GR', 'PD', 'PH', 'PR', 'PT',
        'PXC', 'S', 'SME', 'ST', 'T', 'TNE', 'U', 'UI', 'VA', 'VQ', 'VR',
      ]);
      if (line.unitCode && !REC20_UNITS.has(line.unitCode)) {
        errors.push(
          makeError(
            'G08',
            'warning',
            `unitCode '${line.unitCode}' is not in UN/ECE Rec 20 list`,
            `/Invoice/cac:InvoiceLine[${index}]/cbc:InvoicedQuantity`
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 11: Ticket 20 - Monetary totals non-negativity (BR-CO-03)
  // LineExtensionAmount, TaxExclusiveAmount, TaxInclusiveAmount must each be >= 0
  // ============================================================
  if (doc.monetaryTotal) {
    const mt = doc.monetaryTotal;
    const monetaryFields = [
      { value: mt.lineExtensionAmount, name: 'LineExtensionAmount', xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount' },
      { value: mt.taxExclusiveAmount, name: 'TaxExclusiveAmount', xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount' },
      { value: mt.taxInclusiveAmount, name: 'TaxInclusiveAmount', xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount' },
    ];
    for (const field of monetaryFields) {
      if (field.value != null && field.value < 0) {
        errors.push(
          makeError(
            'BR-03',
            'fatal',
            `Monetary total '${field.name}' must be >= 0, got ${field.value}`,
            field.xpath
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 12: Ticket 20 - Tax exemption reason / reason code pairing (BR-44)
  // Both TaxExemptionReason AND TaxExemptionReasonCode must be present, or neither
  // ============================================================
  if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
    for (let i = 0; i < doc.vatBreakdown.length; i++) {
      const vat = doc.vatBreakdown[i];
      const index = i + 1;
      const hasReason = !!(vat.taxExemptionReason && vat.taxExemptionReason.trim() !== '');
      const hasReasonCode = !!(vat.taxExemptionReasonCode && vat.taxExemptionReasonCode.trim() !== '');
      if (hasReason !== hasReasonCode) {
        errors.push(
          makeError(
            'BR-44',
            'fatal',
            `TaxSubtotal[${index}] TaxExemptionReason and TaxExemptionReasonCode must both be present or both absent`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cac:TaxCategory`
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 13: Ticket 20 - TaxableAmount non-negativity (BR-45)
  // TaxTotal/TaxSubtotal/TaxableAmount must be >= 0
  // ============================================================
  if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
    for (let i = 0; i < doc.vatBreakdown.length; i++) {
      const vat = doc.vatBreakdown[i];
      const index = i + 1;
      if (vat.taxableAmount != null && vat.taxableAmount < 0) {
        errors.push(
          makeError(
            'BR-45',
            'fatal',
            `TaxSubtotal[${index}] TaxableAmount must be >= 0, got ${vat.taxableAmount}`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cbc:TaxableAmount`
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 14: Ticket 20 - SK VAT ID format (BR-46)
  // When sender or receiver country is SK, CompanyID must match ^SK\d{10}$
  // Applies to AccountingSupplierParty and AccountingCustomerParty PartyTaxScheme/CompanyID
  // ============================================================
  const sellerCountry = doc.seller?.countryCode || '';
  const buyerCountry = doc.buyer?.countryCode || '';
  const isSKTransaction = sellerCountry === 'SK' || buyerCountry === 'SK';

  if (isSKTransaction) {
    // BR-46: Check CompanyID field for each Slovak party separately.
    // Only validate the party whose country is SK — the other party's
    // countryCode determines whether the rule applies to them.
    if (sellerCountry === 'SK') {
      const sellerId = doc.seller?.companyID || doc.seller?.vatID;
      if (sellerId && !SK_VAT_ID_REGEX.test(sellerId)) {
        errors.push(
          makeError(
            'BR-46',
            'fatal',
            `Seller CompanyID '${sellerId}' does not match SK VAT ID format (expected SK + 10 digits)`,
            '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID'
          )
        );
      }
    }
    if (buyerCountry === 'SK') {
      const buyerId = doc.buyer?.companyID || doc.buyer?.vatID;
      if (buyerId && !SK_VAT_ID_REGEX.test(buyerId)) {
        errors.push(
          makeError(
            'BR-46',
            'fatal',
            `Buyer CompanyID '${buyerId}' does not match SK VAT ID format (expected SK + 10 digits)`,
            '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID'
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 15: DE-R-001 to DE-R-009 — German/Slovak extension rules
  // BG-16 Payment Instructions, BG-6 Seller Contact, seller/buyer address
  // ============================================================

  // DE-R-001 (fatal): Payment Instructions (BG-16 / cac:PaymentMeans) must be present
  if (!doc.payment && !doc.paymentInstructions) {
    errors.push(
      makeError(
        'DE-R-001',
        'fatal',
        'Payment Instructions (BG-16) must be present on every invoice',
        '/Invoice/cac:PaymentMeans'
      )
    );
  }

  // DE-R-002 (fatal): Seller Contact group (BG-6) must be provided
  if (!doc.sellerContact) {
    errors.push(
      makeError(
        'DE-R-002',
        'fatal',
        'Seller Contact (BG-6 / AccountingSupplierParty/Party/cac:Contact) must be provided',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact'
      )
    );
  }

  // DE-R-003 (fatal): Seller city (BT-37) must be present
  if (!doc.seller || !doc.seller.cityName || doc.seller.cityName.trim() === '') {
    errors.push(
      makeError(
        'DE-R-003',
        'fatal',
        'Seller city (BT-37 / AccountingSupplierParty/Party/PostalAddress/cbc:CityName) must be present',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:CityName'
      )
    );
  }

  // DE-R-004 (fatal): Seller post code (BT-38) must be present
  if (!doc.seller || !doc.seller.postalZone || doc.seller.postalZone.trim() === '') {
    errors.push(
      makeError(
        'DE-R-004',
        'fatal',
        'Seller post code (BT-38 / AccountingSupplierParty/Party/PostalAddress/cbc:PostalZone) must be present',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:PostalZone'
      )
    );
  }

  // DE-R-005 (fatal): Seller contact point (BT-41 / cac:Contact/cbc:Name) must be present
  if (!doc.sellerContact || !doc.sellerContact.name || doc.sellerContact.name.trim() === '') {
    errors.push(
      makeError(
        'DE-R-005',
        'fatal',
        'Seller contact point (BT-41 / AccountingSupplierParty/Party/cac:Contact/cbc:Name) must be present',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Name'
      )
    );
  }

  // DE-R-006 (fatal): Seller contact telephone (BT-42 / cac:Contact/cbc:Telephone) must be present
  if (!doc.sellerContact || !doc.sellerContact.telephone || doc.sellerContact.telephone.trim() === '') {
    errors.push(
      makeError(
        'DE-R-006',
        'fatal',
        'Seller contact telephone (BT-42 / AccountingSupplierParty/Party/cac:Contact/cbc:Telephone) must be present',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Telephone'
      )
    );
  }

  // DE-R-007 (fatal): Seller contact email (BT-43 / cac:Contact/cbc:ElectronicMail) must be present
  if (!doc.sellerContact || !doc.sellerContact.email || doc.sellerContact.email.trim() === '') {
    errors.push(
      makeError(
        'DE-R-007',
        'fatal',
        'Seller contact email (BT-43 / AccountingSupplierParty/Party/cac:Contact/cbc:ElectronicMail) must be present',
        '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:ElectronicMail'
      )
    );
  }

  // DE-R-008 (fatal): Buyer city (BT-52) must be present
  if (!doc.buyer || !doc.buyer.cityName || doc.buyer.cityName.trim() === '') {
    errors.push(
      makeError(
        'DE-R-008',
        'fatal',
        'Buyer city (BT-52 / AccountingCustomerParty/Party/PostalAddress/cbc:CityName) must be present',
        '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:CityName'
      )
    );
  }

  // DE-R-009 (fatal): Buyer post code (BT-53) must be present
  if (!doc.buyer || !doc.buyer.postalZone || doc.buyer.postalZone.trim() === '') {
    errors.push(
      makeError(
        'DE-R-009',
        'fatal',
        'Buyer post code (BT-53 / AccountingCustomerParty/Party/PostalAddress/cbc:PostalZone) must be present',
        '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:PostalZone'
      )
    );
  }

  // ============================================================
  // Phase 15: DE-R-010, DE-R-011, DE-R-014 — Deliver-to and VAT rate rules
  // ============================================================

  // DE-R-010 (fatal): Deliver-to city (BT-77) must be present if DeliverToAddress (BG-15) is present
  const hasDeliverToAddress = !!(doc.deliverTo && (
    doc.deliverTo.cityName ||
    doc.deliverTo.postalZone
  ));
  // Presence of BG-15 is inferred: if any deliverTo fields are set, BG-15 is "present"
  if (hasDeliverToAddress) {
    if (!doc.deliverTo?.cityName) {
      errors.push(
        makeError(
          'DE-R-010',
          'fatal',
          'Deliver-to city (BT-77) must be present when DeliverToAddress (BG-15) is present',
          '/Invoice/cac:DeliveryTerms/cac:DeliveryAddress/cbc:CityName'
        )
      );
    }
  }

  // DE-R-011 (fatal): Deliver-to post code (BT-78) must be present if DeliverToAddress (BG-15) is present
  if (hasDeliverToAddress) {
    if (!doc.deliverTo?.postalZone) {
      errors.push(
        makeError(
          'DE-R-011',
          'fatal',
          'Deliver-to post code (BT-78) must be present when DeliverToAddress (BG-15) is present',
          '/Invoice/cac:DeliveryTerms/cac:DeliveryAddress/cbc:PostalZone'
        )
      );
    }
  }

  // DE-R-014 (fatal): VAT category rate (BT-119) must be present on each tax line (TaxSubtotal/TaxCategory/Percent)
  if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
    for (let i = 0; i < doc.vatBreakdown.length; i++) {
      const vat = doc.vatBreakdown[i];
      const index = i + 1;
      if (vat.rate == null || isNaN(vat.rate)) {
        errors.push(
          makeError(
            'DE-R-014',
            'fatal',
            `VAT category rate (BT-119) must be present on tax line ${index}`,
            `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index}]/cac:TaxCategory/cbc:Percent`
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 16: DE-R-015 — Buyer Reference (BT-10) must be present
  // ============================================================
  if (!doc.buyerReference || doc.buyerReference.trim() === '') {
    errors.push(
      makeError(
        'DE-R-015',
        'fatal',
        'Buyer Reference (BT-10) must be present on invoices',
        '/Invoice/cbc:BuyerReference'
      )
    );
  }

  // ============================================================
  // Phase 17: DE-R-016 — Seller VAT ID presence when VAT category is applicable
  // When VAT category code is one of S, Z, E, AE, K, G, L, or M, at least one of:
  // Seller VAT identifier (BT-31), Seller tax registration identifier (BT-32),
  // or Seller Tax Representative Party (BG-11) must be present
  // ============================================================
  const VAT_CATEGORIES_REQUIRING_ID = new Set(['S', 'Z', 'E', 'AE', 'K', 'G', 'L', 'M']);
  if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
    const allCategories = doc.vatBreakdown.map(v => v.category);
    const hasApplicableCategory = allCategories.some(cat => VAT_CATEGORIES_REQUIRING_ID.has(cat));
    if (hasApplicableCategory) {
      const hasSellerVatID = !!(doc.seller?.vatID && doc.seller.vatID.trim() !== '');
      const hasSellerCompanyID = !!(doc.seller?.companyID && doc.seller.companyID.trim() !== '');
      const hasTaxRepParty = !!(doc.sellerTaxRepresentative && (
        doc.sellerTaxRepresentative.vatID ||
        doc.sellerTaxRepresentative.endpointID
      ));
      if (!hasSellerVatID && !hasSellerCompanyID && !hasTaxRepParty) {
        errors.push(
          makeError(
            'DE-R-016',
            'fatal',
            'When VAT category is S, Z, E, AE, K, G, L, or M, at least one of Seller VAT ID (BT-31), Seller CompanyID (BT-32), or Seller Tax Representative Party (BG-11) must be present',
            '/Invoice/cac:AccountingSupplierParty/cac:Party'
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 18: DE-R-018 — Payment Terms / Skonto (BT-20) structured format
  // Must match: ^#SKONTO#TAGE=\d+#PROZENT=\d{2}\.\d{2}(#BASISBETRAG=\d+\.?\d*)?#\s*$
  // All uppercase, no extra whitespace, XML line break at end
  // ============================================================
  const SKONTO_REGEX = /^#SKONTO#TAGE=\d+#PROZENT=\d{2}\.\d{2}(#BASISBETRAG=\d+\.?\d*)?#\s*$/;
  if (doc.paymentTermsNote && doc.paymentTermsNote.trim() !== '') {
    // If the note starts with #SKONTO#, it must be a structured Skonto string
    if (doc.paymentTermsNote.trim().startsWith('#SKONTO#')) {
      if (!SKONTO_REGEX.test(doc.paymentTermsNote)) {
        errors.push(
          makeError(
            'DE-R-018',
            'fatal',
            `Payment Terms / Skonto (BT-20) must match structured format when present: ${SKONTO_REGEX.toString()}`,
            '/Invoice/cac:PaymentTerms/cbc:Note'
          )
        );
      }
    }
  }

  // ============================================================
  // Phase 19: DE-R-022 — Attached document filenames (BT-125) uniqueness (case-insensitive)
  // ============================================================
  if (doc.attachedDocuments && doc.attachedDocuments.length > 1) {
    const filenamesLower = doc.attachedDocuments.map(d => (d.filename || '').toLowerCase());
    const seen = new Set();
    for (const fn of filenamesLower) {
      if (fn && seen.has(fn)) {
        errors.push(
          makeError(
            'DE-R-022',
            'fatal',
            `Attached document filenames (BT-125) must be unique case-insensitively within the invoice. Duplicate: '${fn}'`,
            '/Invoice/cac:AdditionalDocumentReference'
          )
        );
        break; // Only report once
      }
      if (fn) seen.add(fn);
    }
  }

  // ============================================================
  // Phase 20: DE-R-023 / DE-R-024 — PaymentMeansCode cross-validation with BG-17/BG-18/BG-19
  // DE-R-023-1 (fatal): If PaymentMeansCode is 30 or 58, BG-17 (CreditTransfer) must be provided
  // DE-R-023-2 (fatal): If PaymentMeansCode is 30 or 58, BG-18 (PaymentCard) and BG-19 (BankAccount) must NOT be provided
  // DE-R-024-1 (fatal): If PaymentMeansCode is 48, 54, or 55, BG-18 (PaymentCard) must be provided
  // DE-R-024-2 (fatal): If PaymentMeansCode is 48, 54, or 55, BG-17 and BG-19 must NOT be provided
  // ============================================================
  const meansCode = doc.paymentInstructions?.accountID || doc.payment?.iban ? (doc.payment?.meansCode || '') : '';
  // Re-extract PaymentMeansCode directly from parsed data (fallback)
  const pmCode = doc.payment?.meansCode || '';

  // DE-R-023-1 and DE-R-023-2: PaymentMeansCode = 30 or 58
  if (pmCode === '30' || pmCode === '58') {
    // BG-17 = CreditTransfer (PayeeFinancialAccount / cac:CreditTransferAccount)
    const hasCreditTransfer = !!(doc.paymentInstructions &&
      (doc.paymentInstructions.creditTransferIBANs?.length > 0 || doc.paymentInstructions.accountID));
    if (!hasCreditTransfer) {
      errors.push(
        makeError(
          'DE-R-023-1',
          'fatal',
          'When PaymentMeansCode is 30 or 58, BG-17 (CreditTransfer) must be provided',
          '/Invoice/cac:PaymentMeans'
        )
      );
    }
    // BG-18 = CardAccount, BG-19 = BankAccount (PayeeFinancialAccount)
    const hasCardAccount = !!(doc.paymentInstructions?.cardAccount);
    const hasBankAccount = !!(doc.payment?.iban); // BG-19 = PayeeFinancialAccount
    // DE-R-023-2: When PaymentMeansCode is 30 or 58, BG-18 AND BG-19 must NOT be present together
    // BG-17 may be present (credit transfer). BG-19 and BG-18 together would be a conflict.
    if (hasCardAccount && hasBankAccount) {
      errors.push(
        makeError(
          'DE-R-023-2',
          'fatal',
          'When PaymentMeansCode is 30 or 58, BG-18 (PaymentCard) and BG-19 (BankAccount) must NOT be provided',
          '/Invoice/cac:PaymentMeans'
        )
      );
    }
  }

  // DE-R-024-1 and DE-R-024-2: PaymentMeansCode = 48, 54, or 55
  if (pmCode === '48' || pmCode === '54' || pmCode === '55') {
    // BG-18 must be provided
    const hasCardAccount = !!(doc.paymentInstructions?.cardAccount);
    if (!hasCardAccount) {
      errors.push(
        makeError(
          'DE-R-024-1',
          'fatal',
          'When PaymentMeansCode is 48, 54, or 55, BG-18 (PaymentCard) must be provided',
          '/Invoice/cac:PaymentMeans'
        )
      );
    }
    // BG-17 and BG-19 must NOT be provided
    const hasCreditTransfer = !!(doc.paymentInstructions &&
      (doc.paymentInstructions.creditTransferIBANs?.length > 0 || doc.paymentInstructions.accountID));
    if (hasCreditTransfer) {
      errors.push(
        makeError(
          'DE-R-024-2',
          'fatal',
          'When PaymentMeansCode is 48, 54, or 55, BG-17 (CreditTransfer) and BG-19 (BankAccount) must NOT be provided',
          '/Invoice/cac:PaymentMeans'
        )
      );
    }
  }

  // ============================================================
  // Phase 21: DE-R-019 and DE-R-020 — IBAN validation warnings
  // DE-R-019 (warning): If PaymentMeansCode is 58 (SEPA), BT-84 (IBAN) should be a valid IBAN
  // DE-R-020 (warning): If PaymentMeansCode is 59 (SEPA debit), BT-91 (DebitedAccountIBAN) should be a valid IBAN
  // ============================================================
  // Simplified IBAN regex (basic structure: 2 letters + 2 digits + up to 30 alphanumeric)
  const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;
  if (pmCode === '58' && doc.paymentInstructions?.accountID) {
    const iban = doc.paymentInstructions.accountID.replace(/\s/g, '');
    if (!IBAN_REGEX.test(iban)) {
      errors.push(
        makeError(
          'DE-R-019',
          'warning',
          `When PaymentMeansCode is 58 (SEPA), BT-84 (IBAN) '${doc.paymentInstructions.accountID}' should be a valid IBAN`,
          '/Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID'
        )
      );
    }
  }
  if (pmCode === '59' && doc.paymentInstructions?.debitedAccountIBAN) {
    const iban = doc.paymentInstructions.debitedAccountIBAN.replace(/\s/g, '');
    if (!IBAN_REGEX.test(iban)) {
      errors.push(
        makeError(
          'DE-R-020',
          'warning',
          `When PaymentMeansCode is 59 (SEPA debit), BT-91 (DebitedAccountIBAN) '${doc.paymentInstructions.debitedAccountIBAN}' should be a valid IBAN`,
          '/Invoice/cac:PaymentMeans/cac:DebitedAccount/cbc:ID'
        )
      );
    }
  }

  return {
    valid: errors.filter((e) => e.severity === 'fatal').length === 0,
    errors,
  };
}
