# 02 — Wire AS4 Receive HTTP Endpoint

**What to build:** The `POST /as4/receive` Express route is added to the server. It receives a raw MIME body, passes it to `handleIncomingMessage`, and returns the MDN receipt as an HTTP 200 response. This makes the receive path addressable over HTTP — the service can now receive messages from other Access Points.

**Blocked by:** 01 (simulation regression baseline must be green)

**Status:** ready-for-agent

- [ ] `POST /as4/receive` route added to `server/index.js`
- [ ] Route receives raw MIME body (no JSON parsing) and passes it to `handleIncomingMessage`
- [ ] HTTP 200 response is sent with `Content-Type: application/xop+xml` and the MDN receipt as the response body
- [ ] The MDN receipt is returned from `handleIncomingMessage` and sent as the response body — not just stored
- [ ] Non-2xx responses (validation error, parse error) return a properly formatted AS4 error signal (see ticket 07)
- [ ] Simulation mode: the receive endpoint continues to work via the simulation flow
- [ ] Regression test from ticket 01 continues to pass
