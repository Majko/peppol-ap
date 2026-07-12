# 20 — UBL Validator: Missing Monetary/Tax/VAT Rules (SPEC GAP)

**What to build:** Five validation rules from PRD 0004 / ticket 11 that were not implemented in the 18-ticket batch.

**Status:** ready-for-agent

- [ ] Monetary totals non-negativity: `LegalMonetaryTotal/LineExtensionAmount`, `LegalMonetaryTotal/TaxExclusiveAmount`, `LegalMonetaryTotal/TaxInclusiveAmount` must each be ≥ 0. Produce error with rule ID (e.g., `BR-03`).
- [ ] Tax exemption reason code: when `TaxTotal/TaxSubtotal/TaxCategory/ClassifiedTaxCategory/TaxExemptionReason` is present, `TaxExemptionReasonCode` must also be present (or vice versa — both or neither). Produce error.
- [ ] `TaxableAmount` sign: `TaxTotal/TaxSubtotal/TaxableAmount` must be ≥ 0. Produce error.
- [ ] SK VAT ID format: when sender or receiver country is SK, `AccountingSupplierParty/Party/PartyTaxScheme/CompanyID` and `AccountingCustomerParty/Party/PartyTaxScheme/CompanyID` must match `^SK\d{10}$`. Produce error.
- [ ] Rule IDs follow BIS 3.0 naming where applicable.
- [ ] Slovakia rules only applied when sender or receiver country = SK (same guard as existing SK-specific logic).
- [ ] Simulation mode: same validation rules apply (no exemptions).
- [ ] Regression test from ticket 01 continues to pass.

**Reference:** PRD 0004 §B1, §B2, ticket 11.
