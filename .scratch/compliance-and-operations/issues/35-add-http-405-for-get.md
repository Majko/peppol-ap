# 35 — Add HTTP 405 for GET requests to AS4 receive endpoint

**What to build:** The AS4 receive endpoint only handles POST (push). A GET request is malformed for this endpoint — return HTTP 405 Method Not Allowed with an appropriate `Allow: POST` header.

**Status:** ready-for-agent

- [ ] In `server/index.js`, add a route handler for `GET /as4/receive` that returns HTTP 405 with header `Allow: POST`
- [ ] The response body may be empty or a brief plain-text message indicating the method is not allowed
- [ ] Add an integration test: `GET /as4/receive` returns 405
- [ ] Simulation regression test continues to pass
