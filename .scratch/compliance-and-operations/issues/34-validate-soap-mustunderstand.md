# 34 — Validate SOAP mustUnderstand on incoming eb:Messaging header

**What to build:** `src/as4/message.js` `parseAS4Message()` extracts the eb:Messaging header content but does not validate that it carries `soap:mustUnderstand="true"`. Add validation.

**Status:** ready-for-agent

- [ ] In `parseAS4Message()`, after extracting the SOAP headers, check whether the `eb:Messaging` element or its parent SOAP header element carries `soap:mustUnderstand="true"`
- [ ] If `mustUnderstand` is absent or `false`, log a warning: `eb:Messaging header missing soap:mustUnderstand="true" — may not be processed by strict AS4 peers`
- [ ] Do not reject the message — this is a warning-level finding per the Peppol AS4 Profile (the requirement is for the sending MSH to set it, not for the receiving MSH to reject on absence)
- [ ] Add a unit test: parse a message with `soap:mustUnderstand="true"` → no warning; parse a message without it → warning logged
- [ ] Simulation regression test continues to pass
