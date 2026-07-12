# 32 — Fix AS4 error response format

**What to build:** Three AS4 error format issues in `src/as4/message.js` and `server/index.js`.

**Status:** ready-for-agent

- [ ] In `buildAS4Error()`, remove the duplicate `<eb:ErrorCode>` child element — only the `code` attribute on `<eb:Error>` is needed per OASIS AS4 spec
- [ ] In `buildAS4Error()`, fix the `category` attribute: `urn:oasis-open:ebxml-msg:ebms:errors` → `urn:oasis:names:ebxml-msg:errors:ebms` (note: `oasis-open` → `oasis:names`)
- [ ] In `server/index.js`, map ebMS error codes to appropriate HTTP status codes:
  - EB:001 (message structure), EB:002 (required field) → HTTP 400
  - EB:003 (value format) → HTTP 422
  - EB:004 (unsupported action) → HTTP 422
  - EB:005 (cert expired), EB:007 (signature failed) → HTTP 403
  - EB:006 (decryption error) → HTTP 422
  - default → HTTP 500
- [ ] Add unit tests for `buildAS4Error` asserting: (a) no `ErrorCode` child element, (b) `category` attribute is correct namespace
- [ ] Add integration test: fire each ebMS error type at the AS4 receive endpoint, assert correct HTTP status returned
- [ ] Simulation regression test continues to pass
