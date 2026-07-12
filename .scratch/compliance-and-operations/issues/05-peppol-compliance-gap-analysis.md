# Peppol Compliance Gap Analysis

**Report date:** 2026-07-11
**Scope:** Peppol AP codebase — `/home/marian/projects-dir/projects/peppol-ap`
**Reference specs:** Peppol BIS Billing 3.0, Peppol AS4 Profile 1.0, OpenPeppol Testbed requirements
**Previously known gaps:** T1–T12 from `01-certification-sprint-checklist.md`

---

## Executive Summary

- **The UBL validator covers ~15 rules vs the ~70–80 required by BIS Billing 3.0 Schematron** — critical rules around ProfileID validation, date format enforcement, party identifier scheme validation, tax exemption reason codes, monetary total non-negativity, and line-level unit-of-measure codes are absent. T4/T5 (validator expansion + Slovakia rules) are already tracked but remain open.

- **The AS4 receive path lacks cryptographic integrity** — incoming messages are parsed with string/regex and the WS-Security signature is never verified; decryption does not happen; the MDN receipt is generated but never dispatched back to the sender; outgoing messages have no signature at all. This makes the receive endpoint non-compliant with the Peppol AS4 Profile and is a critical security gap.

- **Several structural AS4/BIS requirements beyond the T1–T12 checklist are missing**: MDN receipts are unsigned, AS4 error responses use non-standard codes, the SBDH TypeVersion is wrong (2.1 vs 2.0), MIME multipart parsing uses fragile regex, and no WS-Security signature is ever applied to outgoing messages.

---

## Gap Analysis Table

