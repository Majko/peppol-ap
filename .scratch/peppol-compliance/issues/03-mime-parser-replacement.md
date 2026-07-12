# 03 — MIME Multipart Parser Replacement

**What to build:** Replace the fragile regex-based MIME extraction in `parseAS4Message` with a proper MIME library (`yauzl` or `mailparser`). All MIME-encoded incoming AS4 messages are parsed correctly regardless of boundary whitespace, case variation, or encoding.

**Blocked by:** 01 (simulation regression baseline must be green)

**Status:** ready-for-agent

- [ ] `yauzl` or `mailparser` added as a dependency
- [ ] `parseAS4Message` uses the MIME library instead of regex for multipart extraction
- [ ] Handles `multipart/related` messages with multiple parts (SOAP envelope + payload)
- [ ] Handles Base64 Content-Transfer-Encoding correctly
- [ ] Handles edge cases: boundary whitespace variation, case-insensitive header names, nested MIME parts
- [ ] Simulation mode: `buildAS4Message` output is parseable by the new parser (round-trip test)
- [ ] Regression test from ticket 01 continues to pass
