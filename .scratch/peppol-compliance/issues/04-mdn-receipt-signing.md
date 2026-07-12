# 04 — MDN Receipt: Format Fix and WS-Security Signing

**What to build:** Fix `buildMDNReceipt` to use `<eb:RefToMessageId>` instead of `<eb:UserMessage>`, and apply a WS-Security `ds:Signature` to the MDN receipt. A signed MDN is a Peppol AS4 Profile §7.2 requirement — unsigned MDNs are rejected by other Access Points.

This ticket addresses: G19 (MDN not signed), G20 (wrong element for message reference).

**Blocked by:** 02 (AS4 receive endpoint must be wired before MDN dispatch can be tested)

**Status:** ready-for-agent

- [ ] `buildMDNReceipt` uses `<eb:RefToMessageId>${originalMessageId}</eb:RefToMessageId>` instead of `<eb:UserMessage>`
- [ ] MDN receipt carries a `ds:Signature` element in the `wsse:Security` block
- [ ] The signature covers a DigestValue of the original SOAP body content
- [ ] The MDN is signed with the receiving AP's private key (from identity store)
- [ ] Simulation mode: the MDN is signed with the hardcoded RSA test key (`test/fixtures/keys/sim-signing-key.pem`)
- [ ] Regression test from ticket 01 continues to pass
- [ ] Receive endpoint (ticket 02) returns the signed MDN as the HTTP response body