| Gap ID | Area | Description | Severity | Already Known | Source |
|--------|------|-------------|----------|--------------|--------|
| G01 | UBL Validation | ProfileID not validated — must be `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` | High | N | BIS 3.0 §6.3 |
| G02 | UBL Validation | IssueDate/DueDate format not enforced (ISO 8601 `YYYY-MM-DD` required) | Medium | N | BIS 3.0 §6.4 |
| G03 | UBL Validation | Seller/buyer `EndpointID` scheme attribute (`schemeID`) not validated against Peppol allowed values (0088, 9914, etc.) | High | N | BIS 3.0 §6.5 |
| G04 | UBL Validation | Seller VAT ID format not validated for SK (`SK` + 10 digits) | High | N | SK natl. ext. |
| G05 | UBL Validation | Tax exemption reason code (`taxExemptionReasonCode`) not validated when VAT category is exempt | Medium | N | BIS 3.0 §6.9 |
| G06 | UBL Validation | Monetary totals (LineExtensionAmount, TaxExclusiveAmount, etc.) not validated for non-negative values | Medium | N | BIS 3.0 §6.7 |
| G07 | UBL Validation | `InvoicedQuantity` unitCode not validated against UN/ECE Rec 20 list | Medium | N | BIS 3.0 §6.6 |
| G08 | UBL Validation | TaxSubtotal TaxableAmount sign not validated (must be ≥ 0) | Medium | N | BIS 3.0 §6.7 |
| G09 | UBL Validation | Document-level allowance/charge amounts not cross-validated against allowed totals | Low | N | BIS 3.0 §6.7 |
| G10 | UBL Validation | CreditNote reason code not validated | Low | N | BIS 3.0 §6.2 |
| G11 | UBL Validation | Payment means code not validated against Peppol code list | Low | N | BIS 3.0 §6.8 |
| G12 | UBL Validation | `AccountingRig` (buyer reference) not validated as present on invoices | Low | N | BIS 3.0 §7.2 |
| G13 | AS4 Receive | WS-Security signature on incoming AS4 messages is **never verified** — `parseAS4Message` only extracts fields with regex, does not verify the `ds:Signature` | Critical | N | AS4 Profile §6 |
| G14 | AS4 Receive | Incoming AS4 payload is **never decrypted** — the `<xop:Include>` href is not resolved, encrypted SOAP body is not decrypted | Critical | N | AS4 Profile §6 |
| G15 | AS4 Receive | `handleIncomingMessage` generates MDN receipt but **never returns or dispatches it** — caller cannot transmit MDN back | Critical | N | AS4 Profile §7 |
| G16 | AS4 Receive | **MIME multipart parsing is fragile string/regex** — should use a proper MIME parser (`yauzl` or similar) | High | N | AS4 Profile §5 |
| G17 | AS4 Receive | No AS4 signal message handling — only UserMessage is handled; ErrorSignals and ReceiptSignals are dropped | High | N | AS4 Profile §7 |
| G18 | AS4 Receive | `handleIncomingMessage` does not return the MDN receipt to the caller for transmission (same issue as G15, separate location) | High | N | AS4 Profile §7 |
| G19 | AS4 MDN | MDN receipt is **not signed** — `buildMDNReceipt` outputs plain SOAP with no WS-Security `ds:Signature` | Critical | N | AS4 Profile §7.2 |
| G20 | AS4 MDN | MDN Receipt element wraps the original message ID in a non-standard way — `<eb:UserMessage>` should be `<eb:RefToMessageId>` | Medium | N | AS4 Profile §7.2 |
| G21 | AS4 Send | Outgoing AS4 messages embed an **empty WS-Security block** — no actual signing occurs | Critical | N | AS4 Profile §6.2 |
| G22 | AS4 Send | No AS4 error response generation — no SOAP fault with `eb:Error` element | High | N | AS4 Profile §7.3 |
| G23 | AS4 Send | Peppol AS4 requires AS4 signal messages to be sent back via the same HTTP POST (push) — no pull mechanism implemented | Medium | N | AS4 Profile §7 |
| G24 | SBDH | SBDH `TypeVersion` is hardcoded to `"2.1"` but validation against the schema version is not performed | Low | N | SBDH spec |
| G25 | SBDH | SBDH `Standard` field uses direct UBL namespace instead of Peppol-specific doc type identifier format | Medium | N | SBDH spec |
| G26 | AS4 Message | `AgreementRef` in AS4 CollaborationInfo is hardcoded to placeholder `urn:fdc:peppol.eu:2017:agreements:tia:ap_provider` | Low | N | AS4 Profile §5.2 |
| G27 | AS4 Message | Message ID format not validated — Peppol AS4 requires `uuid:...@domain` format | Low | N | AS4 Profile §5.1 |
| G28 | Certificate | Trust chain not validated — `validateCert` from Node42 is imported but never called; only expiry is checked | High | N | AS4 Profile §6 |
| G29 | Certificate | CRL/OCSP revocation not checked | Medium | N | PKI spec |
| G30 | SMP | SMP lookup result certificate from the receiver's SMP is not used to verify the incoming AS4 message signature | High | N | AS4 Profile §6 |
| G31 | SMP | `transport_profile` in smp_cache schema defaults to `'peppol:as4:2024:v1.0'` — correct value is `busdox-transport-ebms30-peppol-v1.0` | Low | N | SMP spec |
| G32 | Config | `countryC1` in SBDH is derived from sender ID with a flawed heuristic — SK invoices should always have `countryC1 = SK` | Medium | N | SK natl. ext. |
| G33 | Config | ISO currency code list incomplete (missing some valid EUR-market currencies) | Low | N | BIS 3.0 |
| G34 | Config | ISO country code comment has typo `ISO 3161-1` (should be `ISO 3166-1 alpha-2`) | Low | N | ISO std. |
| G35 | Webhook | Webhook HMAC uses `X-Peppol-Signature` header — Peppol does not standardise this; downstream compatibility risk | Low | N | Best practice |
| G36 | Webhook | No webhook retry durability guarantee — retry state is lost on restart (in-memory counter in `callWebhook` closure) | Medium | N | Best practice |
| G37 | Health | `GET /health/live` and `GET /health/ready` endpoints are not wired to Express — `getHealth()` exists but no HTTP handler | Medium | N | T9 (partially) |
| G38 | Operations | No transaction state machine enforcement — any state can transition to any other state | Medium | N | Best practice |
| G39 | Store | `transactionStore.save(tx)` accepts large payloads but SQLite schema may not handle BLOB/CLOB correctly; no payload index | Low | N | Best practice |
| G40 | Store | `smp_cache.expires_at` column is TEXT not ISO8601 — TTL calculations may be inconsistent across SQLite versions | Low | N | Schema design |
| G41 | Config | `@n42/edelivery` G3/DOTL update not confirmed as resolved | Medium | Y | T10 |
| G42 | UBL Generator | `PartyTaxScheme/cbc:CompanyID` for seller uses `vatID or endpointID` — for Slovak companies must always be SK VAT ID | Medium | N | SK natl. ext. |
| G43 | UBL Generator | Generator outputs `InvoiceTypeCode` as free text — must be a code from Peppol Invoice type codelist | Low | N | BIS 3.0 §6.2 |
| G44 | AS4 | No `eb:MessagePartitioning` for large messages (>1MB) | Low | N | AS4 Profile §5 |
| G45 | AS4 | No `eb:Description` element in AS4 PayloadInfo | Low | N | AS4 Profile §5.2 |
| G46 | AS4 | The `<wsse:Security soap:mustUnderstand="true">` on the MDN is missing the `wsu:Id` attribute | Low | N | WS-Security |
| G47 | UBL | `buildDocument` outputs namespace `xmlns="..."` without versioned schemaLocation | Low | N | BIS 3.0 |
| G48 | UBL | No `cac:AdditionalDocumentReference` for billing-related attachments | Low | N | BIS 3.0 |

