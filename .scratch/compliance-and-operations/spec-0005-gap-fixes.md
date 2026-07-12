# SPEC 0005 — Gap Fixes: G49–G67 + N1 + N5

## Problem Statement

The primary-source research in `07-additional-gaps-from-primary-sources.md` and the current-code review identified 20 new gaps (G49–G67) and 2 additional issues (N1, N5) that are not covered by the existing 48-gap analysis (G01–G48) or the 18 tickets already written from PRD 0004.

The gaps fall into three categories:
- **Missing BIS Billing 3.0 UBL blocks** — required UBL elements and groups entirely absent from both the generator and the validator
- **Missing DE-R rule validation** — 8 fatal rules from the Peppol BIS 3.0 live rules page completely unimplemented
- **AS4 implementation quality** — silent failures, incorrect error formats, missing security hardening

## Solution

Fix all new gaps in three workstreams:

**Workstream X — DE-R Validation + UBL Parser/Generator** — Add missing UBL blocks (BG-6 Seller Contact, BG-16 Payment Instructions, BG-17 Credit Transfer, BG-24 Additional Documents), wire them through the parser and validator, and enforce all DE-R rules from the live spec.

**Workstream Y — AS4 Quality Fixes** — Fix silent MDN signing failure, duplicate ErrorCode element, wrong AS4 error namespace, HTTP status mapping, invalid XML character handling, and SOAP mustUnderstand validation.

**Workstream Z — Replay Protection** — Add duplicate MessageId deduplication to the receive path.

Simulation mode is unaffected throughout — all changes are additive validation/generation logic with no changes to simulation mode behaviour.

---

## User Stories

### Workstream X — DE-R Validation + UBL Parser/Generator

1. As an AP operator, I want incoming invoices to fail validation if Payment Instructions (BG-16) are missing, so that the Testbed fatal rule DE-R-001 is enforced.
2. As an AP operator, I want the UBL generator to produce BG-16 Payment Instructions (BT-81–BT-91) including at minimum IBAN and BIC for SEPA credit transfers, so that generated invoices are Peppol BIS 3.0 compliant.
3. As an AP operator, I want incoming invoices to fail validation if Seller Contact (BG-6) is missing, so that fatal rules DE-R-002 through DE-R-007 are enforced.
4. As an AP operator, I want the UBL generator to include Seller Contact (BG-6) fields — name, telephone, email — so that generated invoices are SK-compliant.
5. As an AP operator, I want Buyer city (BT-52) and post code (BT-53) to be validated as present, so that fatal rules DE-R-008 and DE-R-009 are enforced.
6. As an AP operator, I want VAT-code-dependent seller tax ID requirements to be validated — when VAT category is S/Z/E/AE/K/G/L/M, at least one of Seller VAT ID, Seller tax registration ID, or Seller Tax Representative Party must be present — so that fatal rule DE-R-016 is enforced.
7. As an AP operator, I want Skonto/PaymentTerms (BT-20) format to be validated against the structured machine-readable format specified in DE-R-018, so that Slovak SKONTO terms are validated correctly.
8. As an AP operator, I want PaymentMeans code cross-validation against BG-17/BG-18/BG-19 to be enforced, so that fatal rules DE-R-023 and DE-R-024 are enforced.
9. As an AP operator, I want all monetary amount currencyID attributes to reflect the document's actual currency code (not hardcoded EUR), so that non-EUR invoices are correctly formatted.
10. As an AP operator, I want attached document filename uniqueness to be validated (DE-R-022), so that invoices with multiple supporting documents are validated correctly.
11. As an AP operator, I want simulation mode to continue working without changes, so that development and testing do not require a live Peppol network.

### Workstream Y — AS4 Quality Fixes

12. As an AP operator, I want MDN signing failures in production to be hard errors (not silently swallowed), so that unsigned MDNs are never sent to the Peppol network.
13. As an AP operator, I want AS4 error signals to have correct namespace (urn:oasis:names:ebxml-msg:errors:ebms) and no duplicate ErrorCode element, so that error responses are AS4 OASIS compliant.
14. As an AP operator, I want AS4 error responses to use HTTP status codes appropriate to the error type (400 for EB:001/EB:002, 403 for EB:005/EB:007, 422 for EB:006), so that receiving systems can classify errors correctly.
15. As an AP operator, I want invalid XML characters (control characters 0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) to be stripped from all user-provided UBL fields before embedding in XML, so that malicious or malformed data cannot produce invalid XML documents.
16. As an AP operator, I want SOAP mustUnderstand="true" on the eb:Messaging header block to be validated on incoming AS4 messages, so that the Peppol AS4 Profile requirement is enforced.
17. As an AP operator, I want the pull mechanism on the AS4 receive endpoint to be explicitly handled (HTTP 405 for GET), so that incorrect routing is clearly signalled.

### Workstream Z — Replay Protection

18. As an AP operator, I want the AS4 receive endpoint to reject duplicate MessageId values, so that replay attacks cannot cause double-processing of messages.

---

## Implementation Decisions

### X1: Parser additions

