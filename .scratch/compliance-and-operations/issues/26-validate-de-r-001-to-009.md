# 26 — Validate DE-R-001 through DE-R-009

**What to build:** Add validator rules for the mandatory German/Slovak extension rules from the Peppol BIS 3.0 live rules page. All are fatal unless noted.

**Status:** ready-for-agent

- [ ] DE-R-001 (fatal): Payment Instructions (BG-16 / `cac:PaymentMeans`) must be present on every invoice
- [ ] DE-R-002 (fatal): Seller Contact group (BG-6 / `cac:AccountingSupplierParty/cac:Party/cac:Contact`) must be provided
- [ ] DE-R-003 (fatal): Seller city (BT-37 / `AccountingSupplierParty/Party/PostalAddress/cbc:CityName`) must be present
- [ ] DE-R-004 (fatal): Seller post code (BT-38 / `AccountingSupplierParty/Party/PostalAddress/cbc:PostalZone`) must be present
- [ ] DE-R-005 (fatal): Seller contact point (BT-41 / `AccountingSupplierParty/Party/cac:Contact/cbc:Name`) must be present
- [ ] DE-R-006 (fatal): Seller contact telephone (BT-42 / `AccountingSupplierParty/Party/cac:Contact/cbc:Telephone`) must be present
- [ ] DE-R-007 (fatal): Seller contact email (BT-43 / `AccountingSupplierParty/Party/cac:Contact/cbc:ElectronicMail`) must be present
- [ ] DE-R-008 (fatal): Buyer city (BT-52 / `AccountingCustomerParty/Party/PostalAddress/cbc:CityName`) must be present
- [ ] DE-R-009 (fatal): Buyer post code (BT-53 / `AccountingCustomerParty/Party/PostalAddress/cbc:PostalZone`) must be present
- [ ] Each rule follows the naming convention `DE-R-NNN` in error output
- [ ] Each rule is a pure function `rule(doc) → Error[]` in `src/ubl/validator.js`
- [ ] Unit tests for each rule: one fixture that triggers the error, one fixture that passes
- [ ] Simulation regression test continues to pass
