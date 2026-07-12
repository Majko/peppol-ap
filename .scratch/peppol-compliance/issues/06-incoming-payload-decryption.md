# 06 — Incoming AS4 Payload Decryption

**What to build:** Decrypt incoming encrypted AS4 message payloads. Encrypted messages from other Access Points are currently unreadable — the encrypted `<xenc:EncryptedData>` element is not processed. Use `xml-enc` to decrypt with the receiving AP's private key. This closes G14.

**Blocked by:** 02 (receive endpoint wired), 03 (MIME parser to extract the SOAP body)

**Status:** ready-for-agent

- [ ] `decryptPayload(soapEnvelope)` function added using `xml-enc`
- [ ] Encryption key transport is resolved via the `<xenc:EncryptedKey>` block using the AP's private key (from identity store)
- [ ] Decrypted payload replaces the encrypted element in the parsed SOAP tree before further processing
- [ ] If decryption fails (wrong key, corrupted ciphertext), `handleIncomingMessage` throws and returns an AS4 error signal
- [ ] Simulation mode: decryption is skipped (or a simulated decrypted payload is used)
- [ ] Regression test from ticket 01 continues to pass
