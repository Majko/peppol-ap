# 14 — SBDH Identifier Whitespace Trimming and Canonicalisation

**What to build:** SBDH identifiers (Sender, Receiver, countryC1) must be trimmed of leading/trailing whitespace before being set on the SBDH. An interoperability issue (peppol-commons #70) showed that a trailing space in a receiver identifier caused a receiving AP to reject the message — even though the underlying UBL had the same space and the Schematron didn't catch it.

Additionally, SBDH identifiers must be **canonicalised** to the Peppol canonical form: `iso6523-actorid-upis` scheme values should be uppercase, without leading zeroes on the participant ID unless required by the scheme.

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] SBDH builder trims all identifier fields: `trim()` on Sender/Receiver/Identifier values before assignment
- [ ] SBDH builder canonicalises `iso6523-actorid-upis` scheme values: uppercase scheme, no extra leading zeros
- [ ] `countryC1` is uppercased if provided
- [ ] Outgoing AS4 messages (SBDH as MIME header) use the trimmed values
- [ ] Simulation mode: same trimming applies
- [ ] Regression test from ticket 01 continues to pass
