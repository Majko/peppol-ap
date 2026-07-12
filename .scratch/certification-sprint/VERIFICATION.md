# Certification Sprint — Verification Report

**Generated:** 2026-07-11  
**Checklist:** `01-certification-sprint-checklist.md`  
**Repo:** `/home/marian/projects-dir/projects/peppol-ap`

---

## Phase 0: Prerequisites

| # | Item | Status | Notes |
|---|------|--------|-------|
| 0.1 | Slovak company + eSlovensko mailbox | **PENDING** | External — requires real Slovak company (s.r.o. or živnosť) with active electronic mailbox |
| 0.2 | ORSR company register extract (≤3 months) | **PENDING** | External — must be obtained from ORSR |
| 0.3 | Criminal records (entity + representatives, ≤3 months) | **PENDING** | External |
| 0.4 | OpenPeppol Membership Application Form | **PENDING** | External — download from peppol.org/join |
| 0.5 | SEPA bank account for €2,825 transfer | **PENDING** | External |
| 0.6 | Finančná správa portal login (eID/eSlovensko) | **PENDING** | External |

---

## Phase 1: Submit Applications

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1.1 | Introductory email to PA SK | **PENDING** | External |
| 1.2 | Accreditation application on FS portal | **PENDING** | External |
| 1.3 | Email PA SK confirmation | **PENDING** | External |
| 1.4 | OpenPeppol membership application | **PENDING** | External |
| 1.5 | Pay OpenPeppol fees (€2,825) | **PENDING** | External |
| 1.6 | Forward OpenPeppol approval to PA SK | **PENDING** | External |

---

## Phase 2: Evaluation & Technical Preparation

| # | Item | Status | Notes |
|---|------|--------|-------|
| 2.1 | Monitor PA SK evaluation | **PENDING** | External |
| 2.2 | Follow up with OpenPeppol | **PENDING** | External |
| 2.3 | Complete all Testbed technical gaps | **NEEDS-WORK** | See Technical Checklist below (T1–T12) |
| 2.4 | Set up Testbed environment | **NEEDS-WORK** | No dedicated testbed environment yet; simulation mode exists but test network config absent |
| 2.5 | Pre-test with community tools | **PENDING** | External |

---

## Phase 3: Testbed Execution

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.1 | Request test PKI certificate via Peppol Service Desk | **PENDING** | External |
| 3.2 | Install test certificate in identity store | **NEEDS-WORK** | Identity store uses mock adapter; no real cert loading |
| 3.3 | Testbed TC1: Message submission (AS4 send) | **NEEDS-WORK** | `sendInvoice()` hardcodes `dryrun: true` in `src/index.js:198` |
| 3.4 | Testbed TC2: Message reception (AS4 receive) | **PARTIAL** | `handleIncomingMessage()` exists but is simulation-only; no real AS4 MIME parsing, signature verification, or decryption |
| 3.5 | Testbed TC3: MDN receipt generation | **PARTIAL** | `buildMDNReceipt()` exists in simulator but `handleIncomingMessage()` calls it unconditionally without WS-Security signing |
| 3.6 | Testbed TC4: Payload validation | **NEEDS-WORK** | Validator has ~15 rules; full BIS Billing 3.0 Schematron requires 60–80 rules (T4) |
| 3.7 | Testbed TC5: Participant discovery (SML→SMP) | **NEEDS-WORK** | SMP cache not wired (T7); lookup falls back to simulated data |
| 3.8 | Testbed TC6: Error handling | **NEEDS-WORK** | AS4 error codes EB:001, EB:002 not yet implemented (T6) |
| 3.9 | Slovakia-specific tests | **NEEDS-WORK** | No SK-specific rules in validator (T5) |
| 3.10 | Generate Testbed reports | **PENDING** | External |
| 3.11 | Submit Testbed reports to PA SK | **PENDING** | External |

---

