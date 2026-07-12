# PRD 0004 — Peppol Compliance: Pre-Certification Technical Gaps

## Problem Statement

The gap analysis (`.scratch/compliance-and-operations/issues/05-peppol-compliance-gap-analysis.md`) identified 48 gaps across three areas: UBL validation, AS4 receive/send security, and Slovakia-specific rules. Of these, 5 are **critical security gaps** that make the access point spoofable and non-functional for real Peppol network traffic, and 9 are high-severity gaps that will cause OpenPeppol Testbed test cases to fail.

These gaps are pre-certification — they must be fixed before the service can pass OpenPeppol Testbed and receive PA SK accreditation. They are **not** covered by PRD 0001 (infrastructure) or PRD 0003 (post-certification SPA operations).

## Solution

Fix all critical and high-severity compliance gaps in three workstreams, keeping the simulation mode fully functional throughout. Each workstream produces independently testable output.

**Workstream A — AS4 Secure Receive Path**: Verify incoming signatures, decrypt payloads, dispatch MDN receipts, sign outgoing messages.
**Workstream B — UBL Validator Expansion**: Cover all missing BIS Billing 3.0 rules.
**Workstream C — Slovakia Compliance**: SK VAT ID validation, IS EFA integration points, SK-specific generator fixes.

**Simulation preservation**: Every ticket in every workstream includes simulation-mode acceptance tests. The `src/simulator.js` and `--simulate` flag must continue to work identically before and after these changes. Simulation mode and production mode are tested as separate paths.

---

## User Stories

### Workstream A — AS4 Secure Receive Path

1. As an AP operator, I want incoming AS4 messages to have their WS-Security signatures verified against the sender's certificate from SMP lookup, so that only legitimate Peppol messages are accepted and the access point is not spoofable.
2. As an AP operator, I want incoming encrypted AS4 payloads to be decrypted, so that encrypted messages from other Access Points can be processed.
3. As an AP operator, I want the MDN receipt to be returned as an HTTP 200 response from the AS4 receive endpoint, so that the sending AP receives confirmation of receipt.
4. As an AP operator, I want MDN receipts to be signed with WS-Security, so that they are compliant with AS4 Profile §7.2 and accepted by other Access Points.
5. As an AP operator, I want outgoing AS4 messages to carry a valid WS-Security signature, so that they are accepted by the Peppol network.
6. As an AP operator, I want the MIME multipart parser to use a proper library instead of fragile regex, so that edge-case MIME variants are handled correctly.
7. As an AP operator, I want AS4 signal messages (ErrorSignals, ReceiptSignals) from other Access Points to be handled, so that error conditions and downstream confirmations are processed.
8. As an AP operator, I want incoming AS4 error responses to be mapped to ebMS EB:00x codes, so that the send path can react appropriately to errors.
9. As an AP operator, I want the trust chain of incoming certificates to be validated, so that only certificates from the OpenPeppol PKI hierarchy are trusted.
10. As an AP operator, I want the receive path to use the SMP-retrieved certificate to verify incoming message signatures, so that the signature verification is anchored to the sender's actual PKI certificate.
11. As an AP operator, I want the simulation mode to continue working exactly as before, so that I can develop and test without a live Peppol network.

### Workstream B — UBL Validator Expansion

12. As an AP operator, I want `ProfileID` to be validated against the required Peppol URI, so that Testbed TC4 passes and only valid BIS Billing 3.0 invoices are accepted.
13. As an AP operator, I want date fields (`IssueDate`, `DueDate`) to be validated as ISO 8601 `YYYY-MM-DD`, so that malformed dates are rejected early.
14. As an AP operator, I want `EndpointID` scheme attributes to be validated against the Peppol allowed identifier schemes, so that invalid sender/receiver IDs are rejected.
15. As an AP operator, I want monetary totals to be validated for non-negativity, so that invoices with impossible values are rejected.
16. As an AP operator, I want tax exemption reason codes to be validated when VAT is exempt, so that incomplete exemption declarations are rejected.
17. As an AP operator, I want `TaxableAmount` in VAT subtotals to be validated as non-negative, so that negative tax bases are rejected.
18. As an AP operator, I want `unitCode` on invoice quantities to be validated against UN/ECE Rec 20, so that invalid unit codes are warned on.
19. As an AP operator, I want the simulation mode to continue to validate invoices against the same expanded ruleset, so that simulation and production behave consistently.

### Workstream C — Slovakia Compliance

20. As an AP operator, I want Slovak VAT ID format (`SK` + 10 digits) to be validated on seller and buyer `PartyTaxScheme/CompanyID`, so that SK invoices meet PA SK requirements.
21. As an AP operator, I want the UBL generator to always output the SK VAT ID as `CompanyID` (not the endpointID), so that generated invoices are SK-compliant.
22. As an AP operator, I want the SBDH `countryC1` field to always be `SK` for Slovak invoices, so that routing metadata is correct.
23. As an AP operator, I want the system to support IS EFA reporting integration points, so that Slovak e-invoicing mandate requirements can be met in future.
24. As an AP operator, I want the simulation mode to use Slovak test participants with valid SK VAT IDs, so that SK compliance can be tested in simulation.

---

## Implementation Decisions

### A1: AS4 receive endpoint wiring

The HTTP route `POST /as4/receive` must be added to the Express server. It receives the raw MIME body, passes it to `handleIncomingMessage`, and returns the MDN receipt as the HTTP response body with `Content-Type: application/xop+xml`.

The `handleIncomingMessage` function is refactored to separate concerns:
- Signature verification — extracted to a `verifyIncomingSignature(mimeMessage, senderId)` function
- Decryption — extracted to a `decryptPayload(parsedSoap)` function
- MDN generation — `buildMDNReceipt` updated to produce a signed MDN
- Signal message handling — `handleIncomingMessage` dispatches on message type

