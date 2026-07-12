# 19 — UBL Validator: Missing ProfileID/Date/EndpointID Rules (SPEC GAP)

**What to build:** Three validation rules from PRD 0004 / ticket 10 that were not implemented in the 18-ticket batch.

Code review finding: `src/ubl/validator.js` header check loop only validates that `ProfileID`, `IssueDate`, and `EndpointID` are **present** (non-empty). The spec and ticket 10 require value validation.

**Status:** ready-for-agent

- [ ] `ProfileID` rule: value must match the Peppol BIS Billing 3.0 URI exactly — `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0` (or current Peppol published URI). A present-but-wrong value must produce an error, not just a missing-field error.
- [ ] Date format rule: `IssueDate`, `DueDate`, `TaxPointDate`, `InvoicePeriod/startDate`, `InvoicePeriod/endDate` must match `YYYY-MM-DD` regex (`/^\d{4}-\d{2}-\d{2}$/`). Invalid format produces a validation error with rule ID.
- [ ] `EndpointID` schemeID rule: scheme must be one of the Peppol allowed values — minimum `iso6523-actorid-upis`, `0088` (EAN), `0002` (GLN). Invalid or missing schemeID produces a validation error.
- [ ] Rule IDs follow BIS 3.0 naming (e.g., `BR-01`, `BR-02`) where a matching Schematron rule exists.
- [ ] Simulation mode: same validation rules apply (no exemptions).
- [ ] Regression test from ticket 01 continues to pass.

**Reference:** PRD 0004 §B1, ticket 10.
