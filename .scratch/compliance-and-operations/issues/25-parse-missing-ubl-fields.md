# 25 — Parse missing UBL fields: BG-6, BG-16, BG-17, BG-24

**What to build:** Extend `src/ubl/parser.js` to extract UBL elements that are currently not parsed. These feed into the validator and are needed for downstream DE-R rule enforcement.

**Status:** ready-for-agent

- [ ] Parse `cac:AccountingSupplierParty/cac:Party/cac:Contact` → `{ name, telephone, email }` (BG-6 Seller Contact fields BT-41, BT-42, BT-43)
- [ ] Parse `cac:AccountingCustomerParty/cac:Party/cac:Contact` → `{ name, telephone, email }` (buyer contact, if present)
- [ ] Parse `cac:PaymentMeans/cbc:PaymentMeansCode` as `paymentMeansCode` (BT-81)
- [ ] Parse `cac:PaymentMeans/cbc:PaymentNote` (BT-82)
- [ ] Parse `cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID` as `paymentAccountIBAN` (BT-84)
- [ ] Parse `cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID` as `paymentAccountBIC` (BT-85)
- [ ] Parse `cac:PaymentMeans/cac:PaymentMandate/cac:PayeeFinancialAccount/cbc:ID` → BG-17 Credit Transfer IBAN
- [ ] Parse `cac:PaymentMeans/cac:CardAccount` → BG-18 Payment Card fields
- [ ] Parse `cac:PaymentTerms/cbc:Note` → `paymentTermsNote` (BT-20 Skonto/raw payment terms)
- [ ] Parse `cac:AdditionalDocumentReference[]` with `cac:Attachment/cac:ExternalReference/cbc:FileName` → array of `{ filename, id }` (BG-24)
- [ ] Parse `cac:DeliveryTerms/cac:DeliveryAddress` fields: city (BT-77), post code (BT-78)
- [ ] Round-trip test: parse a fixture containing all new fields, assert all fields are extracted correctly
- [ ] Existing parser tests continue to pass
- [ ] Simulation regression test continues to pass