---

## Detailed Findings

### G13 — Incoming WS-Security Signature Never Verified (CRITICAL)

**Location:** `src/as4/message.js` (`parseAS4Message`)
**Description:** `parseAS4Message` extracts the raw SOAP XML and various fields using regex, but never:
1. Parses the `<ds:Signature>` element
2. Verifies the XML Digital Signature against the sender's certificate
3. Extracts and validates the signature's signed properties

This is a **critical security vulnerability** — any party could send a spoofed AS4 message with a forged sender ID and it would be accepted.
**Fix:** Use an XML signature verification library (`xml-crypto` or `@peppol/signature`) to verify the WS-Security signature against the sender's certificate obtained from SMP lookup.

---

### G14 — Incoming AS4 Payload Never Decrypted (CRITICAL)

**Location:** `src/as4/message.js` (`parseAS4Message`), `src/index.js` (`handleIncomingMessage`)
**Description:** If an incoming AS4 message is encrypted (AS4 supports encryption via WS-Security), the code does not decrypt it. The `xop:Include` href is also not resolved — the payload is extracted as raw text, potentially still encrypted.
**Fix:** Implement AS4 decryption: extract the encrypted session key, decrypt it with the AP's private key, then decrypt the SOAP body.

---

### G15/G18 — MDN Receipt Never Dispatched (CRITICAL)

**Location:** `src/index.js` (`handleIncomingMessage`)
**Description:** `handleIncomingMessage` generates an MDN receipt and saves it to the transaction store, but **never returns the MDN to the caller** in a structured way that enables the caller (HTTP handler) to send it back to the sender. The HTTP handler that calls `handleIncomingMessage` does not send the MDN as an HTTP response.

In a real AS4 receive endpoint, the MDN is sent as an HTTP 200 response with the MDN as the body. Testbed TC3 (MDN receipt generation) will fail because no MDN is ever dispatched.
**Fix:** The `POST /as4/receive` handler should take `handleIncomingMessage`'s returned `mdnReceipt` and send it as the HTTP response body with `Content-Type: application/xop+xml`.