### A2: WS-Security signature verification and signing

Use `xml-crypto` library for XML signature verification and generation:
- Verify incoming `ds:Signature` elements against sender certificate from SMP
- Sign outgoing AS4 messages and MDN receipts with AP's private key
- Use RSA-SHA256 algorithm consistent with Peppol PKI requirements

Trust chain validation uses Node42's `validateCert` against the configured truststore (Peppol Root CA).

### A3: MIME parsing

Replace fragile regex in `parseAS4Message` with `yauzl` or `mailparser`. The MIME parser handles:
- Boundary detection and part extraction
- Base64/Content-Transfer-Encoding decoding
- Multipart/related and multipart/signed types

### A4: MDN receipt format

The MDN receipt must use `<eb:RefToMessageId>` (not `<eb:UserMessage>`) and carry a `ds:Signature` element. The signature covers the original SOAP body's DigestValue.

### A5: AS4 error responses

A new `buildAS4Error(code, message, details)` function generates a signed `eb:SignalMessage` containing `eb:Error` with ebMS 3.0 error codes:
- EB:001 — Message structure invalid
- EB:002 — Required field missing
- EB:003 — Participant not found
- EB:004 — Unsupported payload
- EB:005 — Certificate expired
- EB:006 — Decryption error

### A6: Signal message handling

`handleIncomingMessage` dispatches:
- `eb:UserMessage` → existing invoice/creditnote handling
- `eb:SignalMessage/eb:Receipt` → log and store (ReceiptSignal)
- `eb:SignalMessage/eb:Error` → parse error, update transaction status (ErrorSignal)

### B1: Validator expansion

The existing `src/ubl/validator.js` is extended with additional rule functions. Each rule is a pure function `ruleName(doc) → Error[]`. The expanded validator covers all BIS Billing 3.0 rules in scope for the Testbed:
- ProfileID validation
- Date format enforcement (ISO 8601)
- EndpointID schemeID validation against Peppol allowed list
- Monetary totals non-negativity
- Tax exemption reason codes
- TaxableAmount sign
- unitCode warning (UN/ECE Rec 20)

Rules are numbered per the BIS 3.0 Schematron rule IDs where applicable (R001, R002, etc.).

### B2: Slovakia-specific rules

Slovakia rules are implemented as a separate validation module `src/ubl/validator-sk.js` that runs after the generic BIS 3.0 rules. It is only applied when the sender or receiver country is SK.

### C1: Generator SK fixes

`src/ubl/generator.js` is updated:
- Seller `PartyTaxScheme/CompanyID` always uses VAT ID (not endpointID)
- `countryC1` defaults to `SK` for all generated invoices
- VAT ID format: `SK` + 10-digit SK VAT number

### C2: Simulation participants

`src/simulator.js` registers Slovak test participants with valid SK VAT IDs (format: `SK` + 10 digits, e.g., `SK2023456789`). These are used in all simulation-mode send/receive flows.

### Simulation preservation

Every module changed in this PRD has simulation-mode tests that verify:
- Simulation mode produces identical output before and after the change
- Simulation mode does not require PKI certificates
- Simulation mode does not hit external network (DNS, SMP, SML)
- The `--simulate` flag and `simulationMode` flag work end-to-end

**Signing in simulation mode**: Outgoing messages and MDN receipts in simulation mode are signed with a **hardcoded RSA test key** stored in the codebase (e.g., `test/fixtures/keys/sim-signing-key.pem`). This key is never used in production. The production code path always uses the identity store. No config flags are introduced — the simulation path and production path diverge at the signing function, not at a config gate.

### Storage adapter

The work in this PRD does not change the storage adapter interface. All new async operations (SMP lookup for cert, signature verification) are handled within their respective functions and do not require new store methods.

---

## Testing Decisions

### Test categories

Each workstream has three test layers:
1. **Unit tests** — test each new function in isolation against fixtures
2. **Simulation integration tests** — test the end-to-end flow in simulation mode
3. **Regression tests** — existing test suite passes unchanged

### Simulation regression test

A dedicated simulation regression test (`test/simulation-regression.test.js`) runs the full send and receive flows in simulation mode and asserts:
- Send flow produces a valid MDN receipt
- Receive flow produces a valid UBL document
- Webhook is called with correct payload
- Transaction is stored with correct status

This test must pass before any ticket is considered complete.

### Test data

Slovak test fixtures under `test/fixtures/sk/` with valid SK VAT IDs and SK-specific invoice data. Peppol BIS 3.0 standard fixtures under `test/fixtures/bis/`.

### Existing test compatibility

All existing tests under `test/*.test.js` must continue to pass. Any test that relies on the previous (non-compliant) behaviour is updated to assert the correct compliant behaviour, and the reason is noted in the ticket.

---

## Out of Scope

- Schematron validation via SaxonJS (covered by future work — Node42 integration TBD)
- IS EFA direct integration (future work — requires separate FS portal connection)
- PostgreSQL or DynamoDB adapters
- Multi-region deployment
- GUI dashboard
- Automated certificate procurement
- Full Peppol Testbed execution (covered by T11/T12)

---

## Further Notes

- Workstreams A, B, and C can run in parallel — they touch different modules with minimal overlap
- Workstream A (AS4) is the longest pole due to the cryptographic requirements
- The simulation regression test is the integration gate for all three workstreams
- PRD 0001 (infrastructure) tickets T7 (SMP cache) and T8 (SQLite) are prerequisites for some AS4 receive path tests — check individual ticket blockers
- Node42's `@n42/edelivery` G3/DOTL update (T10) is a dependency for Workstream A certificate operations — verify before starting A3