## Phase 4: Certification Sprint

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4.1 | Sign SPA with PA SK | **PENDING** | External |
| 4.2 | Receive accreditation certificate | **PENDING** | External |
| 4.3 | Pay OpenPeppol certification fee (€2,500) | **PENDING** | External |
| 4.4 | Request production PKI certificate | **PENDING** | External |
| 4.5 | Install production PKI certificate | **PENDING** | External |
| 4.6 | Submit SMP access application to PA SK | **PENDING** | External |
| 4.7 | Receive SMP access grant | **PENDING** | External |
| 4.8 | Register first test participant in Slovak SMP | **PENDING** | External |
| 4.9 | Send first production Peppol invoice | **PENDING** | External |
| 4.10 | GO LIVE | **PENDING** | External |

---

## Phase 5: White-Label Bridge

| # | Item | Status | Notes |
|---|------|--------|-------|
| W1 | Identify 3–5 white-label providers | **NEEDS-WORK** | No evaluation results found |
| W2 | Contact providers with requirements | **NEEDS-WORK** | No evidence of outreach |
| W3 | Compare proposals (8 criteria) | **NEEDS-WORK** | No evaluation matrix |
| W4 | Negotiate and select provider | **NEEDS-WORK** | |
| W5 | Set up sandbox account | **NEEDS-WORK** | |
| W6 | Build white-label adapter layer | **NEEDS-WORK** | No adapter code |
| W7 | Test end-to-end | **NEEDS-WORK** | |
| W8 | Register test participant under provider ID | **NEEDS-WORK** | |
| W9 | Go live with white-label | **NEEDS-WORK** | |
| W10 | Document migration plan | **NEEDS-WORK** | |
| W11 | Execute migration | **PENDING** | Blocked on own certification |

---

## Technical Checklist (T1–T12)

### T1 — Remove `dryrun: true` hardcode ✅ ALREADY DONE (partial)
**Status:** PARTIAL  
`sendViaNode42()` in `src/as4/node42.js` correctly accepts a `dryrun` parameter (default `false`) and passes it to `N42Context`. However, `src/index.js:198` still hardcodes `dryrun: true` in the production send path call. This hardcode must be removed.

### T2 — Wire certificate loading from identity store ❌ NOT DONE
**Status:** NEEDS-WORK  
`src/index.js:193-196` still reads certs directly from filesystem via `node42.getCertPaths()`. The identity store is not wired. `src/store/factory.js` shows `'sqlite'` case throws `"SQLite adapter not yet implemented"`.

### T3 — Full AS4 receive endpoint at `POST /as4/receive` ❌ NOT DONE
**Status:** NEEDS-WORK  
- Current endpoint is `POST /api/receive` in `server/index.js:228` → passes to `apCore.handleIncomingMessage()`  
- `handleIncomingMessage()` (`src/index.js:285`) performs basic MIME payload extraction and UBL parsing but:  
  - No real MIME multipart/AS4 parsing — uses a simple regex to extract `<Invoice>` or `<CreditNote>`  
  - No WS-Security signature verification  
  - No AS4 decryption  
  - MDN receipt is generated but not signed  
- The `POST /as4/receive` path (Peppol standard AS4 endpoint) does not exist — only `/api/receive`  

### T4 — Expand UBL validator to BIS Billing 3.0 Schematron (~60–80 rules) ❌ NOT DONE
**Status:** NEEDS-WORK  
`src/ubl/validator.js` has ~15 rules (R001, R003–R006, R010, R029–R033, R065–R067). Full BIS Billing 3.0 Schematron requires 60–80 rules. Gap is significant.

### T5 — Slovakia-specific validation rules ❌ NOT DONE
**Status:** NEEDS-WORK  
No SK-specific rules in validator. SK VAT ID format (e.g., `SK[0-9]{10}`) not validated. No IS EFA reporting rules.

### T6 — AS4 error responses (EB:001, EB:002, etc.) ❌ NOT DONE
**Status:** NEEDS-WORK  
No AS4 error code mapping implemented. No `eb:Error` response structure.

