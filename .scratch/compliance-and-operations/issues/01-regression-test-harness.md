# Regression Test Harness — Ongoing Compliance Testing

**Status:** implemented

**Blocked by:** ap-core-infrastructure/03 - Production AS4 send path (for expanded validator/error responses), ap-core-infrastructure/02 - SQLite storage adapter (for transaction store)

## What to build

The Peppol Testbed is a one-time certification gate. But SPA 9.4.1 requires continuous testing: *"Performing the necessary testing required to ensure that its service offerings to End Users of the Peppol Network are in compliance with the Peppol Interoperability Framework."*

Whenever we update our AP Core, we must verify we haven't broken Peppol compliance. Build an automated test harness that re-runs the 6 Testbed eDelivery scenarios plus Slovak-specific tests against a test environment.

### Test scenarios to automate

| # | Scenario | What it verifies | Current status |
|---|----------|-----------------|----------------|
| 1 | Message submission | Construct valid AS4 message, sign, send to receiving endpoint | Run against our simulated receiver |
| 2 | Message reception | Receive AS4, verify signature, decrypt, extract payload | Use a test sender |
| 3 | MDN receipt | Generate valid signed MDN Receipt (nonce) | Verify in test |
| 4 | Payload validation | Validate UBL against Schematron — accept valid, reject invalid | Our 15 rules, needs expansion |
| 5 | Participant discovery | SML → SMP resolution returns correct endpoint + cert | Test against Testbed SMP |
| 6 | Error handling | Correct error codes for invalid participant, malformed message, expired cert | Needs hardening |
| 7 | Slovak-specific | BIS 3.0 SK extensions, 0245:DIČ scheme, IS EFA format | Build from scratch |

### Architecture

```javascript
// test/regression/harness.js
export async function runRegressionTests(options = {}) {
  const results = [];
  for (const scenario of scenarios) {
    try {
      const result = await scenario.run({
        apCore: createAPCore(options),
        testData: loadTestData(scenario.name),
      });
      results.push({ scenario: scenario.name, passed: true, result });
    } catch (err) {
      results.push({ scenario: scenario.name, passed: false, error: err.message });
    }
  }
  return {
    passed: results.every(r => r.passed),
    results,
    timestamp: new Date().toISOString(),
  };
}
```

### Integration

- **CI pipeline:** Run the regression harness on every push to `main` and before every release
- **Schedule:** Run weekly against the OpenPeppol Testbed (or a private test SMP)
- **Report:** Output JUnit XML for CI dashboard + human-readable summary
- **Failure:** If harness fails, block deployment and notify ops channel

### New files

| File | Purpose |
|------|---------|
| `test/regression/harness.js` | Test runner that executes all scenarios |
| `test/regression/scenarios/` | One module per scenario |
| `test/regression/test-data/` | Sample invoices, malformed payloads, edge cases |
| `test/regression/README.md` | How to run, how to add new scenarios |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add `"test:regression": "node test/regression/harness.js"` script |
| `.github/workflows/ci.yml` | (when CI is set up) Add regression step |

## Acceptance criteria

- [ ] All 6 Testbed eDelivery scenarios are automated and pass
- [ ] Slovak-specific scenarios (BIS 3.0 SK, 0245:DIČ, IS EFA) are automated
- [ ] Harness produces a pass/fail report with per-scenario details
- [ ] Harness can run against both simulated and real Testbed environments
- [ ] Harness is wired into CI (or documented manual pre-deployment step)
- [ ] Adding a new scenario requires only adding one module + test data
- [ ] `npm run test:regression` passes on `main`
