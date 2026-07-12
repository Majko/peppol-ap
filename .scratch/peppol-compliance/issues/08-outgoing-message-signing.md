# 08 — Outgoing AS4 Message WS-Security Signing

**What to build:** The `buildAS4Message` function must produce a valid WS-Security `ds:Signature` element in the outgoing AS4 message's `wsse:Security` block. Currently the WS-Security block is present but empty — outgoing messages are unsigned and will be rejected by the Peppol network. Uses `xml-crypto` with RSA-SHA256, signing the SOAP body and payload.

This closes G21 (outgoing AS4 messages have empty WS-Security block).

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] `buildAS4Message` produces a `wsse:Security` block containing a `ds:Signature` element
- [ ] The signature covers the SOAP body and MIME payload parts as required by AS4 Profile §5
- [ ] Signing uses the AP's private key from the identity store
- [ ] Algorithm is RSA-SHA256 consistent with Peppol PKI requirements
- [ ] Simulation mode: messages are signed with the hardcoded RSA test key (`test/fixtures/keys/sim-signing-key.pem`)
- [ ] Regression test from ticket 01 continues to pass
- [ ] The signed message is parseable by the receive path (ticket 05) in simulation mode
