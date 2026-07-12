# Other Peppol Access Point Providers — Common Issues and Failures

**Report date:** 2026-07-12
**Research sources:** OpenPeppol GitHub org (poacc-upgrade-3, edec-as4, peppol-bis-invoice-3, pdk-environment), phax/phase4 (176 closed + 8 open issues, the dominant Java Peppol AS4 library), phax/peppol-commons (50 issues)
**Context:** Our codebase — Node.js, @n42/edelivery, Express

---

## Executive Summary

- **AS4 signature verification on incoming messages is the most commonly mishandled requirement** — providers implement AS4 receive endpoints that accept unencrypted/unsigned messages, miss the `eb:RefToMessageId` in MDN receipts, and never call `validateSignalMessage`. Phase4 issue #162 explicitly asks "how to enforce signature and encryption for receiving messages" — the library's own issue tracker reveals this is non-trivial.

- **CRL download failures create production outages** — when a CRL URL is unreachable, phase4 erroneously marks *all* certificates as revoked (issue #354). A 5-second CRL timeout took down an entire AP in production. Providers that fail to implement CRL/OCSP soft-fail behavior risk identical outages.

- **SBDH identifier whitespace causes rejections** — Peppol SBDH validators trim values, but implementers are surprised when a trailing space in a receiver identifier (e.g., `0208:xxxxxxxxxx `) causes a message to be rejected at the receiving AP. Phase4 issue #70 shows this is an interoperability trap.

- **AS4 error responses are inconsistently signed** — returning `AS4MessageProcessorResult.createFailure()` from a custom SPI produces an unsigned error message (phase4 issue #188). The `mustUnderstand` attribute is missing on AS4 Error responses but present on positive receipts (issue #328). Both violate the Peppol AS4 Profile conformance requirements.

- **SMP client caching of negative results fools providers during certification testing** — SMP lookups that return 404 (before the participant is registered) are cached for 15 minutes; after registration, the cached 404 persists and causes certification test failures (phase4/peppol-commons issue #54).

---

## 1. AS4 Receive-Side Signature and Encryption Enforcement

### Finding: Incoming AS4 messages can be accepted without signature or encryption

**Problem:** Phase4 issue #162 (enhancement, closed) explicitly asks: *"Is there a way to enforce a (valid) signature and encryption in the receiving AS4 message? Right now, it seems that it's possible to send a completely unencrypted, unsigned message to the AS4IncomingHandler and it will process the message."*

This was raised as a feature request — meaning the library itself had no mechanism to reject unsigned/unencrypted messages at the time. The issue was closed as an enhancement.

**Phase4 issue #174 (bug, closed):** `IAS4ProfileValidator.validateSignalMessage` is implemented in all profile validators but is **never called** — only used by unit tests. The method should be called in `AS4IncomingHandler#parseSignalMessage`. This means MDN receipts and error signals could be accepted without verifying their signatures.

**Phase4 issue #162, #177 (enhancement):** Signature validation on received signal messages (receipts) is not enforced. A receiver cannot reliably trust an MDN receipt without explicit validation.

**Phase4 issue #188 (enhancement, closed):** Returning `AS4MessageProcessorResult.createFailure()` from a custom `IAS4ServletMessageProcessorSPI#processAS4UserMessage` SPI returns an **unsigned error message**. This violates the Peppol AS4 Profile requirement that error signals be signed.

**Phase4 issue #328 (bug, closed):** AS4 Error responses are missing the `S12:mustUnderstand="true"` attribute on the `eb:Messaging` element. This attribute IS present on positive receipts but was missing on negative receipts (AS4 Error signals). This was confirmed against the AS4 Profile of ebMS 3.0 Version 1.0 specification.

**Phase4 issue #313 (bug, closed):** Some APs return AS4 errors as plain text strings in the HTTP body instead of XML. DBNA clients reported not understanding why some errors were XML-formatted and some were text. This is an interoperability failure.

**Source:** [phax/phase4 #162](https://github.com/phax/phase4/issues/162), [phax/phase4 #174](https://github.com/phax/phase4/issues/174), [phax/phase4 #188](https://github.com/phax/phase4/issues/188), [phax/phase4 #328](https://github.com/phax/phase4/issues/328), [phax/phase4 #313](https://github.com/phax/phase4/issues/313)

**Priority for our codebase:** **CRITICAL** — Our gap analysis (G13, G15/G18, G19) already identified that incoming WS-Security signatures are never verified, payloads are never decrypted, MDN receipts are never dispatched, and outgoing AS4 messages have empty WS-Security blocks. These phase4 issues confirm these are widespread problems across implementations, not just our codebase.

---

## 2. Certificate Revocation — CRL Failures Cause Full Outages

### Finding: CRL download timeout marks ALL certificates as revoked

**Phase4 issue #354 (bug, closed):** A CRL download timeout (5 seconds connecting to `pkicrl.symauth.com`) caused **all certificates system-wide** to be reported as revoked. The AP became unable to send or receive documents. Error log:

```
ERROR CRLDownloader -- Error downloading CRL from 'http://pkicrl.symauth.com/...LatestCRL.crl'
WARN  AbstractRevocationCheckBuilder -- Failed to find any CRL objects for revocation checking
WARN  CertificateRevocationCheckerDefaults -- Certificate is revoked
ERROR Phase4PeppolSender -- The configured receiver AP certificate is not valid... Reason: certificate is revoked
```

The issue was resolved only by restarting the server. The phax response confirmed this as a real bug. The same issue was reported in phase4/peppol-commons issue #49 ("If CRL download fails, fail revocation check").

**Phase4 issue #370 (enhancement, closed):** Added the ability to perform revocation checks on TLS connections. Previously TLS server certificates were **not checked for revocation at all** by default.

**Phase4 issue #125 (enhancement, closed):** OCSP verification was not customizable — some PoCs use self-signed roots with no OCSP service. Providers needed to be able to disable or customize OCSP checks for non-production environments.

**phax/peppol-commons issue #49 (bug, closed):** CRL download failures logged warnings but the CRL downloader treated a failed download as evidence of revocation. The code said: `Failed to find any CRL objects for revocation checking` followed by `Certificate is revoked` — conflating "CRL unavailable" with "certificate is revoked."

**Source:** [phax/phase4 #354](https://github.com/phax/phase4/issues/354), [phax/phase4 #370](https://github.com/phax/phase4/issues/370), [phax/phase4 #125](https://github.com/phax/phase4/issues/125), [phax/peppol-commons #49](https://github.com/phax/peppol-commons/issues/49)

**Priority for our codebase:** **CRITICAL** — Our gap analysis (G28: trust chain not validated, G29: CRL/OCSP revocation not checked) identified these as missing. The phase4 issue #354 confirms this is a production-critical gap. When CRL downloads fail, the system must not treat all certificates as revoked.

---

## 3. SMP Client — Caching of Negative Results and DNS Resolution Failures

### Finding: SMP 404 responses are cached, breaking certification testing

**phax/peppol-commons issue #54 (question, closed):** A `getServiceGroup` SMP lookup returns 404 before the participant is registered. The 404 result is cached for 15 minutes. After the participant is correctly registered, subsequent lookups still return the cached 404. This causes certification test failures where the AP appears unable to find a newly registered participant.

**phax/peppol-commons issue #63 (question, closed):** `SMPDNSResolutionException` is thrown for NAPTR-based lookup of unknown participants. The exception hierarchy is not machine-readable, making it hard for AP operators to programmatically distinguish DNS failure from "participant not found."

**phax/peppol-commons issue #67 (enhancement, closed):** The causes of `SMPDNSResolutionException` are not classified into machine-readable error types. Operators cannot distinguish DNS algorithm failures from network failures from participant-not-found.

**phax/peppol-commons issue #38 (enhancement, closed):** The SMP specification 1.2.0 clarified that `ServiceActivationDate` and `ServiceExpirationDate` should be checked for validity and connections refused when dates are not valid. The library was ignoring these fields entirely.

**phax/peppol-commons issue #58 (open, enhancement):** Each SML implementation should be queryable from its authoritative DNS server specifically. DNSSEC validation on SMP lookups is being requested.

**phax/peppol-commons issue #50 (open, enhancement):** DNSSEC client-side validation for DNS lookups is requested.

**Source:** [phax/peppol-commons #54](https://github.com/phax/peppol-commons/issues/54), [phax/peppol-commons #63](https://github.com/phax/peppol-commons/issues/63), [phax/peppol-commons #67](https://github.com/phax/peppol-commons/issues/67), [phax/peppol-commons #38](https://github.com/phax/peppol-commons/issues/38)

**Priority for our codebase:** **HIGH** — Our codebase uses @n42/edelivery's SMP lookup. The 15-minute negative cache TTL is a known trap. The `ServiceActivationDate`/`ServiceExpirationDate` not being checked would affect production reliability if a participant's SMP entry expires mid-operation.

---

## 4. SBDH Validation — Whitespace and Identifier Format Issues

### Finding: Trailing spaces in SBDH identifiers cause interoperability failures

**phax/peppol-commons issue #70 (enhancement, closed):** Phase4 rejected an SBDH because there was a **trailing space** after the Receiver Peppol identifier:

```xml
<Receiver>
  <Identifier Authority="iso6523-actorid-upis">0208:xxxxxxxxxx </Identifier>
</Receiver>
```

The underlying UBL also had this space and the Schematrons didn't reject it. This was reported as an interoperability issue — some receiving APs reject such messages while others accept them.

**phax/peppol-commons issue #224 (in poacc-billing-3.0, closed):** NL/EST identifier number of digits was set to 20, but should be 12 (despite the description in the ISO 6523 ICD list). Implementers relying on the wrong length specification built systems that failed validation.

**OpenPeppol documentation issue #2 (closed):** A typo in the Scheme Name for code 0190 (Dutch OIN number) — `0190` was listed with incorrect scheme metadata.

**Source:** [phax/peppol-commons #70](https://github.com/phax/peppol-commons/issues/70), [phax/peppol-commons #224](https://github.com/phax/peppol-commons/issues/224) (note: different repo but same phax maintainer), [OpenPEPPOL/documentation #2](https://github.com/OpenPEPPOL/documentation/issues/2)

**Priority for our codebase:** **MEDIUM** — Our SBDH builder needs to ensure identifiers are trimmed before serialization. Our UBL validator should catch malformed endpoint IDs, but whitespace-only failures in SBDH could slip through if the SBDH-level validation is separate from UBL Schematron validation.

---

## 5. XML Security — XXE, Entity Expansion, and Parser Configuration

### Finding: A published security audit found critical XML processing vulnerabilities in phase4

**Phase4 issue #318 (open, enhancement — security audit):** An independent security researcher performed a full audit of phase4 and published findings publicly. Key findings:

1. **XXE Injection (Critical):** The SOAP message parser appeared to use default XML parsers (e.g., JAXB) without explicit secure settings. No evidence of `XMLConstants.FEATURE_SECURE_PROCESSING` being enabled. A crafted invoice with `<!ENTITY xxe SYSTEM "file:///etc/passwd">` could exfiltrate server files.

2. **Billion Laughs / Entity Expansion (High):** The default JDK XML parser expands internal entities without limits unless configured. Phase4's code showed no custom entity-expansion limits. A small payload with nested `<!ENTITY>` definitions could exhaust memory/CPU.

3. **Unbounded Schema Validation Loops (Medium):** Phase4 uses XML Schema (XSD) validation for Peppol BIS invoices in SBDH. An issue was found where large or deeply nested schema validation could create unbounded processing loops.

**Remediation recommended:** Configure all XML parsers (DocumentBuilderFactory, JAXB unmarshalers) to disable DTDs and external entities. Enable JAXP secure processing features. Set limits on entity expansions and XML sizes.

**Source:** [phax/phase4 #318](https://github.com/phax/phase4/issues/318)

**Priority for our codebase:** **CRITICAL** — Our `parseAS4Message` uses regex/string extraction rather than a proper XML parser, which bypasses XXE risks but also means we are not doing any XML validation. If we ever switch to proper XML parsing, we must ensure secure parser configuration. This is also relevant to our UBL XML generation/parsing paths.

---

## 6. Peppol PKI — Trust Store Gaps and Certificate Configuration

### Finding: Complete truststore missing G3 certificates; certificate configuration is error-prone

**phax/peppol-commons issue #66 (question, closed):** G3 (Generation 3) Peppol certificates were added to the yearly truststore folders but **were not included in `complete-truststore.jks`**. An implementer raised this as a question, concerned about missing certificates.

**phax/phase4 issue #307 (enhancement, closed):** Phase4 should support setting certificate issuer constraints for WSS4J to validate certificates and avoid the security warning: `No Subject DN Certificate Constraints were defined. This could be a security issue.`

**phax/phase4 issue #173 (enhancement, closed):** `PeppolCertificateChecker` was flagged for redesign. The Peppol AP certificate checking logic had grown complex and needed rethinking — likely because of the various trust models (Peppol PKI vs. self-signed) and the CRL/OCSP issues above.

**phax/phase4 issue #139 (enhancement, closed):** BDEW profile requires different keystores for decryption/signing vs. signing/encrypting response messages. The original implementation used a single `IAS4CryptoFactory` for all operations, but the BDEW process requires separate keys for different operations.

**Source:** [phax/peppol-commons #66](https://github.com/phax/peppol-commons/issues/66), [phax/phase4 #307](https://github.com/phax/phase4/issues/307), [phax/phase4 #173](https://github.com/phax/phase4/issues/173), [phax/phase4 #139](https://github.com/phax/phase4/issues/139)

**Priority for our codebase:** **HIGH** — Our gap analysis (G28: trust chain not validated, G29: CRL/OCSP not checked) identified these as missing. The `complete-truststore.jks` missing G3 issue confirms that Peppol PKI trust store management is non-trivial and errors are easy to make.

---

## 7. AS4 Send-Side — MDN Receipt Handling and Error Generation

### Finding: MDN receipts are unsigned; error responses are inconsistently formatted; original compressed bytes are lost

**Phase4 issue #361 (enhancement, closed):** When AS4 compression is enabled, the processing order is Compress → Sign → Encrypt. Digital signatures and NRR receipts are computed over the compressed payload. However, phase4 treated compressed bytes as transient — `_decompressAttachments()` replaced the attachment's stream with a decompressing wrapper, and the **original compressed bytes were discarded**. This breaks NRR (Non-Repudiation of Receipt) compliance because the original compressed bytes needed for signature verification are lost.

**Phase4 issue #188 (enhancement, closed):** Returning `createFailure()` from a custom SPI produces an unsigned error message. This was flagged against the Peppol AS4 Profile spec requirement.

**Phase4 issue #324 (enhancement, closed):** Errors like "Error processing AS4 message" hide the actual exception. The caller cannot determine whether the failure was a format error, a validation error, or a network error. Operators need the real exception to handle it.

**Phase4 issue #325 (enhancement, closed):** `TRANSPORT_ERROR` is used for both retryable errors (connection failures) and non-retryable errors (certificate validation failures, format parsing errors). This forces AP operators to retry errors that should never be retried.

**Phase4 issue #335 (enhancement, closed):** Domibus compatibility issue — `MessageInfo/Timestamp` requires 3 digits for fraction seconds, but phase4 was not formatting it consistently. The fix required a new compatibility flag `phase4.compatibility.domibus=true`.

**Source:** [phax/phase4 #361](https://github.com/phax/phase4/issues/361), [phax/phase4 #188](https://github.com/phax/phase4/issues/188), [phax/phase4 #324](https://github.com/phax/phase4/issues/324), [phax/phase4 #325](https://github.com/phax/phase4/issues/325), [phax/phase4 #335](https://github.com/phax/phase4/issues/335)

**Priority for our codebase:** **HIGH** — Our gap analysis identified G15/G18 (MDN never dispatched), G19 (MDN unsigned), G22 (no AS4 error response generation). Issue #361's NRR problem (compressed bytes discarded) is also relevant if we implement AS4 compression.

---

## 8. Testbed and Tooling — Schematron ZIP Unavailable

### Finding: The OpenPeppol testbed tooling has broken download scripts

**OpenPeppol pdk-environment issue #1 (open):** The Schematron ZIP file for version "2020-10-01" cannot be downloaded. The build script at `src/fetcher/common/310-schematron.sh` references a URL that is no longer available. This means implementers cannot run the full OpenPeppol validation test suite locally.

**OpenPeppol pdk-environment issue #2 (open):** The PDK environment scripts were not platform-independent (Windows line endings, shell script path assumptions).

**Source:** [OpenPEPPOL/pdk-environment #1](https://github.com/OpenPEPPOL/pdk-environment/issues/1), [OpenPEPPOL/pdk-environment #2](https://github.com/OpenPEPPOL/pdk-environment/issues/2)

**Priority for our codebase:** **MEDIUM** — We rely on Schematron validation (our UBL validator covers ~15 of ~70-80 BIS Billing 3.0 rules per gap analysis). If the official Schematron ZIP distribution is unavailable, we may need an alternative source or to mirror the files ourselves.

---

## 9. BDEW/DBNA Profile Specific Issues

### Finding: German (BDEW) and DBN Alliance profiles have distinct deviations from the Peppol AS4 Profile

These are included for completeness since our codebase may need to interoperate with German market APs:

- **Phase4 issue #167 (bug):** BDEW profile requires `SKI_KEY_IDENTIFIER` for encryption but phase4 was using `DEFAULT_KEY_IDENTIFIER_TYPE`. Wrong key identifier type causes encryption to fail with BDEW endpoints.

- **Phase4 issue #180 (bug):** BDEW profile requires SOAP with attachments messages **without** a payload for path-switch messages, but phase4 always required a payload. The wording "MÜSSEN keine" (must not have) in the BDEW spec was confusing.

- **Phase4 issue #144 (bug, wontfix):** BDEW encryption did not work because the default client defined encryption but did not perform it due to a missing certificate or alias.

- **phax/peppol-commons issue #52 (enhancement):** The DBNA transport profile identifier `bdxr-as4-1.0#dbnalliance-1.0` was missing from the transport profile enum.

- **phax/peppol-commons issue #59 (bug):** In DBNAlliancePayload, the `setProfileID` setter was assigning to the wrong field (`m_sCustomizationID` instead of `m_sProfileID`). A copy-paste bug.

- **phax/peppol-commons issue #71 (enhancement):** DBNA interoperability issues: non-empty Payload ID was enforced incorrectly; OASIS URL was hardcoded as `docs.oasisopen.org` instead of `docs.oasis-open.org`.

**Source:** [phax/phase4 #167](https://github.com/phax/phase4/issues/167), [phax/phase4 #180](https://github.com/phax/phase4/issues/180), [phax/phase4 #144](https://github.com/phax/phase4/issues/144), [phax/peppol-commons #52](https://github.com/phax/peppol-commons/issues/52), [phax/peppol-commons #59](https://github.com/phax/peppol-commons/issues/59), [phax/peppol-commons #71](https://github.com/phax/peppol-commons/issues/71)

---

## 10. pepol-bis-invoice-3 Implementation Bugs (Schematron Rules)

### Finding: National rule enforcement varies; some rules were downgraded from warning to fatal

- **poacc-billing-3.0 issues #222, #223 (closed):** Danish rules DK-R-003 and DK-R-017 were changed from `warning` to `fatal`. Implementers who ignored these warnings in production discovered they were now fatal certification failures.

- **poacc-billing-3.0 issue #224 (closed):** NL/EST identifier digit count was wrong (set to 20, should be 12). Build scripts for Schematron testing were also reported broken: *"The build scripts appear to be broken (they fail on some unverifiable signature), so I was not able to run the unit tests."*

- **poacc-billing-3.0 issue #228, #227 (closed):** Wrong profile for France — France's Peppol billing profile was incorrectly identified or configured.

**Source:** [OpenPEPPOL/peppol-bis-invoice-3 #222](https://github.com/OpenPEPPOL/peppol-bis-invoice-3/issues/222), [OpenPEPPOL/peppol-bis-invoice-3 #224](https://github.com/OpenPEPPOL/peppol-bis-invoice-3/issues/224), [OpenPEPPOL/peppol-bis-invoice-3 #228](https://github.com/OpenPEPPOL/peppol-bis-invoice-3/issues/228)

**Priority for our codebase:** **HIGH** — Our UBL validator covers only ~15 of ~70-80 BIS Billing 3.0 Schematron rules. The Danish rules (DK-R-003, DK-R-017) and country-specific identifier length validations are exactly the kind of rule our validator is missing. Issue #224's identifier length error is directly relevant to our G03 gap (EndpointID schemeID validation).

---

## Cross-Reference: Existing Gap Analysis Items Confirmed by External Sources

| Gap ID | Area | External Confirmation |
|--------|------|----------------------|
| G13 | Incoming WS-Security signature never verified | Phase4 #162 (enforcement not possible without explicit API), #174 (validateSignalMessage never called) |
| G14 | Incoming payload never decrypted | Phase4 #162 (unencrypted messages accepted) |
| G15/G18 | MDN receipt never dispatched | Phase4 #188 (unsigned error from SPI), #324 (errors not surfaced to caller) |
| G19 | MDN receipt not signed | Phase4 #188 (error messages unsigned), #328 (mustUnderstand missing on AS4 Error) |
| G21 | Outgoing AS4 empty WS-Security block | Phase4 #162 (signature not enforced on send or receive) |
| G22 | No AS4 error response generation | Phase4 #313 (errors returned as text vs XML) |
| G28 | Trust chain not validated | Phase4 #354 (CRL download failure causes all certs revoked), #307 (no issuer constraints) |
| G29 | CRL/OCSP revocation not checked | Phase4 #354 (CRL failure = all certs revoked), #370 (TLS revocation not checked) |
| G30 | SMP certificate not used to verify signatures | Phase4 #162 (signature enforcement absent on receive) |
| G03 | EndpointID schemeID not validated | poacc-billing #224 (wrong digit count for NL/EST identifiers) |
| — | SMP negative result caching | peppol-commons #54 (404 cached 15 min, breaks certification) |

---

## Summary of Priority Actions for Our Codebase

| Priority | Action | Confirmed By |
|----------|--------|-------------|
| **P0 — Critical** | Implement WS-Security signature verification on incoming AS4 messages (G13) | Phase4 #162, #174, confirmed by independent security audit #318 |
| **P0 — Critical** | Implement MDN receipt signing and proper dispatch (G15, G18, G19) | Phase4 #188, #328 |
| **P0 — Critical** | Fix CRL/OCSP failure mode — must not mark all certs revoked (G29) | Phase4 #354, peppol-commons #49 |
| **P1 — High** | Implement AS4 error response generation (SOAP fault with eb:Error) (G22) | Phase4 #313, #324 |
| **P1 — High** | Expand UBL validator to cover national rules and identifier validation (G03, G04) | poacc-billing #222, #223, #224 |
| **P1 — High** | Ensure SBDH identifiers are trimmed; whitespace causes interop failures | peppol-commons #70 |
| **P1 — High** | Implement SMP negative result TTL (or short TTL) to avoid certification test failures | peppol-commons #54 |
| **P2 — Medium** | Implement `ServiceActivationDate`/`ServiceExpirationDate` checks from SMP responses | peppol-commons #38 |
| **P2 — Medium** | Secure XML parser configuration if/when switching from regex to XML parsing | Phase4 #318 (XXE, entity expansion findings) |
| **P3 — Low** | Fix testbed Schematron ZIP availability (may need to mirror) | pdk-environment #1 |
