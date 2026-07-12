# 27 — Validate DE-R-015 through DE-R-024

**What to build:** Add validator rules for the remaining mandatory German/Slovak extension rules from the Peppol BIS 3.0 live rules page. All are fatal unless noted.

**Status:** ready-for-agent

- [ ] DE-R-010 (fatal): Deliver-to city (BT-77) must be present if DeliverToAddress (BG-15) is present
- [ ] DE-R-011 (fatal): Deliver-to post code (BT-78) must be present if DeliverToAddress (BG-15) is present
- [ ] DE-R-014 (fatal): VAT category rate (BT-119) must be present on each tax line
- [ ] DE-R-015 (fatal): Buyer Reference (BT-10) must be present on invoices
- [ ] DE-R-016 (fatal): When VAT category code is one of S, Z, E, AE, K, G, L, or M, at least one of Seller VAT identifier (BT-31), Seller tax registration identifier (BT-32), or Seller Tax Representative Party (BG-11) must be present
- [ ] DE-R-018 (fatal): Payment Terms / Skonto (BT-20) must match the structured format if present: `^#SKONTO#TAGE=\d+#PROZENT=\d{2}\.\d{2}(#BASISBETRAG=\d+\.?\d*)?#\s*$` — all uppercase, no extra whitespace, XML line break at end
- [ ] DE-R-022 (fatal): Attached document filenames (BT-125) must be unique case-insensitively within the invoice
- [ ] DE-R-023-1 (fatal): If PaymentMeansCode is 30 or 58, BG-17 (CreditTransfer) must be provided
- [ ] DE-R-023-2 (fatal): If PaymentMeansCode is 30 or 58, BG-18 (PaymentCard) and BG-19 (BankAccount) must NOT be provided
- [ ] DE-R-024-1 (fatal): If PaymentMeansCode is 48, 54, or 55, BG-18 (PaymentCard) must be provided
- [ ] DE-R-024-2 (fatal): If PaymentMeansCode is 48, 54, or 55, BG-17 and BG-19 must NOT be provided
- [ ] DE-R-019 (warning): If PaymentMeansCode is 58 (SEPA), BT-84 (IBAN) should be a valid IBAN
- [ ] DE-R-020 (warning): If PaymentMeansCode is 59 (SEPA debit), BT-91 (DebitedAccountIBAN) should be a valid IBAN
- [ ] Each rule follows naming `DE-R-NNN` in error output
- [ ] Unit tests: one triggering fixture and one passing fixture per rule
- [ ] Simulation regression test continues to pass
