# Storage Adapter Interface + Mock (Prefactor)

## What to build

Introduce a storage adapter interface that replaces the current module-scoped `const transactions = new Map()` in `src/index.js`. The interface defines three store types (`TransactionStore`, `SMPCache`, `APIdentityStore`) and ships with a mock in-memory adapter that implements all three. Refactor `src/index.js` and all downstream code to receive the store via dependency injection (a factory function) instead of importing the `Map` directly.

The mock adapter must behave identically to the current `Map` so that all 90 existing tests remain green after the refactor. No new functionality — this is pure structural preparation for the SQLite adapter (Slice 2).

### Interface shapes

```typescript
interface TransactionStore {
  save(tx: Transaction): Promise<void>;
  get(messageId: string): Promise<Transaction | null>;
  list(filters?: { direction?: string; status?: string; senderId?: string; receiverId?: string; limit?: number }): Promise<Transaction[]>;
  updateStatus(messageId: string, status: string, metadata?: Record<string, unknown>): Promise<void>;
}

interface SMPCache {
  get(participantId: string): Promise<SMPEntry | null>;
  set(participantId: string, entry: SMPEntry, ttlSeconds: number): Promise<void>;
  invalidate(participantId: string): Promise<void>;
}

interface APIdentityStore {
  getActiveCert(): Promise<CertEntry | null>;
  getCert(certId: string): Promise<CertEntry | null>;
  storeCert(entry: CertEntry): Promise<void>;
}
```

### Transaction shape (formalise what's currently in the Map)

```typescript
interface Transaction {
  messageId: string;
  direction: 'send' | 'receive';
  status: 'pending' | 'sent' | 'delivered' | 'error' | 'received';
  senderId?: string;
  receiverId?: string;
  senderAPId?: string;
  receiverAPId?: string;
  docTypeId?: string;
  processId?: string;
  transportProfile?: string;
  payloadKey?: string;           // reference to stored payload
  sbdhXml?: string;
  ublXml?: string;
  receiptXml?: string | null;
  errorMessage?: string | null;
  retries?: number;
  timestamp: string;             // ISO 8601
  completedAt?: string | null;
}
```

### Factory function

```javascript
// src/store/factory.js
export function createStore(adapter = 'mock', options = {}) {
  switch (adapter) {
    case 'mock':
      return createMockStores();
    case 'sqlite':
      return createSQLiteStores(options.dbPath);
    // future: case 'dynamodb': ...
  }
}
```

### Files to modify

| File | Change |
|------|--------|
| `src/index.js` | Remove `const transactions = new Map()`. Accept stores via `setStores()` or factory. All `transactions.*` calls → `this.transactionStore.*`. |
| `src/index.js` | `sendInvoice()` — use `transactionStore.save()` instead of `transactions.set()`. `getStatus()` — use `transactionStore.get()`. |
| `src/simulator.js` | `simulateSend()` — accept/store reference to the transaction store. |
| `test/ap-core.test.js` | Should work unchanged (mock adapter produces same behaviour as current Map). Verify no test changes needed. |
| `test/server-integration.test.js` | Should work unchanged. The Express app uses mock adapter by default. |

### New files

| File | Purpose |
|------|---------|
| `src/store/types.js` | JSDoc type definitions for Transaction, SMPEntry, CertEntry |
| `src/store/interfaces.js` | JSDoc-documented interface functions (or a base class pattern) |
| `src/store/mock.js` | Mock in-memory implementation of all three stores |
| `src/store/factory.js` | Factory that selects adapter |
| `test/storage-adapter.test.js` | Interface contract tests that any adapter must pass |

## Acceptance criteria

- [ ] `TransactionStore` interface is defined with `save`, `get`, `list`, `updateStatus`
- [ ] `SMPCache` interface is defined with `get`, `set`, `invalidate`
- [ ] `APIdentityStore` interface is defined with `getActiveCert`, `getCert`, `storeCert`
- [ ] Mock in-memory adapter implements all three stores
- [ ] Mock adapter behaviour matches the current `Map` exactly (same return shapes, same error handling)
- [ ] `src/index.js` uses the factory to obtain stores (default: mock)
- [ ] `sendInvoice()` writes to `transactionStore.save()` instead of `transactions.set()`
- [ ] `getStatus()` reads from `transactionStore.get()` instead of `transactions.get()`
- [ ] `lookupParticipant()` uses `smpCache.get()`/`set()` instead of nothing (caching is introduced but the mock is a no-op passthrough for now)
- [ ] All 90 existing tests pass with zero modifications
- [ ] Interface contract tests in `test/storage-adapter.test.js` pass for the mock adapter
- [ ] `npm test` is green

## Blocked by

None — can start immediately.
