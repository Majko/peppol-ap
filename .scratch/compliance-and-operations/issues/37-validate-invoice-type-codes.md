# 37 — Validate InvoiceTypeCode against full Peppol codelist

**What to build:** `src/ubl/validator.js` `VALID_INVOICE_TYPE_CODES` is missing several codes that are allowed by DE-R-017. Additionally, credit note type codes are not validated at all. Fix both.

**Status:** ready-for-agent

- [ ] Update `VALID_INVOICE_TYPE_CODES` to include all codes from DE-R-017: 326, 380, 384, 389, 381, 875, 876, 877
- [ ] Add `VALID_CREDIT_NOTE_TYPE_CODES` with: 381 (credit note), 875, 876, 877 (construction)
- [ ] Add a separate validation rule for `CreditNoteTypeCode` when the document is a CreditNote
- [ ] DE-R-017 is a warning in the spec — use `warning` severity, not `fatal`
- [ ] Generator (`src/ubl/generator.js`) should validate `data.invoiceTypeCode` against the codelist before outputting — if an invalid code is passed, throw with a clear message rather than silently outputting invalid XML
- [ ] Add unit tests: valid invoice type codes pass; invalid codes produce warning; credit note type codes validated separately
- [ ] Simulation regression test continues to pass