---

### G19 — MDN Receipt Is Not Signed (CRITICAL)

**Location:** `src/index.js` (`buildMDNReceipt`)
**Description:** The MDN receipt is a plain SOAP message with no WS-Security signature. Peppol AS4 Profile §7.2 requires that MDN receipts are signed. A received MDN that is not signed is invalid according to the Peppol AS4 conformance tests.
**Fix:** Apply WS-Security signature to the MDN using the AP's private key, referencing the original message's signature elements.

---

### G21 — Outgoing AS4 Messages Are Not Signed (CRITICAL)

**Location:** `src/as4/message.js` (`buildAS4Message`)
**Description:** The `wsse:Security` block in the built AS4 messages is empty (contains only a comment). Messages sent to other Access Points are not signed, which violates the Peppol AS4 Profile requirement that all AS4 messages must carry a WS-Security signature.
**Fix:** Apply WS-Security signature using the AP's signing certificate and private key before sending.

---

### G01 — ProfileID Not Validated (HIGH)

**Location:** `src/ubl/validator.js`
**Description:** The validator checks `CustomizationID` but never validates `ProfileID`. Peppol BIS Billing 3.0 requires `ProfileID` to be exactly `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`. An invoice with a wrong or missing ProfileID will pass the current validator but fail the Testbed.
**Fix:** Add a phase that checks `doc.profileID === 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'` as a fatal error.

---

### G03 — EndpointID schemeID Not Validated (HIGH)

**Location:** `src/ubl/validator.js`
**Description:** The `EndpointID` scheme attribute (`schemeID`) on seller and buyer parties is parsed but never validated. Peppol allows only specific identifier schemes: `0007`, `0088`, `9914`, `9915`, `9916`, `9917`, `9918`, `9919`, `9920`, `9921`, `9922`, `9923`, `9924`, `9925`, `9926`, `9927`, `9928`, `9929`, `9930`, `9931`, `9932`, `9933`, `9934`. The current code defaults to `9914` in the generator but never validates incoming documents.
**Fix:** Add a validation phase checking `seller.endpointSchemeID` and `buyer.endpointSchemeID` against the allowed Peppol scheme list.

---

### G04 — Slovak VAT ID Format Not Validated (HIGH)

**Location:** `src/ubl/validator.js`, `src/ubl/parser.js`
**Description:** Slovak VAT IDs follow the format `SK` + 10 digits. No validation of this format exists. Slovak DIČ format is also not checked.
**Fix:** Add Slovakia-specific rule validating `PartyTaxScheme/cbc:CompanyID` for Slovak participants matches `^SK\d{10}$`.

---

### G16 — Fragile MIME Multipart Parsing (HIGH)

