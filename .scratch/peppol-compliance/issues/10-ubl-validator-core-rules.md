# 10 — UBL Validator: ProfileID, Date Format, EndpointID SchemeID

**What to build:** Expand `src/ubl/validator.js` with three new validation rules that address Testbed TC4 and related failures: (1) `ProfileID` must match the Peppol BIS Billing 3.0 URI; (2) date fields (`IssueDate`, `DueDate`, etc.) must be valid ISO 8601 `YYYY-MM-DD`; (3) `EndpointID` scheme attributes must be validated against the Peppol allowed identifier scheme list.

This closes G01 (ProfileID), G02 (date format), G03 (EndpointID schemeID).

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] `ProfileID` rule: value must be exactly `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0` (or current Peppol BIS 3.0 URI)
- [ ] Date format rule: `IssueDate`, `DueDate`, `TaxPointDate`, `InvoicePeriod/startDate`, `InvoicePeriod/endDate` must match `YYYY-MM-DD` regex; invalid dates produce a validation error
- [ ] `EndpointID` schemeID rule: scheme must be one of the Peppol allowed values — at minimum `iso6523-actorid-upis`, `0088` (EAN), `0002` (GLN); invalid schemeID produces a validation error
- [ ] Validation errors include the rule ID (e.g., `BR-01`, `BR-02`) matching BIS 3.0 Schematron naming where applicable
- [ ] Simulation mode: the same validation rules apply (no exemptions for simulation)
- [ ] Regression test from ticket 01 continues to pass
