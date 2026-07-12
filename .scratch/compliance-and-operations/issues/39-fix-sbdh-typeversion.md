# 39 — Validate SBDH TypeVersion is 2.0 not 2.1

**What to build:** `src/as4/sbdh.js` `buildSBDH()` hardcodes `TypeVersion: "2.1"`. The Peppol BIS Billing 3.0 SBDH specification requires `TypeVersion: "2.0"`.

**Status:** ready-for-agent

- [ ] In `src/as4/sbdh.js` `buildSBDH()`, change `TypeVersion: "2.1"` → `TypeVersion: "2.0"`
- [ ] In `src/as4/sbdh.js` `parseSBDH()`, add validation: if `TypeVersion` is not `"2.0"`, push a warning to the errors list (this is a warning in the spec, not fatal)
- [ ] Add unit tests: generate a SBDH, assert TypeVersion is `"2.0"`; parse a SBDH with TypeVersion `"2.1"` → warning
- [ ] Simulation regression test continues to pass
