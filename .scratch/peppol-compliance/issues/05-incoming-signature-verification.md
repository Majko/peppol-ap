# 05 — Incoming WS-Security Signature Verification

**What to build:** Verify incoming WS-Security `ds:Signature` elements on AS4 `eb:UserMessage` nodes using `xml-crypto` and the sender's certificate. Reject messages where the signature is invalid or the sender's certificate cannot be retrieved. This closes G13 (incoming signature never verified) — without this, the access point is spoofable.

**Blocked by:** 02 (receive endpoint wired), 03 (MIME parser in place to extract SOAP body)

**Status:** ready-for-agent

- [ ] `verifyIncomingSignature(soapEnvelope, senderId)` function added
- [ ] Signature is verified using `xml-crypto` with the RSA-SHA256 algorithm
- [ ] Sender's certificate is retrieved via SMP lookup (or from the `<wsse:Security>` header's `ds:X509Certificate` if present)
- [ ] If signature is invalid or missing, `handleIncomingMessage` throws and the receive endpoint returns an AS4 error signal
- [ ] Simulation mode: signature verification is skipped (or a simulated valid signature is accepted without hitting external network)
- [ ] Regression test from ticket 01 continues to pass
