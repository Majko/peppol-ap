# 01 — Simulation Regression Baseline

**What to build:** A regression test that runs the full send and receive flows in simulation mode and asserts the outputs are correct. This test becomes the anchor that every subsequent ticket must keep green — it proves simulation mode is not broken by later changes.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `test/simulation-regression.test.js` runs `sendInvoice` in simulation mode and asserts: result has `messageId`, `status === 'delivered'`, and `receipt` is a non-empty XML string
- [ ] `test/simulation-regression.test.js` runs `handleIncomingMessage` in simulation mode and asserts: result has `messageId`, `status === 'received'`, and `mdnReceipt` is a non-empty XML string
- [ ] `test/simulation-regression.test.js` runs `buildAS4Message` in simulation mode and asserts: output is a valid MIME multipart with SOAP envelope and payload
- [ ] Simulation mode does NOT require PKI certificates, DNS, or external network access (assert by checking no network calls are made)
- [ ] All existing tests under `test/*.test.js` continue to pass unchanged
