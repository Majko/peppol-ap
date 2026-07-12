# 38 — Validate MessageId format on incoming AS4 messages

**What to build:** `src/as4/message.js` `parseAS4Message()` extracts `eb:MessageId` but does not validate its format. Peppol AS4 Profile §5.1 requires `uuid:<UUID>@<AP domain>` format. Add validation.

**Status:** ready-for-agent

- [ ] In `parseAS4Message()`, after extracting `eb:MessageId`, validate it matches:
  ```
  /^uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[\w.-]+$/
  ```
- [ ] If the format does not match, throw an error with ebMS code EB:003 (value format error)
- [ ] Add unit tests:
  - Valid format `uuid:550e8400-e29b-41d4-a716-446655440000@ap.mojafaktura.sk` → parses successfully
  - Invalid format `msg-123` → throws with EB:003
  - Valid format without `@domain` → throws with EB:003
- [ ] `generateMessageId()` in `src/index.js` already produces the correct format — no change needed there
- [ ] Simulation regression test continues to pass
