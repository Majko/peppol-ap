# 15 — AS4 Error Response: mustUnderstand Attribute and SOAP Fault Format

**What to build:** AS4 error responses (`eb:SignalMessage/eb:Error`) must carry `S12:mustUnderstand="true"` on the `eb:Messaging` element. This attribute is present on positive MDN receipts but was missing on error responses in phase4 (issue #328) — a conformance violation confirmed against AS4 Profile of ebMS 3.0.

Additionally, ensure error responses are always returned as XML (`Content-Type: application/xop+xml`) — never as plain text. Phase4 issue #313 reported interoperability failures when some APs returned text error bodies.

**Blocked by:** 07 (AS4 error response generation)

**Status:** ready-for-agent

- [ ] `eb:Messaging` element in AS4 error signals carries `S12:mustUnderstand="true"` attribute
- [ ] AS4 error responses always return `Content-Type: application/xop+xml` — never `text/plain`
- [ ] All HTTP error responses from the AS4 receive endpoint use the same Content-Type
- [ ] Regression test from ticket 01 continues to pass
