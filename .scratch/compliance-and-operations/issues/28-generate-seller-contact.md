# 28 — Generate BG-6 Seller Contact in UBL documents

**What to build:** Extend `src/ubl/generator.js` to include Seller Contact (BG-6) in generated invoices and credit notes. Required by fatal rules DE-R-002 through DE-R-007.

**Status:** ready-for-agent

- [ ] `buildSeller()` accepts an optional `seller.contact` object: `{ name, telephone, email }`
- [ ] `buildSeller()` outputs `cac:Contact` element inside `cac:AccountingSupplierParty/cac:Party` when contact is provided:
  ```xml
  <cac:Contact>
    <cbc:Name>{name}</cbc:Name>
    <cbc:Telephone>{telephone}</cbc:Telephone>
    <cbc:ElectronicMail>{email}</cbc:ElectronicMail>
  </cac:Contact>
  ```
- [ ] `generateInvoice()` and `generateCreditNote()` pass seller contact through from the data object
- [ ] `buildBuyer()` similarly accepts and outputs buyer contact if provided
- [ ] Generate a fixture invoice with all Seller Contact fields populated, assert the XML contains the correct `cac:Contact` block
- [ ] Simulation regression test continues to pass
