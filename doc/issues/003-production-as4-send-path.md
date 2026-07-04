# Production AS4 Send Path + Certificate Loading

## Parent

Depends on Slice 2 — SQLite storage adapter (doc/issues/002-sqlite-storage-adapter.md)

## What to build

Wire the `APIdentityStore` to load the Peppol PKI certificate and private key instead of reading from the filesystem (`~/.node42/certs/cert.pem`). Remove the `dryrun: true` hardcode from `src/as4/node42.js` so that the production AS4 send path actually transmits messages over the wire.

The identity store provides certificate lifecycle management: `getActiveCert()` returns the current valid cert, cert expiry is checked before every send, and expired certs are rejected early with a clear error.

### Current state (to change)

In `src/as4/node42.js`, `sendViaNode42()` currently:

1. Reads cert and key from filesystem paths
2. Hardcodes `dryrun: true` (line ~35)
3. Has no cert expiry validation

### Target state

1. `sendViaNode42()` accepts a cert object from the identity store (or loads it via `identityStore.getActiveCert()`)
2. Before building the AS4 message, checks `cert.expiresAt` against current time — if expired, throws `CertExpiredError`
3. `dryrun` is set from config (`AP_CORE_DRY_RUN` env var, default `false`)
4. The truststore path is configurable (`AP_CORE_TRUSTSTORE_PATH`, default `~/.node42/certs/truststore.pem`)

### Error handling

```typescript
class CertExpiredError extends Error {
  constructor(certId: string, expiresAt: string) {
    super(`Certificate ${certId} expired at ${expiresAt}`);
    this.name = 'CertExpiredError';
  }
}

class CertNotFoundError extends Error {
  constructor() {
    super('No active certificate found in identity store');
    this.name = 'CertNotFoundError';
  }
}
```

### Flow changes in `sendInvoice()`

```
1. Load active cert from identityStore.getActiveCert()
2. If no cert → throw CertNotFoundError
3. If cert expired → throw CertExpiredError
4. Pass certPem, keyPem, truststorePath to node42.sendViaNode42()
5. node42.sendViaNode42() builds and sends (no dryrun)
6. On success → transactionStore.save() with status 'sent'
7. On MDN receipt → transactionStore.updateStatus() with 'delivered'
8. On network error → transactionStore.updateStatus() with 'error', schedule retry
```

### Files to modify

| File | Change |
|------|--------|
| `src/as4/node42.js` | Remove filesystem cert loading. Accept `{ certPem, keyPem, truststorePath, dryrun }` as parameters. Remove `dryrun: true` hardcode. Add cert expiry check. |
| `src/index.js` | `sendInvoice()` loads cert from `identityStore.getActiveCert()` before calling `node42.sendViaNode42()`. Handle `CertExpiredError` and `CertNotFoundError`. |
| `server/index.js` | Read `AP_CORE_DRY_RUN` and `AP_CORE_TRUSTSTORE_PATH` env vars |
| `test/ap-core.test.js` | Add tests for expired cert, missing cert, successful send with real params |

### New files

| File | Purpose |
|------|---------|
| `src/errors.js` | `CertExpiredError`, `CertNotFoundError` (and future AP Core error types) |

## Acceptance criteria

- [ ] `sendViaNode42()` no longer reads cert/key from filesystem — receives them as parameters
- [ ] `dryrun` is controlled by `AP_CORE_DRY_RUN` env var, default `false`
- [ ] `sendInvoice()` loads cert from `identityStore.getActiveCert()` before every send
- [ ] If no active cert exists, `CertNotFoundError` is thrown with a clear message
- [ ] If the active cert is expired, `CertExpiredError` is thrown with cert ID and expiry date
- [ ] Truststore path is configurable via `AP_CORE_TRUSTSTORE_PATH` (default: `~/.node42/certs/truststore.pem`)
- [ ] Successful send: transaction is saved with status `sent`, then updated to `delivered` on MDN receipt
- [ ] Failed send: transaction is saved with status `error` and `errorMessage` is populated
- [ ] Error classes are exported from `src/errors.js`
- [ ] All existing tests remain green (mock adapter returns a mock cert for the send path)
- [ ] Tests cover: valid cert send, expired cert rejection, missing cert rejection

## Blocked by

- Slice 2 — SQLite storage adapter (doc/issues/002-sqlite-storage-adapter.md)
