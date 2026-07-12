# 12 — Slovakia Compliance: SK Generator Fixes and Simulation Participants

**What to build:** Fix the UBL generator and SBDH for Slovak invoices: (1) `PartyTaxScheme/CompanyID` always outputs the VAT ID (not endpointID); (2) `countryC1` always `SK` for SK invoices; (3) simulation test participants use valid SK VAT IDs. SK VAT ID validation itself is in ticket 11.

This closes G35 (CompanyID wrong in generator), G36 (countryC1 bug).

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] `PartyTaxScheme/CompanyID` in `generator.js` always outputs the VAT ID (not the endpointID)
- [ ] `countryC1` in SBDH always outputs `SK` for invoices with SK seller country
- [ ] `unitCode` validation: warn on values not in UN/ECE Rec 20 list (G08 — warn only, do not reject)
- [ ] Simulation participants (`src/simulator.js`) use valid SK VAT IDs (format: `SK` + 10 digits, e.g., `SK2023456789`)
- [ ] Regression test from ticket 01 continues to pass
