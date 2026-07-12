# 24 — Standards: Performance + Code Smell Fixes

Two Fowler-smell / performance findings from code review of the 18-ticket batch.

**Status:** ready-for-agent

## 24a — REC20_UNITS Set rebuilt per invoice line (Performance)

`src/ubl/validator.js`: `REC20_UNITS` is a Set of ~80 UN/ECE Rec 20 unit codes. It is instantiated inside the `validateUBL()` per-line loop, meaning every invoice line rebuilds the identical Set.

**Fix:** Move `REC20_UNITS` to module scope as a constant (`const REC20_UNITS = new Set([...])`) defined once at file load. No functional change — purely a performance fix.

**Verification:** `npm test` passes.

## 24b — classifySendError() Repeated Switch Chain (Code Smell)

`src/errors.js`: `classifySendError()` chains six independent `if` conditions on `err.code`/`err.message`. Adding a new error code requires inserting into this linear chain.

**Fix:** Replace the chain with a `Map`-based dispatcher:

```js
const SEND_ERROR_MAP = new Map([
  ['ECONNREFUSED', ['NETWORK_ERROR', 'Connection refused']],
  ['ETIMEDOUT',    ['NETWORK_ERROR', 'Connection timed out']],
  // ...
]);
function classifySendError(err) {
  const entry = SEND_ERROR_MAP.get(err.code);
  if (entry) return { code: entry[0], message: entry[1] };
  return { code: 'SEND_ERROR', message: err.message };
}
```

**Verification:** `npm test` passes; existing error classification behaviour unchanged.
