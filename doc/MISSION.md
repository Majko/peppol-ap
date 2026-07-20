# Mission: Build a Peppol Service Provider for Slovak SMEs

## Why

Slovakia is mandating B2B e-invoicing via Peppol from **1 January 2027** (and B2G is already mandatory). Small and medium businesses in Slovakia will need a service provider to send/receive compliant invoices — they don't have the resources to build Peppol connectivity themselves. I want to be that provider.

## Success looks like

- I can explain the Peppol 4-corner model, the role of an Access Point, and what documents flow through the network — in my own words.
- I have a working technical prototype: an Access Point that can send and receive Peppol BIS Billing 3.0 invoices over AS4, with a React portal where SMEs can onboard, view invoices, and integrate via API.
- I have a roadmap for the legal/business steps: OpenPeppol membership, Slovak Peppol Authority accreditation, PKI certificates.
- The prototype works in the Peppol testbed environment and is ready for production accreditation.

## Constraints

- **Timeline:** 4 weeks to prototype (first usable version).
- **Stack:** Node.js / Express / PostgreSQL / Vite + React (backend, database, frontend).
- **Domain knowledge:** I know the tech stack well but not the Peppol processes — this is the main learning curve.
- **Budget:** Lean startup — prefer open-source tools and libraries where possible.
- **Language:** Slovak market — documentation and customer portal will need Slovak language support.

## Out of scope

- Pre-Award procurement documents (tenders, tendering catalogues) — invoice-only focus for now.
- Building from scratch the AS4 stack if viable open-source implementations exist.
- B2C invoicing (not mandated).
- Other EU country Peppol authorities (Slovak market first).
