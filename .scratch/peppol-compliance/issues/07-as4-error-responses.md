# 07 — AS4 Error Response Generation

**What to build:** Generate properly formatted AS4 error signals (`eb:SignalMessage/eb:Error`) with ebMS 3.0 error codes. When the receive path encounters a validation error, signature failure, decryption error, or unsupported message, it must return an AS4 error signal — not a plain HTTP 500. This closes G22 and is required by AS4 Profile §6.

**Blocked by:** 02 (receive endpoint wired)

**Status:** ready-for-agent

- [ ] `buildAS4Error(code, message, details)` function added
- [ ] Error signal is a signed `eb:SignalMessage` containing `eb:Error` with ebMS 3.0 error codes:
  - `EB:001` — Message structure invalid
  - `EB:002` — Required field missing
  - `EB:003` — Value does not match expected format
  - `EB:004` — Unsupported action/payload
  - `EB:005` — Certificate expired
  - `EB:006` — Decryption error
  - `EB:007` — Signature verification failed
- [ ] Error signal is returned as HTTP 500 (or 400 where appropriate) with `Content-Type: application/xop+xml`
- [ ] All callers of `buildAS4Error` are updated to use it instead of throwing raw errors
- [ ] Simulation mode: error signals are generated in the same format (or simulation errors use a different code path)
- [ ] Regression test from ticket 01 continues to pass
