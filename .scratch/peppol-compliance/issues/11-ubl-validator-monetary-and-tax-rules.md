# 11 — UBL Validator: Monetary Totals, Tax Exemption, TaxableAmount

**What to build:** Expand `src/ubl/validator.js` with rules for monetary totals non-negativity, VAT exemption reason codes, and `TaxableAmount` sign validation. These catch invoices with impossible accounting values that Testbed will flag.

This closes G05 (monetary totals non-negativity), G06 (tax exemption reason codes), G07 (TaxableAmount sign).

**Blocked by:** 10 (validator core rules in place)

**Status:** ready-for-agent

- [ ] `LineExtensionAmount` and `TaxExclusiveAmount` and `TaxInclusiveAmount` in `LegalMonetaryTotal` must be non-negative (≥ 0); negative values produce validation errors
- [ ] When `TaxCategory/ClassifiedTaxCategory/TaxScheme/ID` is `VAT` and `TaxCategory/Percent` is 0 (exempt), `TaxCategory/TaxExemptionReason` must be present and non-empty
- [ ] Each `TaxSubtotal/TaxableAmount` must be non-negative; negative tax bases produce validation errors
- [ ] `AllowanceChargeAmount` on `AllowanceCharge` must be non-negative
- [ ] Validation errors include descriptive messages (e.g., "TaxableAmount may not be negative")
- [ ] **SK VAT ID rule**: `SK` followed by exactly 10 digits, applied when seller or buyer country is `SK` (G04 — PA SK accreditation requirement)
- [ ] Simulation mode: same validation rules apply
- [ ] Regression test from ticket 01 continues to pass
