/**
 * UBL Validator module
 * Implements Peppol BIS Billing 3.0 business rule validation
 * Validates structure, mandatory fields, cross-field math, and code lists
 */

import { parseUBL } from './parser.js';

// Allowed code lists
const VALID_INVOICE_TYPE_CODES = new Set([
  '380', // Invoice
  '381', // Credit note
  '383', // Corrected invoice
  '384', // Self-billed invoice
  '386', // Prepayment invoice
  '389', // Self-billed credit note
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

  // Phase 4: Check invoice type code (R003)
  if (doc.invoiceTypeCode && !VALID_INVOICE_TYPE_CODES.has(doc.invoiceTypeCode)) {
    errors.push(
      makeError(
        'R003',
        'fatal',
        `Invalid invoice type code: ${doc.invoiceTypeCode}. Allowed: ${Array.from(VALID_INVOICE_TYPE_CODES).join(', ')}`,
        '/Invoice/cbc:InvoiceTypeCode'
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
      if (!line.itemName || line.itemName.trim() === '') {
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
    }
  }

  return {
    valid: errors.filter((e) => e.severity === 'fatal').length === 0,
    errors,
  };
}
