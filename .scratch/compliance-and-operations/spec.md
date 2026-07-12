# PRD 0003 — SPA Compliance & Operations

## Problem Statement

The Peppol Service Provider Agreement (SPA) mandates several ongoing compliance obligations that the AP Core must satisfy after certification:

- **SPA 9.4.1** — Continuous compliance testing: *"Performing the necessary testing required to ensure that its service offerings to End Users of the Peppol Network are in compliance with the Peppol Interoperability Framework."*
- **SPA 9.4.2** — Logging and audit: *"Logging all activities... kept for at least 3 months... on reasonable request, reveal or give access to relevant data from the logs."*
- **SPA 9.4.4** — Certificate monitoring: *"Paying attention to alerts, warnings and 'hot-fixes' published by the Peppol Coordinating Authority, and acting accordingly."*
- **SPA 9.4.8** — Monthly reporting: submission of End User Statistics Report (EUSR) and Transaction Statistics Report (TSR) to OpenPeppol.

Currently, none of these compliance functions exist in the AP Core. There is no automated regression testing, no log query/export/prune tooling, no certificate expiry monitoring, and no reporting module. These are not optional — they are contractual requirements for operating a Peppol AP.

## Solution

Build four compliance subsystems into the AP Core:

1. **Regression test harness** — automated re-run of Testbed scenarios against the AP Core after every change, ensuring Peppol compliance is never broken by a code update
2. **CLI log commands** — `get`, `list`, `export`, `prune`, and `retention-status` commands for the transaction log, satisfying SPA audit trail requirements
3. **Certificate expiry monitoring** — daily check of the active Peppol PKI certificate with graded alerting (ok → notice → warning → critical → expired)
4. **Monthly reporting module** — EUSR and TSR generators that aggregate transaction data and produce OpenPeppol-compliant XML reports

## User Stories

1. As an AP operator, I want to run automated regression tests against the Testbed scenarios after every deployment, so that I never accidentally break Peppol compliance.
2. As an AP operator, I want to query recent transactions by participant, direction, status, and date range, so that I can respond to SPA audit requests.
3. As an AP operator, I want to export transaction logs in CSV/JSON format, so that external auditors can analyse them.
4. As an AP operator, I want to automatically prune transaction logs older than 90 days, so that I comply with SPA retention requirements.
5. As an AP operator, I want daily certificate expiry checks with escalating alerts, so that I never get disconnected from the Peppol network.
6. As an AP operator, I want to generate monthly EUSR and TSR reports, so that I can submit them to OpenPeppol on time.

## Implementation Decisions

### D1: Regression test harness

- Located at `test/regression/harness.js` with scenario modules under `test/regression/scenarios/`
- Covers all 6 Testbed eDelivery scenarios + Slovak-specific tests
- Runnable against both simulated and real Testbed environments
- Produces pass/fail report with per-scenario details
- Runnable as `npm run test:regression`

### D2: CLI log commands

- Commands: `peppol-ap logs get`, `peppol-ap logs list`, `peppol-ap logs export`, `peppol-ap logs prune`, `peppol-ap logs retention-status`
- Each command maps to a `TransactionStore` method (`get`, `list`, `deleteOlderThan`, `getRetentionRange`)
- Default retention: 90 days (configurable via `AP_CORE_LOG_RETENTION_DAYS`)
- Prune is idempotent and cron-safe

### D3: Certificate expiry monitoring

- Located at `src/monitoring/certificate-monitor.js`
- Graded alerting thresholds: ≤0 days (critical), ≤7 (warning), ≤14 (notice), ≤30 (info), >30 (ok)
- Runs daily via cron
- Uses existing `identityStore.getActiveCert()` from the storage layer

### D4: Monthly reporting

- `src/reports/eusr.js` and `src/reports/tsr.js`
- Aggregation queries against the transaction store (SQLite/DynamoDB)
- XML output matching OpenPeppol Reporting Operational Guideline format
- CLI: `peppol-ap reports generate`, `peppol-ap reports preview`
- Scheduler for cron-based monthly execution

## Testing Decisions

- Each compliance module has its own test file
- Regression harness tests: each scenario module tested individually with mock data
- CLI log tests: test each command against mock and SQLite adapters
- Certificate monitor tests: mock certificate with various expiry dates
- Report tests: test aggregation queries against known datasets
- All tests use the mock storage adapter unless testing SQLite-specific behaviour

## Out of Scope

- GUI dashboard for compliance monitoring (CLI-only)
- Automated email/SMS alerting (log-based + configurable webhook for critical cert alerts)
- Integration with OpenPeppol's report submission portal (generate locally, submit manually)
- Automated OpenPeppol alert monitoring (human-process with calendar reminders)
- GDPR data subject access request workflow (handled separately)
- Backup/restore of the transaction database

## Further Notes

- These four subsystems are independent of each other and can be built in any order, though all depend on the `ap-core-infrastructure` storage adapter (SQLite adapter, identity store, production AS4 send path).
- The regression harness is the highest priority — without it, every deployment risks breaking Peppol compliance.
- Certificate expiry monitoring is the second priority — an expired cert means immediate network disconnection.
- Log commands and monthly reporting can follow in any order after the transaction store is in place.
