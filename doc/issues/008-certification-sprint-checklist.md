# Certification Sprint — Master Checklist

## What to build

Complete the Peppol AP certification for the Slovak Republic (PA SK) and become a certified Digital Postman (CPDS) before the 1 January 2027 B2B e-invoicing mandate.

This issue covers everything that is **not** in the technical infrastructure PRD (issues 001–007). It tracks the legal, administrative, and process steps: document preparation, application submission, OpenPeppol membership, PA SK evaluation, Testbed execution, SPA signing, certificate procurement, and SMP access.

## Phase 0: Prerequisites

- [ ] **0.1** Confirm Slovak company exists (s.r.o. or živnosť) with active electronic mailbox (eSlovensko)
- [ ] **0.2** Obtain company register extract from ORSR (≤3 months old at time of submission)
- [ ] **0.3** Obtain criminal records for legal entity + all statutory representatives (≤3 months old)
- [ ] **0.4** Download OpenPeppol Membership Application Form from peppol.org/join
- [ ] **0.5** Ensure bank account ready for SEPA transfer (€2,825)
- [ ] **0.6** Verify login works on Finančná správa portal (eID/eSlovensko)

## Phase 1: Submit Applications (Week 1–2)

- [ ] **1.1** Send introductory email to PA SK (peppol@financnasprava.sk) — express intent to begin accreditation, ask about PASR points 4 and 6 status
- [ ] **1.2** Submit accreditation application on Finančná správa portal — "Žiadosť o akreditáciu poskytovateľa služby (SP)" with register extract + criminal records attached
- [ ] **1.3** Email PA SK confirmation of submitted application (peppol@financnasprava.sk)
- [ ] **1.4** Send OpenPeppol membership application (membership@peppol.eu) — attach filled form + company extract
- [ ] **1.5** Pay OpenPeppol fees upon invoice — €2,825 (€1,025 sign-up + €1,800 candidate annual)
- [ ] **1.6** Forward OpenPeppol membership approval to PA SK (peppol@financnasprava.sk)

## Phase 2: Evaluation & Technical Preparation (Week 3–6)

- [ ] **2.1** Monitor PA SK evaluation — check FS portal + email weekly for supplement requests (30-day statutory period)
- [ ] **2.2** Follow up with OpenPeppol membership if no response after 1 week
- [ ] **2.3** Complete all Testbed technical gaps (see Technical Checklist section below)
- [ ] **2.4** Set up Testbed environment — configure Node42 for test network, prepare test endpoints, sample invoices
- [ ] **2.5** Pre-test with community tools — peppolvalidator.com, OpenPeppol community test harness

## Phase 3: Testbed Execution (Week 5–8)

- [ ] **3.1** Request test PKI certificate via Peppol Service Desk (PKI Certificate Request ticket) — attach company extract + OpenPeppol membership proof
- [ ] **3.2** Install and configure test certificate in AP Core identity store
- [ ] **3.3** Run Testbed test case 1: Message submission (send AS4, verify receipt)
- [ ] **3.4** Run Testbed test case 2: Message reception (receive AS4, verify signature, decrypt, extract)
- [ ] **3.5** Run Testbed test case 3: MDN receipt generation (verify signed nonce sent back)
- [ ] **3.6** Run Testbed test case 4: Payload validation (accept valid UBL, reject invalid)
- [ ] **3.7** Run Testbed test case 5: Participant discovery (SML→SMP resolution)
- [ ] **3.8** Run Testbed test case 6: Error handling (invalid participant, malformed message, expired cert)
- [ ] **3.9** Run Slovakia-specific tests (BIS Billing 3.0 SK extension, national VAT IDs, IS EFA reporting)
- [ ] **3.10** Generate OpenPeppol Testbed report + Slovakia Testbed Report from Testbed system
- [ ] **3.11** Submit both Testbed reports to PA SK (peppol@financnasprava.sk)

## Phase 4: Certification Sprint (Week 8–12)

- [ ] **4.1** Sign Service Provider Agreement (SPA) with PA SK — received electronically via FS portal
- [ ] **4.2** Receive accreditation certificate from PA SK (valid 2 years)
- [ ] **4.3** Pay OpenPeppol certification fee (€2,500 one-time) upon invoicing
- [ ] **4.4** Request production PKI certificate via Peppol Service Desk — attach Testbed report + SPA confirmation
- [ ] **4.5** Install production PKI certificate in AP Core identity store
- [ ] **4.6** Submit SMP access application to PA SK (peppol@financnasprava.sk) — attach production PKI cert proof
- [ ] **4.7** Receive SMP access grant from PA SK
- [ ] **4.8** Register first test participant in Slovak SMP
- [ ] **4.9** Send first production Peppol invoice (end-to-end with a partner AP)
- [ ] **4.10** 🚀 GO LIVE — announce service, open for business

