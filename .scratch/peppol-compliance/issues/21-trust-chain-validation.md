# 21 — AS4: Trust Chain Validation Not Wired (SPEC GAP)

**What to build:** `verifyIncomingSignature` in `src/as4/message.js` verifies an XML signature against a certificate but performs no trust chain validation. PRD 0004 §A2 requires: *"trust chain of incoming certificates to be validated against the OpenPeppol PKI hierarchy using Node42's `validateCert`"*.

Code review finding: no `validateCert` call exists anywhere in the diff.

**Status:** ready-for-agent

- [ ] In `verifyIncomingSignature` (or a new `verifyTrustChain(certPem)` function): call Node42's `validateCert` with the sender's certificate PEM.
- [ ] If trust chain validation fails (expired, revoked, not in Peppol PKI hierarchy), throw an error that causes `handleIncomingMessage` to return an AS4 error signal (EB:005 — Certificate expired / EB:003 — Participant not found).
- [ ] In simulation mode: skip trust chain validation (use the existing simulation signing key path as the trust anchor).
- [ ] The `handleIncomingMessage` production path must wire the trust error into the AS4 error response.
- [ ] Regression test from ticket 01 continues to pass.

**Reference:** PRD 0004 §A2, ticket 05 spec (trust chain section).