`src/ubl/parser.js` is extended with new extraction functions for:
- `cac:Contact` (BG-6 Seller Contact) → `{ name, telephone, email }`
- `cac:PaymentMeans` BT-82 through BT-91 (BG-16 extended fields)
- `cac:PaymentTerms` (BT-20 Skonto format)
- `cac:PaymentMandate/cac:PayeeFinancialAccount` (BG-17 Credit Transfer IBAN)
- `cac:CardAccount` (BG-18 Payment Card)
- `cac:AdditionalDocumentReference[]` with `cac:Attachment/cac:ExternalReference/cbc:FileName` (BG-24)
- `cac:DeliveryAddress` fields (BG-15 Deliver-to address)

All new fields are optional in the parsed output; absence is handled gracefully.

### X2: Validator additions

`src/ubl/validator.js` is extended with new rule functions for each DE-R rule:
- DE-R-001: Payment Instructions presence (BG-16 required)
- DE-R-002: Seller Contact group presence
- DE-R-003: Seller city (BT-37) present
- DE-R-004: Seller post code (BT-38) present
- DE-R-005: Seller contact point (BT-41) present
- DE-R-006: Seller telephone (BT-42) present
- DE-R-007: Seller email (BT-43) present
- DE-R-008: Buyer city (BT-52) present
- DE-R-009: Buyer post code (BT-53) present
- DE-R-015: Buyer Reference (BT-10) present
- DE-R-016: VAT-code-dependent seller tax ID
- DE-R-018: PaymentTerms/Skonto format (structured regex)
- DE-R-022: Attached document filename uniqueness
- DE-R-023-1/2: Payment means code + BG-17/BG-18/BG-19 consistency
- DE-R-024-1/2: Payment card code + BG-18 presence

Additionally:
- Fix hardcoded `currencyID="EUR"` on all monetary elements to use `data.currencyCode`
- SEPA IBAN format validation for BT-84/BT-91 when payment means code is 58/59

### X3: Generator additions

`src/ubl/generator.js` `buildSeller()` is extended to include `cac:Contact`.
`buildPayment()` is extended to include additional BG-16 fields (BT-82, BT-83, BT-84 IBAN, BT-85 BIC).
All `currencyID` attributes on monetary elements use `data.currencyCode` from the document instead of hardcoding EUR.

### X4: AS4 fixes

**G58/G66 (`src/as4/message.js`):** Remove `<eb:ErrorCode>` child element from `buildAS4Error`. Fix `category` attribute namespace to `urn:oasis:names:ebxml-msg:errors:ebms`.

**G59 (`server/index.js`):** Map ebMS error codes to HTTP statuses:
- EB:001, EB:002 → 400
- EB:003, EB:004 → 422
- EB:005, EB:007 → 403
- EB:006 → 422
- default → 500

**G60 (`src/ubl/generator.js` + `src/as4/message.js`):** Extend `esc()` function to strip invalid XML 1.0 characters before escaping, using the XML 1.0 restricted character set.

**G62 (`src/as4/message.js`):** In `parseAS4Message`, validate that the WS-Security header or eb:Messaging header element carries `soap:mustUnderstand="true"`. Log warning if absent, do not reject unless Peppol AS4 Profile explicitly requires rejection.

**G63 (`server/index.js`):** Add HTTP 405 handler for GET requests to `/as4/receive`.

### X5: Replay protection

**G61 (`src/index.js`):** In `handleIncomingMessage`, before processing, call `transactionStore.get(messageId)`. If a record already exists with any status, throw a `NonRetryableError` with ebMS code EB:001. If the store returns null, proceed and save the transaction.

---

## Testing Decisions

### Regression gate

The simulation regression test (`test/simulation-regression.test.js`) must pass unchanged after all changes. If any change causes simulation mode output to differ, the change is not acceptable — simulation mode is a stable contract.

### New unit tests

Each new validator rule gets a unit test with a fixture covering the error condition and a fixture covering the passing case. Tests are in `test/ubl-validator.test.js` following the existing pattern.

Parser additions are verified by round-trip tests: parse a fixture containing the new fields, assert the fields are extracted correctly.

Generator additions are verified by generating a document with the new fields populated and asserting the resulting XML contains the expected UBL elements.

### Existing test compatibility

All existing tests under `test/*.test.js` continue to pass. No existing assertions are changed.

---

## Out of Scope

- Schematron validation via SaxonJS (future work — Node42 integration TBD)
- IS EFA direct integration
- Full Peppol Testbed execution (covered by separate certification sprint)
- Pull mechanism full implementation (GET handler returning HTTP 405 is the scope)
- Changes to simulation mode or simulator fixtures
- Database schema changes
- Changes to the send path (only receive path + validation + generation are in scope)

---

## Further Notes

Workstreams X, Y, and Z are independent — they touch different files with no overlap. Y tickets are all independent of each other. Within X, the parser → validator → generator dependency chain means tickets 25–27 should complete before 28–35, though parsing tickets (25–27) can be developed in parallel.

The two N1/N5 issues from the current-code review (MDN signing silent failure + hardcoded EUR currencyID) are folded into tickets 36 and 31 respectively.
