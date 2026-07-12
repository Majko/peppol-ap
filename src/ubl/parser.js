/**
 * UBL XML Parser module
 * Parses Peppol BIS Billing 3.0 UBL XML to internal JSON format
 */

import { XMLParser } from 'fast-xml-parser';

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
};

function createParser() {
  return new XMLParser({
    ...XML_OPTIONS,
    // Preserve string values - don't auto-parse numbers
    parseTagValue: false,
  });
}

/**
 * Safely extract a value from a possibly-nested object path
 */
function getVal(obj, ...keys) {
  for (const key of keys) {
    if (obj == null) return undefined;
    if (typeof key === 'string') {
      obj = obj[key];
    }
  }
  // If the result is an object with only attributes (no #text), return empty string
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    const hasOnlyAttrs = keys.length > 0 && keys.every(k => k.startsWith('@_'));
    if (hasOnlyAttrs) return '';
  }
  return obj;
}

/**
 * Ensure a value is an array (XML parser may return single object for single element)
 */
function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parse a UBL XML document into our internal format
 * Supports both Invoice and CreditNote
 */
export function parseUBL(xmlString) {
  const parser = createParser();
  const doc = parser.parse(xmlString);

  // Determine document type
  const invoice = doc['Invoice'] || doc['CreditNote'] || null;
  if (!invoice) {
    throw new Error('Not a valid UBL Invoice or CreditNote document');
  }

  const isCreditNote = !!doc['CreditNote'];
  const cac = isCreditNote ? 'CreditNote' : 'Invoice';

  const result = {
    id: getVal(invoice, 'cbc:ID') || '',
    issueDate: getVal(invoice, 'cbc:IssueDate') || '',
    dueDate: getVal(invoice, 'cbc:DueDate') || '',
    taxPointDate: getVal(invoice, 'cbc:TaxPointDate') || '',
    invoiceTypeCode: getVal(invoice, 'cbc:InvoiceTypeCode') || '380',
    currencyCode: getVal(invoice, 'cbc:DocumentCurrencyCode') || 'EUR',
    buyerReference: getVal(invoice, 'cbc:BuyerReference') || '',
    customizationID: getVal(invoice, 'cbc:CustomizationID') || '',
    profileID: getVal(invoice, 'cbc:ProfileID') || '',
    isCreditNote,
  };

  // Extract InvoicePeriod if present
  const invoicePeriod = getVal(invoice, 'cac:InvoicePeriod');
  if (invoicePeriod) {
    result.invoicePeriod = {
      startDate: getVal(invoicePeriod, 'cbc:StartDate') || '',
      endDate: getVal(invoicePeriod, 'cbc:EndDate') || '',
    };
  }

  // Extract seller (AccountingSupplierParty)
  const supplierParty = getVal(invoice, 'cac:AccountingSupplierParty', 'cac:Party');
  if (supplierParty) {
    result.seller = {
      endpointID: getVal(supplierParty, 'cbc:EndpointID', '#text') || getVal(supplierParty, 'cbc:EndpointID') || '',
      endpointSchemeID: getVal(supplierParty, 'cbc:EndpointID', '@_schemeID') || '',
      name: getVal(supplierParty, 'cac:PartyName', 'cbc:Name') || '',
      legalRegistrationName:
        getVal(supplierParty, 'cac:PartyLegalEntity', 'cbc:RegistrationName') || '',
      companyID:
        getVal(supplierParty, 'cac:PartyTaxScheme', 'cbc:CompanyID', '#text') ||
        getVal(supplierParty, 'cac:PartyTaxScheme', 'cbc:CompanyID') ||
        getVal(supplierParty, 'cac:PartyLegalEntity', 'cbc:CompanyID', '#text') ||
        getVal(supplierParty, 'cac:PartyLegalEntity', 'cbc:CompanyID') || '',
      vatID: getVal(supplierParty, 'cac:PartyTaxScheme', 'cbc:CompanyID') || '',
      streetName: getVal(supplierParty, 'cac:PostalAddress', 'cbc:StreetName') || '',
      cityName: getVal(supplierParty, 'cac:PostalAddress', 'cbc:CityName') || '',
      postalZone: getVal(supplierParty, 'cac:PostalAddress', 'cbc:PostalZone') || '',
      countryCode:
        getVal(supplierParty, 'cac:PostalAddress', 'cac:Country', 'cbc:IdentificationCode') || '',
    };
  }

  // Extract buyer (AccountingCustomerParty)
  const customerParty = getVal(invoice, 'cac:AccountingCustomerParty', 'cac:Party');
  if (customerParty) {
    result.buyer = {
      endpointID: getVal(customerParty, 'cbc:EndpointID', '#text') || getVal(customerParty, 'cbc:EndpointID') || '',
      endpointSchemeID: getVal(customerParty, 'cbc:EndpointID', '@_schemeID') || '',
      name: getVal(customerParty, 'cac:PartyName', 'cbc:Name') || '',
      legalRegistrationName:
        getVal(customerParty, 'cac:PartyLegalEntity', 'cbc:RegistrationName') || '',
      companyID:
        getVal(customerParty, 'cac:PartyTaxScheme', 'cbc:CompanyID', '#text') ||
        getVal(customerParty, 'cac:PartyTaxScheme', 'cbc:CompanyID') ||
        getVal(customerParty, 'cac:PartyLegalEntity', 'cbc:CompanyID', '#text') ||
        getVal(customerParty, 'cac:PartyLegalEntity', 'cbc:CompanyID') || '',
      companyIDSchemeID:
        getVal(customerParty, 'cac:PartyTaxScheme', 'cbc:CompanyID', '@_schemeID') ||
        getVal(customerParty, 'cac:PartyLegalEntity', 'cbc:CompanyID', '@_schemeID') || '',
      vatID: getVal(customerParty, 'cac:PartyTaxScheme', 'cbc:CompanyID') || '',
      streetName: getVal(customerParty, 'cac:PostalAddress', 'cbc:StreetName') || '',
      cityName: getVal(customerParty, 'cac:PostalAddress', 'cbc:CityName') || '',
      postalZone: getVal(customerParty, 'cac:PostalAddress', 'cbc:PostalZone') || '',
      countryCode:
        getVal(customerParty, 'cac:PostalAddress', 'cac:Country', 'cbc:IdentificationCode') || '',
    };
  }

  // Extract payment
  const paymentMeans = getVal(invoice, 'cac:PaymentMeans');
  if (paymentMeans) {
    result.payment = {
      meansCode: getVal(paymentMeans, 'cbc:PaymentMeansCode') || '',
      iban: getVal(paymentMeans, 'cac:PayeeFinancialAccount', 'cbc:ID') || '',
      bic: getVal(paymentMeans, 'cac:PayeeFinancialAccount', 'cac:FinancialInstitutionBranch', 'cbc:ID') || '',
    };
  }

  // Extract VAT breakdown
  const taxTotal = getVal(invoice, 'cac:TaxTotal');
  if (taxTotal) {
    result.vatTotal = parseFloat(getVal(taxTotal, 'cbc:TaxAmount', '#text') || getVal(taxTotal, 'cbc:TaxAmount') || '0');
    const subtotals = ensureArray(getVal(taxTotal, 'cac:TaxSubtotal'));
    result.vatBreakdown = subtotals.map((st) => {
      const taxCategory = getVal(st, 'cac:TaxCategory') || {};
      return {
        taxableAmount: parseFloat(getVal(st, 'cbc:TaxableAmount', '#text') || getVal(st, 'cbc:TaxableAmount') || '0'),
        taxAmount: parseFloat(getVal(st, 'cbc:TaxAmount', '#text') || getVal(st, 'cbc:TaxAmount') || '0'),
        category: getVal(taxCategory, 'cbc:ID') || '',
        rate: parseFloat(getVal(taxCategory, 'cbc:Percent') || '0'),
        taxExemptionReason: getVal(taxCategory, 'cbc:TaxExemptionReason') || '',
        taxExemptionReasonCode: getVal(taxCategory, 'cbc:TaxExemptionReasonCode') || '',
      };
    });
  }

  // Extract monetary totals
  const monetaryTotal = getVal(invoice, 'cac:LegalMonetaryTotal');
  if (monetaryTotal) {
    result.monetaryTotal = {
      lineExtensionAmount: parseFloat(getVal(monetaryTotal, 'cbc:LineExtensionAmount', '#text') || getVal(monetaryTotal, 'cbc:LineExtensionAmount') || '0'),
      taxExclusiveAmount: parseFloat(getVal(monetaryTotal, 'cbc:TaxExclusiveAmount', '#text') || getVal(monetaryTotal, 'cbc:TaxExclusiveAmount') || '0'),
      taxInclusiveAmount: parseFloat(getVal(monetaryTotal, 'cbc:TaxInclusiveAmount', '#text') || getVal(monetaryTotal, 'cbc:TaxInclusiveAmount') || '0'),
      allowanceTotalAmount: parseFloat(getVal(monetaryTotal, 'cbc:AllowanceTotalAmount', '#text') || getVal(monetaryTotal, 'cbc:AllowanceTotalAmount') || '0'),
      chargeTotalAmount: parseFloat(getVal(monetaryTotal, 'cbc:ChargeTotalAmount', '#text') || getVal(monetaryTotal, 'cbc:ChargeTotalAmount') || '0'),
      payableAmount: parseFloat(getVal(monetaryTotal, 'cbc:PayableAmount', '#text') || getVal(monetaryTotal, 'cbc:PayableAmount') || '0'),
    };
  }

  // Extract invoice lines
  const rawLines = ensureArray(getVal(invoice, 'cac:InvoiceLine'));
  result.lines = rawLines.map((line) => {
    const item = getVal(line, 'cac:Item') || {};
    const price = getVal(line, 'cac:Price') || {};
    const taxCategory = getVal(item, 'cac:ClassifiedTaxCategory') || {};

    return {
      id: parseInt(getVal(line, 'cbc:ID') || '0', 10),
      quantity: parseFloat(getVal(line, 'cbc:InvoicedQuantity', '#text') || getVal(line, 'cbc:InvoicedQuantity') || '0'),
      unitCode: getVal(line, 'cbc:InvoicedQuantity', '@_unitCode') || 'C62',
      lineExtensionAmount: parseFloat(getVal(line, 'cbc:LineExtensionAmount', '#text') || getVal(line, 'cbc:LineExtensionAmount') || '0'),
      itemName: getVal(item, 'cbc:Name') || '',
      vatCategory: getVal(taxCategory, 'cbc:ID') || '',
      vatRate: parseFloat(getVal(taxCategory, 'cbc:Percent') || '0'),
      priceAmount: parseFloat(getVal(price, 'cbc:PriceAmount', '#text') || getVal(price, 'cbc:PriceAmount') || '0'),
    };
  });

  return result;
}