**Location:** `src/as4/message.js` (`parseAS4Message`)
**Description:** The payload extraction uses a regex that assumes `Content-ID: <payload@sender>` exactly — case sensitivity and whitespace variations break it. Does not handle nested MIME parts or decode Base64.
**Fix:** Use a proper MIME parser (`yauzl`, `multer`, `mailparser`, or `nodemailer`'s MIME parser).

---

### G17 — No AS4 Signal Message Handling (HIGH)

**Location:** `src/index.js` (`handleIncomingMessage`)
**Description:** The receive path only handles `eb:UserMessage`. AS4 ErrorSignals and ReceiptSignals from other Access Points are not handled.
**Fix:** Add signal message routing: check `eb:SignalMessage` type and dispatch to appropriate handler.

---

### G22 — No AS4 Error Response Generation (HIGH)

**Location:** `src/errors.js`, `src/as4/message.js`
**Description:** When an error occurs in `handleIncomingMessage`, the code saves a transaction with status `error` but does not generate an AS4 SOAP fault. Peppol AS4 requires specific error codes (EB:001, EB:002, etc.) and a properly formatted `eb:Error` element.
**Fix:** Add `buildAS4Error(code, message, details)` function that generates a signed `eb:SignalMessage` containing `eb:Error` with proper Peppol error codes.

---

### G28 — Trust Chain Not Validated (HIGH)

**Location:** `src/as4/node42.js`, `src/index.js`
**Description:** `sendViaNode42` passes `truststorePath` to Node42 but truststore validation is delegated entirely to Node42. On the receive side, no trust chain validation exists. The Peppol PKI requires verifying the certificate chain back to the OpenPeppol CA.
**Fix:** Call `n42mod.validateCert(certPem, truststorePem)` on received certificates before trusting them.

---

### G30 — SMP Certificate Not Used for Signature Verification (HIGH)

**Location:** `src/index.js` (`handleIncomingMessage`)
**Description:** When receiving a message, the sender's certificate should be obtained from the SMP (via `lookupParticipant`) and used to verify the WS-Security signature. Currently no SMP lookup is performed during message reception and no certificate verification occurs.
**Fix:** On receive, look up the sender's SMP entry to get their certificate, then use it to verify the incoming message's signature.

---

### G02 — Date Format Not Enforced (MEDIUM)

**Location:** `src/ubl/validator.js`, `src/ubl/parser.js`
**Description:** `IssueDate` and `DueDate` are extracted as raw strings and never validated for ISO 8601 `YYYY-MM-DD` format. Invalid formats silently pass through.
**Fix:** Add regex validation for `^\d{4}-\d{2}-\d{2}$` on both fields.

---

### G05 — Tax Exemption Reason Code Missing (MEDIUM)

**Location:** `src/ubl/validator.js`
**Description:** When a VAT category is `E`, `AE`, or `O`, Peppol BIS Billing 3.0 requires `taxExemptionReasonCode` (a UNCL 5305 code). The current validator has no such check.
**Fix:** When VAT category is in `ZERO_RATE_CATEGORIES`, validate that `taxExemptionReasonCode` is present.

---

### G06 — Monetary Totals Non-Negativity (MEDIUM)

**Location:** `src/ubl/validator.js`
**Description:** BIS Billing 3.0 requires that `LineExtensionAmount`, `TaxExclusiveAmount`, `TaxInclusiveAmount`, and `PayableAmount` must be non-negative. No such check exists.
**Fix:** Add validation that these fields are >= 0.

---

### G07 — InvoicedQuantity unitCode Not Validated (MEDIUM)

**Location:** `src/ubl/validator.js`
**Description:** The parser defaults `unitCode` to `C62` (Each) if missing, and the validator never checks that the unit code is a valid UN/ECE Rec 20 unit.
**Fix:** Validate unitCode against UN/ECE Rec 20 codelist (at minimum warn if C62 is used for non-unit quantities).

---

### G08 — TaxableAmount Sign Not Validated (MEDIUM)

**Location:** `src/ubl/validator.js`
**Description:** `TaxSubtotal/TaxableAmount` must be non-negative per BIS 3.0 rules. No check exists.
**Fix:** Add non-negativity check on `vat.taxableAmount`.

---

### G20 — MDN Receipt Uses Wrong Element for Ref (MEDIUM)

**Location:** `src/index.js` (`buildMDNReceipt`), `src/simulator.js` (`generateMDNReceipt`)
**Description:** Both MDN builders use `<eb:UserMessage>${originalMessageId}</eb:UserMessage>` instead of `<eb:RefToMessageId>${originalMessageId}</eb:RefToMessageId>`.
**Fix:** Change to `<eb:RefToMessageId>`.

---

### G23 — AS4 Signal Push Not Implemented (MEDIUM)

**Location:** Overall architecture
**Description:** Peppol AS4 requires AS4 signal messages (Receipt, Error) to be sent back via the same HTTP POST channel. No pull mechanism is implemented.
**Fix:** Ensure the receive handler returns the MDN as the HTTP response body.

---

### G25 — SBDH Standard Field Format (MEDIUM)

**Location:** `src/as4/sbdh.js` (`buildSBDH`)
**Description:** SBDH `Standard` field uses direct UBL namespace. Peppol requires the peppol-specific doc type identifier format in the DOCUMENTID scope.
**Fix:** Verify SBDH Standard field matches Peppol requirements.

---

### G32 — countryC1 Heuristic Is Flawed (MEDIUM)

**Location:** `src/index.js` (`extractCountryCode`)
**Description:** The heuristic `value === value.toUpperCase()` is unreliable for non-SK participant IDs. For Slovak invoices, `countryC1` should always be `SK` regardless of sender/receiver IDs.
**Fix:** When sending Slovak invoices, always set `countryC1 = SK`. Make derivation from participant ID a fallback only.

---

### G36 — Webhook Retry State Not Durable (MEDIUM)

**Location:** `src/index.js` (`callWebhook`)
**Description:** Retry state (attempt counter) is held in a closure variable — lost on restart. If the process crashes mid-retry, there's no record of retry attempts.
**Fix:** Persist retry state in the transaction store.

---

### G37 — Health Endpoints Not Wired (MEDIUM)

**Location:** `server/index.js` (not `src/index.js`)
**Description:** `getHealth()` exists and is exported, but `GET /health/live` and `GET /health/ready` are not registered as Express routes.
**Fix:** Register both endpoints in the Express app setup.

---

### G42 — Seller PartyTaxScheme CompanyID for SK (MEDIUM)

**Location:** `src/ubl/generator.js`
**Description:** `PartyTaxScheme/cbc:CompanyID` is set to `vatID or endpointID`. For Slovak companies the VAT ID must be `SK` + 10 digits — it should always be the VAT ID, never the endpointID.
**Fix:** Ensure Slovak seller always uses SK VAT ID for `CompanyID`.

---

### G41 — @n42/edelivery G3/DOTL Not Confirmed (MEDIUM)

**Location:** `package.json`, `src/as4/node42.js`
**Description:** T10 says "Update @n42/edelivery to latest version with G3/DOTL PKI support" but it's unclear if the installed version supports G3 (Global Grade 3) PKI. G3 is the current Peppol PKI standard.
**Fix:** Run `npm list @n42/edelivery` and verify against current Peppol PKI policy.

---

### G26, G27, G29, G31, G33, G34, G35, G38, G39, G40, G43, G44, G45, G46, G47, G48

**Low priority** — see gap table for descriptions. These are minor compliance gaps or code quality improvements.

---

## Priority Order for Testbed Readiness

| Priority | Gap(s) | What to fix |
|----------|--------|-------------|
| 🔴 1 | G13 | Verify incoming WS-Security signature — access point is currently spoofable |
| 🔴 2 | G14 | Decrypt incoming AS4 payloads — encrypted messages cannot be processed |
| 🔴 3 | G15/G18 | Wire MDN receipt as HTTP response — Testbed TC3 will fail |
| 🔴 4 | G19 | Sign MDN receipts — AS4 Profile §7.2 non-compliance |
| 🔴 5 | G21 | Sign outgoing AS4 messages — all outbound messages are non-compliant |
| 🟠 6 | G01 | Validate ProfileID — Testbed TC4 will fail |
| 🟠 7 | G03 | Validate EndpointID schemeID — Testbed will reject invalid schemes |
| 🟠 8 | G04 | SK VAT ID format — required for PA SK accreditation |
| 🟠 9 | G16 | Replace regex MIME parser with proper library |
| 🟠 10 | G17 | Handle AS4 signal messages (ErrorSignal, ReceiptSignal) |
| 🟠 11 | G22 | Map errors to ebMS EB:00x codes |
| 🟠 12 | G28 | Validate trust chain — PKI compliance |
| 🟠 13 | G30 | Use SMP cert for signature verification on receive |
| 🟡 14 | G02, G05, G06, G07, G08 | UBL validator expansions (ProfileID, dates, exemptions, totals) |
| 🟡 15 | G32 | countryC1 heuristic fix for SK |
| 🟡 16 | G37 | Wire health endpoints to Express |
| 🟡 17 | G41 | Verify Node42 G3/DOTL version |
| 🟡 18 | G42 | Fix seller CompanyID for Slovak companies |
| 🟡 19 | G20, G23, G25, G36 | MDN ref element, signal push, SBDH format, webhook durability |
| 🟢 20 | G09–G12, G24, G26, G27, G29, G31, G33–G35, G38–G40, G43–G48 | Low-priority gaps |

---

## Previously Identified Gaps (T1–T12)

These are already tracked in `01-certification-sprint-checklist.md`. Note that T3 ("Wire full AS4 receive endpoint") encompasses G13, G14, G15/G18, G19, G21 — the actual requirements (signature verification, decryption, MDN signing, MDN dispatch) are multi-layered and go well beyond what the T3 description implies.

| ID | Description | Overlapping Gaps |
|----|-------------|-----------------|
| T1 | Remove `dryrun: true` hardcode in node42.js | — |
| T2 | Wire certificate loading from identity store, add expiry validation | G07, G28 |
| T3 | Implement full AS4 receive endpoint (parse MIME, verify signature, decrypt, extract SBDH, validate, generate MDN) | G13, G14, G15, G16, G17, G18, G19, G21 |
| T4 | Expand UBL validator from ~15 rules to ~60–80 Schematron rules | G01–G12 |
| T5 | Add Slovakia-specific validation rules | G04, G32, G42 |
| T6 | AS4 error responses mapped to correct EB:00x error codes | G22 |
| T7 | SMP cache with persistence | G31 |
| T8 | Persistent transaction store (SQLite) | G39, G40 |
| T9 | Health check endpoints (`GET /health/live`, `GET /health/ready`) | G37 |
| T10 | Update @n42/edelivery to G3/DOTL PKI support | G41 |
| T11 | Testbed test harness (automated test case runner) | — |
| T12 | Document Testbed results per test case | — |

---

## Sources

1. **Peppol BIS Billing 3.0** — OpenPeppol billing specification, UBL 2.1 invoice schema, Schematron rules. Reference: `https://docs.peppol.eu/bis/billing-3.0/`. Key sections: §6 (Business Rules), §7 (Schematron validation).
2. **Peppol AS4 Profile 1.0** — OASIS AS4 Profile for Peppol. Governs SOAP messaging, WS-Security, MIME packaging, MDN receipts. Reference: `https://docs.peppol.eu/poacc/billing/3.0/` and OpenPeppol Testbed specifications.
3. **OpenPeppol Testbed** — Conformance test suite for Peppol Access Points. Test cases: TC1 (message submission), TC2 (reception), TC3 (MDN generation), TC4 (payload validation), TC5 (participant discovery), TC6 (error handling). Reference: OpenPeppol Testbed portal.
4. **Slovak National Extensions for BIS Billing 3.0** — Slovak Republic: SK VAT ID format (SK + 10 digits), IS EFA reporting integration. Contact: peppol@financnasprava.sk.
5. **Peppol PKI Policy** — G3 (Global Grade 3) certificate policy for Peppol Access Points. Requires certificate chain validation back to OpenPeppol CA. Reference: OpenPeppol Policy and PEPPOL CP/CPS.
6. **SMP Specification** — Peppol SMP protocol. Correct transport profile identifier is `busdox-transport-ebms30-peppol-v1.0`. Reference: `https://docs.peppol.eu/smp/`.
7. **Code analysis** — All 19 source files under `src/` were read and cross-referenced against the above specifications. Key files: `src/ubl/validator.js`, `src/as4/message.js`, `src/as4/node42.js`, `src/index.js`, `src/simulator.js`, `src/store/schema.js`.
