# 29 — Generate BG-16 Payment Instructions in UBL documents

**What to build:** Extend `src/ubl/generator.js` to include the full Payment Instructions group (BG-16) in generated invoices, not just the basic payment means code + IBAN + BIC.

**Status:** ready-for-agent

- [ ] `buildPayment()` accepts an extended `payment` object supporting BT-81 through BT-91:
  - `meansCode` (BT-81, existing)
  - `note` (BT-82, new)
  - `accountName` (BT-83, new)
  - `iban` (BT-84, existing)
  - `bic` (BT-85, existing)
  - `creditTransferIBANs[]` (BT-86, new — array of IBANs for multi-creditor payments)
  - `creditTransferBICs[]` (BT-87, new)
  - `cardAccount` (BT-88, new)
  - `cardHolderName` (BT-89, new)
  - `cardBrand` (BT-90, new)
  - `debitedAccountIBAN` (BT-91, new)
- [ ] At minimum, output `PaymentMeansCode` + `PayeeFinancialAccount/ID` (IBAN) + `FinancialInstitutionBranch/ID` (BIC) for SEPA credit transfer (code 58)
- [ ] Support the extended fields when provided in the data object
- [ ] Generate a fixture invoice with IBAN and BIC populated, assert the XML contains the correct `cac:PayeeFinancialAccount` block
- [ ] Simulation regression test continues to pass
