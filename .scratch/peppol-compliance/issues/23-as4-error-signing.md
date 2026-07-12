# 23 — AS4: Error Signals Not Signed (SPEC GAP)

**What to build:** `buildAS4Error` in `src/as4/message.js` produces an unsigned `eb:SignalMessage`. PRD 0004 §A5 requires: *"signed eb:SignalMessage containing eb:Error"*.

Code review finding: `buildAS4Error` has no signing step — it returns raw XML with no `ds:Signature`.

**Status:** ready-for-agent

- [ ] `buildAS4Error` (or a new `signAS4Error(errorXml, keyPath)` function) adds a `ds:Signature` element to the outgoing error signal using `xml-crypto` with RSA-SHA256.
- [ ] The signing key path comes from `identityStore.getSigningKeyPath()` in production, or `getSimSigningKeyPath()` in simulation mode.
- [ ] The signature covers the `eb:Error` element (or the full `eb:SignalMessage` node).
- [ ] If signing fails (no key available), the error signal is still sent — signing failure does not block the error response (same pattern as MDN signing in ticket 04).
- [ ] Regression test from ticket 01 continues to pass.

**Reference:** PRD 0004 §A5, ticket 07.
