/**
 * UBL XML Generator module
 * Builds Peppol BIS Billing 3.0 compliant UBL XML from internal JSON format
 * Supports Invoice and CreditNote documents
 */

/**
 * Escape XML special characters in a string
 */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format a number to 2 decimal places
 */
function fmt(num) {
  if (num == null) return '0.00';
  return Number(num).toFixed(2);
}

/**
 * Build the UBL XML header elements
 */
function buildHeader(data, docType) {
  return `
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(data.id)}</cbc:ID>
  <cbc:IssueDate>${esc(data.issueDate)}</cbc:IssueDate>
  ${data.dueDate ? `<cbc:DueDate>${esc(data.dueDate)}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>${esc(data.invoiceTypeCode)}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${esc(data.currencyCode || 'EUR')}</cbc:DocumentCurrencyCode>
  ${data.buyerReference ? `<cbc:BuyerReference>${esc(data.buyerReference)}</cbc:BuyerReference>` : ''}`;
}

/**
 * Build the seller (AccountingSupplierParty) section
 */
function buildSeller(seller) {
  if (!seller) return '';

  return `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="${esc(seller.endpointSchemeID || '9914')}">${esc(seller.endpointID)}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${esc(seller.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        ${seller.streetName ? `<cbc:StreetName>${esc(seller.streetName)}</cbc:StreetName>` : ''}
        ${seller.cityName ? `<cbc:CityName>${esc(seller.cityName)}</cbc:CityName>` : ''}
        ${seller.postalZone ? `<cbc:PostalZone>${esc(seller.postalZone)}</cbc:PostalZone>` : ''}
        <cac:Country>
          <cbc:IdentificationCode>${esc(seller.countryCode || 'SK')}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        ${seller.companyID ? `<cbc:CompanyID>${esc(seller.companyID)}</cbc:CompanyID>` : (seller.vatID ? `<cbc:CompanyID>${esc(seller.vatID)}</cbc:CompanyID>` : '')}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(seller.legalRegistrationName || seller.name)}</cbc:RegistrationName>
        ${seller.companyID && !seller.vatID ? `<cbc:CompanyID>${esc(seller.companyID)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

/**
 * Build the buyer (AccountingCustomerParty) section
 */
function buildBuyer(buyer) {
  if (!buyer) return '';

  const companyIDScheme = buyer.companyIDSchemeID ? ` schemeID="${esc(buyer.companyIDSchemeID)}"` : '';

  return `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="${esc(buyer.endpointSchemeID || '9914')}">${esc(buyer.endpointID)}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${esc(buyer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        ${buyer.streetName ? `<cbc:StreetName>${esc(buyer.streetName)}</cbc:StreetName>` : ''}
        ${buyer.cityName ? `<cbc:CityName>${esc(buyer.cityName)}</cbc:CityName>` : ''}
        ${buyer.postalZone ? `<cbc:PostalZone>${esc(buyer.postalZone)}</cbc:PostalZone>` : ''}
        <cac:Country>
          <cbc:IdentificationCode>${esc(buyer.countryCode || 'SK')}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        ${buyer.companyID ? `<cbc:CompanyID>${esc(buyer.companyID)}</cbc:CompanyID>` : (buyer.vatID ? `<cbc:CompanyID>${esc(buyer.vatID)}</cbc:CompanyID>` : '')}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(buyer.legalRegistrationName || buyer.name)}</cbc:RegistrationName>
        ${buyer.companyID && !buyer.vatID ? `<cbc:CompanyID${companyIDScheme}>${esc(buyer.companyID)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

/**
 * Build the payment section
 */
function buildPayment(payment) {
  if (!payment) return '';

  return `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${esc(payment.meansCode || '30')}</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(payment.iban)}</cbc:ID>
      ${payment.bic ? `
      <cac:FinancialInstitutionBranch>
        <cbc:ID>${esc(payment.bic)}</cbc:ID>
      </cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`;
}

/**
 * Build VAT breakdown section
 */
function buildVAT(vatBreakdown) {
  if (!vatBreakdown || vatBreakdown.length === 0) return '';

  const vatTotal = vatBreakdown.reduce((sum, v) => sum + (v.taxAmount || 0), 0);

  let xml = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${fmt(vatTotal)}</cbc:TaxAmount>`;

  for (const vat of vatBreakdown) {
    xml += `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${fmt(vat.taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${fmt(vat.taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${esc(vat.category)}</cbc:ID>
        <cbc:Percent>${fmt(vat.rate)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
  }

  xml += `
  </cac:TaxTotal>`;

  return xml;
}

/**
 * Build monetary totals section
 */
function buildMonetaryTotal(mt) {
  if (!mt) return '';

  return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${fmt(mt.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${fmt(mt.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${fmt(mt.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>
    ${mt.allowanceTotalAmount ? `<cbc:AllowanceTotalAmount currencyID="EUR">${fmt(mt.allowanceTotalAmount)}</cbc:AllowanceTotalAmount>` : ''}
    ${mt.chargeTotalAmount ? `<cbc:ChargeTotalAmount currencyID="EUR">${fmt(mt.chargeTotalAmount)}</cbc:ChargeTotalAmount>` : ''}
    <cbc:PayableAmount currencyID="EUR">${fmt(mt.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

/**
 * Build invoice lines section
 */
function buildLines(lines, currencyCode) {
  if (!lines || lines.length === 0) return '';
  const cc = currencyCode || 'EUR';

  let xml = '';

  for (const line of lines) {
    xml += `
  <cac:InvoiceLine>
    <cbc:ID>${esc(String(line.id))}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(line.unitCode || 'C62')}">${fmt(line.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cc}">${fmt(line.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(line.itemName)}</cbc:Name>
      ${line.originCountry ? `<cac:OriginCountry><cbc:IdentificationCode>${esc(line.originCountry)}</cbc:IdentificationCode></cac:OriginCountry>` : ''}
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${esc(line.vatCategory)}</cbc:ID>
        <cbc:Percent>${fmt(line.vatRate)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${cc}">${fmt(line.priceAmount)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }

  return xml;
}

/**
 * Build the complete UBL document
 * @param {Object} data - Invoice/CreditNote data in internal format
 * @param {string} docType - 'Invoice' or 'CreditNote'
 * @returns {string} UBL XML string
 */
function buildDocument(data, docType) {
  const rootTag = docType === 'CreditNote' ? 'CreditNote' : 'Invoice';
  const ns = `urn:oasis:names:specification:ubl:schema:xsd:${rootTag}-2`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag} xmlns="${ns}"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">${buildHeader(data, docType)}${buildSeller(data.seller)}${buildBuyer(data.buyer)}${buildPayment(data.payment)}${buildVAT(data.vatBreakdown, data.currencyCode)}${buildMonetaryTotal(data.monetaryTotal, data.currencyCode)}${buildLines(data.lines, data.currencyCode)}
</${rootTag}>`;

  return xml;
}

/**
 * Generate a UBL Invoice XML from the given data
 */
export function generateInvoice(data) {
  return buildDocument(data, 'Invoice');
}

/**
 * Generate a UBL CreditNote XML from the given data
 */
export function generateCreditNote(data) {
  return buildDocument(data, 'CreditNote');
}