## Technical Checklist (Testbed Gaps)

These are the code changes needed before Testbed. They overlap with issues 001–004 from the infrastructure PRD but are listed here for certification tracking.

- [ ] **T1** Remove `dryrun: true` hardcode in `src/as4/node42.js` — controlled by `AP_CORE_DRY_RUN` env var (default `false`). (See Issue 003)
- [ ] **T2** Wire certificate loading from identity store — remove filesystem cert loading, add cert expiry validation. (See Issue 003)
- [ ] **T3** Implement full AS4 receive endpoint at `POST /as4/receive` — parse MIME, verify signature, decrypt, extract SBDH, validate, generate MDN.
- [ ] **T4** Expand UBL validator to full BIS Billing 3.0 Schematron rule set (~60–80 rules vs current 15).
- [ ] **T5** Add Slovakia-specific validation rules (SK VAT ID format, national extensions).
- [ ] **T6** Implement proper AS4 error responses mapped to correct error codes (EB:001, EB:002, etc.).
- [ ] **T7** Add SMP cache with persistence to avoid redundant lookups. (See Issue 002)
- [ ] **T8** Set up persistent transaction store (SQLite) so Testbed sessions survive restarts. (See Issue 002)
- [ ] **T9** Add health check endpoints (`GET /health/live`, `GET /health/ready`). (See Issue 004)
- [ ] **T10** Update `@n42/edelivery` to latest version with G3/DOTL PKI support.
- [ ] **T11** Create Testbed test harness — script that runs through all 6 test cases automatically.
- [ ] **T12** Document Testbed test results (date, result, notes) for each test case.

## Blocked by

- None — can start immediately. Legal/admin phase (Phase 0) and technical sprint can run in parallel.

## Phase 5: White-Label Bridge (Parallel — Start Immediately)

Run this in parallel with Phases 0–4. The white-label bridge lets us offer Peppol connectivity while waiting for our own certification.

- [ ] **W1** Identify 3–5 white-label providers to evaluate (Tickstar, ecosio, PeppolEDGE, Ademico, Peppol.sh)
- [ ] **W2** Contact each provider with requirements (use template from Lesson 10 Section 6 — position as accounting/software provider, do NOT reveal own certification plans): API access, webhooks, Slovak BIS 3.0, SMP portability
- [ ] **W3** Compare proposals against 8 evaluation criteria (cert ownership, SMP ownership, API compatibility, Slovak compliance, migration path, SLA, pricing, data residency)
- [ ] **W4** Negotiate and select provider — key terms: SMP portability clause, SLA 99.9%+, EU data residency, monthly cancellation, migration assistance
- [ ] **W5** Set up sandbox account and test API credentials
- [ ] **W6** Build white-label adapter layer (maps our AP Core interface to provider's API — ~200–400 LOC)
- [ ] **W7** Test end-to-end: send via our API → adapter → provider → Peppol → receive back + webhook
- [ ] **W8** Register first test participant in SMP under our provider ID
- [ ] **W9** 🚀 Go live with white-label — onboard first paying customers
- [ ] **W10** Document migration plan from white-label to our own AP (step-by-step, tested with test participant)
- [ ] **W11** Execute migration when our certification arrives — swap adapter, transfer SMP entries, decommission white-label

## Dependencies

- Issues 001–003 (infrastructure PRD) should be completed before Phase 3 (Testbed execution) since T1–T8 block Testbed readiness.
- Issue 004 (health checks) is useful for Phase 3 (T9) but not strictly blocking.
- A Slovak company with eSlovensko access is required — confirm before starting Phase 1.
- Phase 5 (white-label) can start immediately — it's independent of all other phases.

## Cost tracking

| Item | Amount | Due |
|------|--------|-----|
| OpenPeppol sign-up fee (AP only, S1) | €1,025 | Week 1–2 |
| OpenPeppol candidate annual fee (AP only) | €1,800 | Week 1–2 |
| OpenPeppol certification fee (one-time) | €2,500 | Week 8–10 (upon cert) |
| Slovak company legal costs (if needed) | ~€500 | Week 1 |
| Criminal record extracts | ~€50 | Week 1 |
| White-label AP subscription (4–6 months) | ~€1,000–€3,000 | Weeks 5–24 |
| **Total (own cert sprint)** | **~€5,875** | |
| **Total (with white-label bridge)** | **~€6,875–€8,875** | |
