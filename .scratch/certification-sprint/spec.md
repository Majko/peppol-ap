# PRD 0002 — Peppol AP Certification Sprint

## Problem Statement

The AP Core cannot legally transmit invoices over the Peppol network without being a certified Access Point. Certification requires:

- Passing the OpenPeppol Testbed (6 eDelivery scenarios + Slovak-specific tests)
- Signing a Service Provider Agreement (SPA) with the Slovak Peppol Authority (PA SK)
- Obtaining production PKI certificates from the Peppol Service Desk
- Registering with the Slovak SMP

The Slovak B2B e-invoicing mandate takes effect **1 January 2027**, after which all B2B invoices must be transmitted electronically via a certified Peppol AP. Without certification, the AP Core is a prototype — it cannot handle real Peppol traffic or generate revenue.

Additionally, certification is a multi-month process with legal, administrative, and technical dependencies. The legal/admin track (company registration, criminal records, OpenPeppol membership) and the technical track (Testbed pass, infrastructure hardening) can run in parallel, but both must complete before the SPA can be signed.

## Solution

Run a parallel-track certification sprint covering:

1. **Legal & administrative track** — Slovak company preparation, OpenPeppol membership application, PA SK accreditation submission
2. **Technical track** — Testbed environment setup, AS4 endpoint completion, full UBL/BIS 3.0 Schematron validation, Testbed scenario execution
3. **Certification track** — SPA signing, PKI certificate procurement, SMP registration, go-live
4. **White-label bridge (parallel)** — Evaluate and onboard a white-label AP provider so we can offer Peppol connectivity while waiting for our own certification

## User Stories

1. As an AP operator, I want to complete OpenPeppol membership and PA SK accreditation, so that I am legally authorised to operate as a Peppol Access Point.
2. As an AP operator, I want to pass all 6 OpenPeppol Testbed scenarios, so that the AP Core is certified as Peppol-compliant.
3. As an AP operator, I want to pass Slovak-specific Testbed scenarios (BIS 3.0 SK extensions, national VAT IDs), so that I can serve the Slovak market.
4. As an AP operator, I want to sign the Service Provider Agreement with PA SK, so that I am contractually bound to the Peppol framework.
5. As an AP operator, I want to obtain and install production PKI certificates, so that the AP Core can send and receive real Peppol messages.
6. As an AP operator, I want to register participants in the Slovak SMP, so that my customers are discoverable on the Peppol network.
7. As an AP operator, I want a white-label AP bridge as fallback, so that I can offer Peppol connectivity before my own certification completes.
8. As an AP operator, I want a documented migration path from white-label to my own AP, so that the transition is seamless for customers.

## Implementation Decisions

### D1: Parallel legal/technical tracks

The legal track (Phase 0–1) and technical track (Phase 2–3) run concurrently, not sequentially. The critical path is: company docs → PA SK evaluation → Testbed pass → SPA signing → PKI cert → SMP registration → go-live.

### D2: White-label bridge strategy

Evaluate 3–5 providers (Tickstar, ecosio, PeppolEDGE, Ademico, Peppol.sh) against 8 criteria. Build a thin adapter layer (~200–400 LOC) that maps the AP Core interface to the provider's API. Key contractual terms: SMP portability, EU data residency, monthly cancellation, migration assistance.

### D3: Testbed environment

The OpenPeppol Testbed requires:
- A test PKI certificate (requested via Peppol Service Desk)
- A test SMP endpoint
- Node42 configured for the test network (test-document.peppol.network)
- Sample valid/invalid UBL invoices for each scenario

### D4: Technical gaps from the infrastructure PRD

Testbed relies on several issues from `ap-core-infrastructure`:
- Production AS4 send path (non-dryrun) — Issue 03
- SQLite storage adapter (transaction persistence) — Issue 02
- Full AS4 receive endpoint at `POST /as4/receive` — standalone gap
- Expanded UBL validator to full BIS Billing 3.0 Schematron (~60–80 rules)

## Out of Scope

- Technical infrastructure work covered by the `ap-core-infrastructure` feature (storage, cluster, Docker, Nginx, metrics, HMAC signing)
- Ongoing compliance work covered by the `compliance-and-operations` feature (regression testing, reporting, log retention, cert monitoring)
- Marketing or sales activities beyond go-live announcement
- Customer onboarding at scale (first pilot customer only)

## Further Notes

- The white-label bridge is a risk mitigation strategy, not a permanent solution. Target: white-label within 4–6 weeks, own certification within 12 weeks.
- PA SK evaluation has a statutory 30-day period — factor this into the timeline.
- OpenPeppol fees total ~€5,875 (membership + certification). White-label bridge adds ~€1,000–€3,000 for 4–6 months.
- Phase 5 of the checklist (white-label) can start immediately and is independent of all other phases.
