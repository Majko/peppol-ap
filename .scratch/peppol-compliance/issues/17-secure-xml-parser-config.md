# 17 — Secure XML Parser Configuration

**What to build:** A security audit of the dominant Java Peppol AS4 library (phase4) found XXE injection and entity expansion vulnerabilities when XML parsers are used without secure settings (phase4 #318). Even though our current `parseAS4Message` uses regex/string extraction (which bypasses XXE risk), this ticket prepares for the switch to a proper XML library (planned in ticket 03) by ensuring all XML parsers are configured securely from the start.

**Blocked by:** 03 (MIME parser replacement — switches to proper XML library)

**Status:** ready-for-agent

- [ ] All `DocumentBuilderFactory` / `XMLParser` instances used in the codebase have secure settings applied:
  - `XMLConstants.FEATURE_SECURE_PROCESSING` enabled
  - DTD disabled (no `<!DOCTYPE>` processing)
  - External entities disabled (`FEATURE_SECURE_PROCESSING` or equivalent)
  - Entity expansion limit set (prevent "billion laughs" attacks)
- [ ] Same secure settings applied to any Schematron/XSLT processors
- [ ] A comment or `SECURITY.md` note in `src/` documents this requirement so future developers know to set these flags when adding XML parsing
- [ ] Regression test from ticket 01 continues to pass