### T7 — SMP cache with persistence ❌ NOT DONE
**Status:** NEEDS-WORK  
`SMPCache` interface defined in `src/store/interfaces.js`. Mock implementation exists. SQLite adapter not implemented (blocked by T2/T8).

### T8 — Persistent transaction store (SQLite) ❌ NOT DONE
**Status:** NEEDS-WORK  
`src/store/factory.js` — `'sqlite'` case throws error: `"SQLite adapter not yet implemented. Import createSQLiteStores from './sqlite.js' once ticket 02 is complete."`  
Schema defined in issue 02. Adapter not built.

### T9 — Health check endpoints ❌ NOT DONE
**Status:** NEEDS-WORK  
- `GET /api/health` exists (`server/index.js:68`) but only returns `apCore.getHealth()` — no `/health/live`, `/health/ready`, `/health/metrics`  
- No Prometheus metrics (`prom-client` not in `package.json`)  
- No graceful shutdown (basic SIGTERM/SIGINT handlers just call `server.close()` without drain)

### T10 — Update `@n42/edelivery` to latest with G3/DOTL PKI support ❓ UNCLEAR
**Status:** UNCLEAR  
`package.json` shows `@n42/edelivery: "^0.2.85"`. Whether this version supports G3/DOTL PKI is not documented. Needs investigation.

### T11 — Testbed test harness ❌ NOT DONE
**Status:** NEEDS-WORK  
No testbed harness script exists. No automated runner for the 6 test cases.

### T12 — Document Testbed test results ❌ NOT DONE
**Status:** NEEDS-WORK  
No test results documentation.

---

## Summary by Status

| Status | Count | Items |
|--------|-------|-------|
| **DONE** | ~1 | T1 (partial — dryrun param added but hardcode remains) |
| **NEEDS-WORK** | ~14 | T1 (hardcode), T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, 2.4, W1–W10 |
| **PENDING** (external) | ~24 | 0.1–0.6, 1.1–1.6, 2.1–2.2, 2.5, 3.1–3.11, 4.1–4.10, 5 (W11), 4.11 |
| **UNCLEAR** | 1 | T10 |

---

## Critical Path Analysis

The **critical path** to Testbed execution (Phase 3):

```
T1 + T2 (cert loading, dryrun fix)
  → T8 (SQLite for persistence)
    → T7 (SMP cache persistence)
      → T3 (full AS4 receive endpoint)
        → T4 (BIS 3.0 validator expansion)
          → T5 (SK-specific rules)
            → T6 (error codes)
              → T11 (testbed harness)
                → Phase 3 Testbed Execution
```

**Longest sequential chain:** T1 → T2 → T8 → T7 → T3 → T4 → T5 → T6 → T11 → Phase 3

**Parallel tracks available now:**
1. Phase 0 + Phase 1 (all external admin steps — can start immediately)
2. Phase 5 (white-label bridge — fully independent, no cert dependency)

---

## Recommendations

1. **Start Phase 0/1 immediately** — no technical dependencies; only external legal/admin steps. Get OpenPeppol membership application in flight now.

2. **Fix T1 hardcode first** — remove `dryrun: true` from `src/index.js:198`. This is a 1-line change and unblocks the production send path understanding.

3. **Build SQLite adapter (T8) before T7/T2** — it's the foundation for identity store and SMP cache persistence. Issue 02 is specification-complete; implement it.

4. **Expand validator (T4) incrementally** — targeting 60–80 rules is large. Start with the 15 missing critical rules first (cardinality constraints, PEPPOL-specific code lists, date logic).

5. **Clarify T10 (@n42/edelivery version)** — check if `^0.2.85` supports G3/DOTL PKI before planning upgrade work.

6. **Kick off white-label evaluation (W1–W3) in parallel** — can start today; gives Peppol connectivity within ~4–6 weeks regardless of certification outcome.

7. **Pre-seed Phase 2.4 (Testbed environment)** — set up a dedicated test configuration with Node42 pointing to `test-document.peppol.network`, separate from production config.
