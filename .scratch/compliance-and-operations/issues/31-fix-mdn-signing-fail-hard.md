# 31 — Fix MDN signing — fail hard in production instead of silently continuing

**What to build:** The receive path's MDN signing code currently catches errors and continues with an unsigned MDN, silently. This sends non-compliant MDNs to the Peppol network in production. Change it to throw a `NonRetryableError` instead.

**Status:** ready-for-agent

- [ ] In `src/index.js` `handleIncomingMessage()`, the MDN signing block currently catches errors and continues:
  ```js
  } catch (err) {
    console.error('MDN signing failed (production):', err.message);
    // execution continues — unsigned MDN returned
  }
  ```
  Change to throw `new NonRetryableError('MDN signing failed')` instead of swallowing the error
- [ ] `identityStore` must expose `getSigningKeyPath()` returning an actual PEM path for the production signing key — if not implemented, throw with a clear message rather than silently skipping
- [ ] If signing key is unavailable, `buildMDNReceipt` must not be called — the error must surface before any HTTP response is sent
- [ ] Add a unit test: when `identityStore.getSigningKeyPath()` returns null/undefined, `handleIncomingMessage` throws `NonRetryableError`
- [ ] Simulation regression test continues to pass (simulation path uses a different signing branch that is unaffected)
