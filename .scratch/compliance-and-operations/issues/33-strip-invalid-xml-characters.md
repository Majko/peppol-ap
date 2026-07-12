# 33 — Strip invalid XML characters from user-provided fields

**What to build:** All user-provided strings are embedded in XML via `esc()` in `src/ubl/generator.js` and `src/as4/message.js`. `esc()` escapes `&`, `<`, `>`, `"`, `'` but does not strip XML 1.0 invalid characters (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F except 0x09, 0x0A, 0x0D). Extend `esc()` to strip these before escaping other characters.

**Status:** ready-for-agent

- [ ] Add a pre-processing step to `esc()` in `src/ubl/generator.js` that removes invalid XML 1.0 characters:
  ```js
  function esc(str) {
    if (str == null) return '';
    str = String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  ```
- [ ] Apply the same fix to `esc()` in `src/as4/message.js` (shared pattern, or extract to a shared util)
- [ ] Add a unit test: pass a string containing control characters to `esc()`, assert they are absent from output
- [ ] Add a unit test: pass `&`, `<`, `>`, `"`, `'` to `esc()`, assert they are properly escaped
- [ ] Simulation regression test continues to pass
