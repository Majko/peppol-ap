/**
 * Interface contract tests for storage adapters.
 * Run with: npm test -- test/storage-adapter.test.js
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { transactionStore, smpCache, identityStore, resetMockStores } from '../src/store/mock.js';
import { createStore } from '../src/store/factory.js';
import { rm } from 'fs/promises';

const TEST_DB = '/tmp/peppol-ap-test.db';

// ─── Mock adapter — TransactionStore ─────────────────────────────────────────
describe('Mock adapter — TransactionStore', () => {
  beforeEach(() => resetMockStores());

  it('save() and get() round-trip', async () => {
    await transactionStore.save({ messageId: 'msg-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    const result = await transactionStore.get('msg-001');
    expect(result).toMatchObject({ messageId: 'msg-001', direction: 'send', status: 'pending' });
  });

  it('get() returns null for unknown messageId', async () => {
    const result = await transactionStore.get('does-not-exist');
    expect(result).toBeNull();
  });

  it('list() returns all transactions when no filter', async () => {
    await transactionStore.save({ messageId: 'a', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await transactionStore.save({ messageId: 'b', direction: 'receive', status: 'received', timestamp: new Date().toISOString() });
    const all = await transactionStore.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('list() filters by direction', async () => {
    await transactionStore.save({ messageId: 'a', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await transactionStore.save({ messageId: 'b', direction: 'receive', status: 'received', timestamp: new Date().toISOString() });
    const sent = await transactionStore.list({ direction: 'send' });
    expect(sent).toHaveLength(1);
    expect(sent[0].messageId).toBe('a');
  });

  it('list() filters by status', async () => {
    await transactionStore.save({ messageId: 'a', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await transactionStore.save({ messageId: 'b', direction: 'send', status: 'delivered', timestamp: new Date().toISOString() });
    const pending = await transactionStore.list({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].messageId).toBe('a');
  });

  it('list() respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await transactionStore.save({ messageId: `m-${i}`, direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    }
    const limited = await transactionStore.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('updateStatus() changes status', async () => {
    await transactionStore.save({ messageId: 'msg-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await transactionStore.updateStatus('msg-001', 'delivered', {});
    const tx = await transactionStore.get('msg-001');
    expect(tx.status).toBe('delivered');
    expect(tx.completedAt).toBeTruthy();
  });

  it('updateStatus() sets errorMessage on error status', async () => {
    await transactionStore.save({ messageId: 'msg-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await transactionStore.updateStatus('msg-001', 'error', { errorMessage: 'Network timeout' });
    const tx = await transactionStore.get('msg-001');
    expect(tx.status).toBe('error');
    expect(tx.errorMessage).toBe('Network timeout');
  });

  it('duplicate messageId is replaced', async () => {
    await transactionStore.save({ messageId: 'dup-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await transactionStore.save({ messageId: 'dup-001', direction: 'receive', status: 'delivered', timestamp: new Date().toISOString() });
    const result = await transactionStore.get('dup-001');
    expect(result.messageId).toBe('dup-001');
    expect(result.direction).toBe('receive');
  });
});

// ─── Mock adapter — SMPCache ──────────────────────────────────────────────────
describe('Mock adapter — SMPCache', () => {
  beforeEach(() => resetMockStores());

  it('get() returns null for unknown participant', async () => {
    const result = await smpCache.get('9914:SK999999');
    expect(result).toBeNull();
  });

  it('set() and get() round-trip', async () => {
    const entry = { participantId: '9914:SK001', endpointUrl: 'https://smp.example.com', resolvedAt: new Date().toISOString() };
    await smpCache.set('9914:SK001', entry, 3600);
    const result = await smpCache.get('9914:SK001');
    expect(result).toMatchObject({ participantId: '9914:SK001', endpointUrl: 'https://smp.example.com' });
  });

  it('get() returns null for expired entry', async () => {
    const entry = { participantId: '9914:SK001', endpointUrl: 'https://smp.example.com', resolvedAt: new Date().toISOString() };
    await smpCache.set('9914:SK001', entry, 0);
    await new Promise(r => setTimeout(r, 10));
    const result = await smpCache.get('9914:SK001');
    expect(result).toBeNull();
  });

  it('invalidate() removes the entry', async () => {
    const entry = { participantId: '9914:SK001', endpointUrl: 'https://smp.example.com', resolvedAt: new Date().toISOString() };
    await smpCache.set('9914:SK001', entry, 3600);
    await smpCache.invalidate('9914:SK001');
    const result = await smpCache.get('9914:SK001');
    expect(result).toBeNull();
  });
});

// ─── Mock adapter — APIdentityStore ─────────────────────────────────────────
describe('Mock adapter — APIdentityStore', () => {
  beforeEach(() => resetMockStores());

  const makeCert = (id, active) => ({
    certId: id,
    certPem: `-----BEGIN CERTIFICATE-----\nMIIB${id}\n-----END CERTIFICATE-----`,
    privKeyPem: `-----BEGIN PRIVATE KEY-----\nMIIE${id}\n-----END PRIVATE KEY-----`,
    isActive: active,
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  });

  it('getActiveCert() returns null when no certs stored', async () => {
    const result = await identityStore.getActiveCert();
    expect(result).toBeNull();
  });

  it('storeCert() and getCert() round-trip', async () => {
    await identityStore.storeCert(makeCert('cert-001', false));
    const result = await identityStore.getCert('cert-001');
    expect(result.certId).toBe('cert-001');
  });

  it('getActiveCert() returns the active cert', async () => {
    await identityStore.storeCert(makeCert('cert-001', false));
    await identityStore.storeCert(makeCert('cert-002', true));
    const result = await identityStore.getActiveCert();
    expect(result.certId).toBe('cert-002');
  });

  it('storeCert() with isActive=true deactivates previous active cert', async () => {
    await identityStore.storeCert(makeCert('cert-001', true));
    await identityStore.storeCert(makeCert('cert-002', true));
    const cert1 = await identityStore.getCert('cert-001');
    const cert2 = await identityStore.getCert('cert-002');
    expect(cert1.isActive).toBe(false);
    expect(cert2.isActive).toBe(true);
  });
});

// ─── SQLite adapter — TransactionStore ───────────────────────────────────────
const TEST_DB_TX = '/tmp/peppol-ap-test-tx.db';
describe('SQLite adapter — TransactionStore', () => {
  /** @type {ReturnType<typeof import('../src/store/sqlite.js').createSQLiteStores>} */
  let stores;

  beforeAll(async () => {
    try { await rm(TEST_DB_TX, { force: true }); } catch {}
    try { await rm(`${TEST_DB_TX}-wal`, { force: true }); } catch {}
    try { await rm(`${TEST_DB_TX}-shm`, { force: true }); } catch {}
    const { createSQLiteStores } = await import('../src/store/sqlite.js');
    stores = createSQLiteStores(TEST_DB_TX);
  });

  afterAll(async () => {
    try { stores?.transactionStore?.db?.close(); } catch {}
    try { await rm(TEST_DB_TX, { force: true }); } catch {}
    try { await rm(`${TEST_DB_TX}-wal`, { force: true }); } catch {}
    try { await rm(`${TEST_DB_TX}-shm`, { force: true }); } catch {}
  });

  it('save() and get() round-trip', async () => {
    await stores.transactionStore.save({ messageId: 'sq-msg-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    const result = await stores.transactionStore.get('sq-msg-001');
    expect(result).toMatchObject({ messageId: 'sq-msg-001', direction: 'send', status: 'pending' });
  });

  it('get() returns null for unknown messageId', async () => {
    const result = await stores.transactionStore.get('does-not-exist');
    expect(result).toBeNull();
  });

  it('list() returns all transactions when no filter', async () => {
    await stores.transactionStore.save({ messageId: 'sq-a', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await stores.transactionStore.save({ messageId: 'sq-b', direction: 'receive', status: 'received', timestamp: new Date().toISOString() });
    const all = await stores.transactionStore.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('list() filters by direction', async () => {
    await stores.transactionStore.save({ messageId: 'sq-c', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await stores.transactionStore.save({ messageId: 'sq-d', direction: 'receive', status: 'received', timestamp: new Date().toISOString() });
    const sent = await stores.transactionStore.list({ direction: 'send' });
    const hasC = sent.some(t => t.messageId === 'sq-c');
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(hasC).toBe(true);
  });

  it('list() filters by status', async () => {
    await stores.transactionStore.save({ messageId: 'sq-e', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await stores.transactionStore.save({ messageId: 'sq-f', direction: 'send', status: 'delivered', timestamp: new Date().toISOString() });
    const pending = await stores.transactionStore.list({ status: 'pending' });
    const hasE = pending.some(t => t.messageId === 'sq-e');
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(hasE).toBe(true);
  });

  it('list() respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await stores.transactionStore.save({ messageId: `sq-li-${i}`, direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    }
    const limited = await stores.transactionStore.list({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('updateStatus() changes status', async () => {
    await stores.transactionStore.save({ messageId: 'sq-us-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await stores.transactionStore.updateStatus('sq-us-001', 'delivered', {});
    const tx = await stores.transactionStore.get('sq-us-001');
    expect(tx.status).toBe('delivered');
    expect(tx.completedAt).toBeTruthy();
  });

  it('updateStatus() sets errorMessage on error status', async () => {
    await stores.transactionStore.save({ messageId: 'sq-us-002', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await stores.transactionStore.updateStatus('sq-us-002', 'error', { errorMessage: 'Network timeout' });
    const tx = await stores.transactionStore.get('sq-us-002');
    expect(tx.status).toBe('error');
    expect(tx.errorMessage).toBe('Network timeout');
  });

  it('duplicate messageId is replaced', async () => {
    await stores.transactionStore.save({ messageId: 'sq-dup-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    await stores.transactionStore.save({ messageId: 'sq-dup-001', direction: 'receive', status: 'delivered', timestamp: new Date().toISOString() });
    const result = await stores.transactionStore.get('sq-dup-001');
    expect(result.messageId).toBe('sq-dup-001');
    expect(result.direction).toBe('receive');
  });

  it('persists across close+reopen', async () => {
    // Save data
    await stores.transactionStore.save({ messageId: 'sq-persist-001', direction: 'send', status: 'pending', timestamp: new Date().toISOString() });
    const db = stores.transactionStore.db;
    // Checkpoint WAL so all data is flushed to the main db file before closing
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    // Reopen the SAME file path
    const { createSQLiteStores: cs2 } = await import('../src/store/sqlite.js');
    const stores2 = cs2(TEST_DB_TX);
    const result = await stores2.transactionStore.get('sq-persist-001');
    expect(result).toMatchObject({ messageId: 'sq-persist-001' });
    stores2.transactionStore.db.close();
  });
});

// ─── SQLite adapter — SMPCache ──────────────────────────────────────────────
const TEST_DB_SMP = '/tmp/peppol-ap-test-smp.db';
describe('SQLite adapter — SMPCache', () => {
  /** @type {ReturnType<typeof import('../src/store/sqlite.js').createSQLiteStores>} */
  let stores;

  beforeAll(async () => {
    try { await rm(TEST_DB_SMP, { force: true }); } catch {}
    try { await rm(`${TEST_DB_SMP}-wal`, { force: true }); } catch {}
    try { await rm(`${TEST_DB_SMP}-shm`, { force: true }); } catch {}
    const { createSQLiteStores } = await import('../src/store/sqlite.js');
    stores = createSQLiteStores(TEST_DB_SMP);
  });

  afterAll(async () => {
    try { stores?.transactionStore?.db?.close(); } catch {}
    try { await rm(TEST_DB_SMP, { force: true }); } catch {}
    try { await rm(`${TEST_DB_SMP}-wal`, { force: true }); } catch {}
    try { await rm(`${TEST_DB_SMP}-shm`, { force: true }); } catch {}
  });

  it('get() returns null for unknown participant', async () => {
    const result = await stores.smpCache.get('9914:SK999999');
    expect(result).toBeNull();
  });

  it('set() and get() round-trip', async () => {
    const entry = { participantId: '9914:SK001', endpointUrl: 'https://smp.example.com', resolvedAt: new Date().toISOString() };
    await stores.smpCache.set('9914:SK001', entry, 3600);
    const result = await stores.smpCache.get('9914:SK001');
    expect(result).toMatchObject({ participantId: '9914:SK001', endpointUrl: 'https://smp.example.com' });
  });

  it('get() returns null for expired entry', async () => {
    const entry = { participantId: '9914:SK001', endpointUrl: 'https://smp.example.com', resolvedAt: new Date().toISOString() };
    await stores.smpCache.set('9914:SK001', entry, 0);
    await new Promise(r => setTimeout(r, 10));
    const result = await stores.smpCache.get('9914:SK001');
    expect(result).toBeNull();
  });

  it('invalidate() removes the entry', async () => {
    const entry = { participantId: '9914:SK001', endpointUrl: 'https://smp.example.com', resolvedAt: new Date().toISOString() };
    await stores.smpCache.set('9914:SK001', entry, 3600);
    await stores.smpCache.invalidate('9914:SK001');
    const result = await stores.smpCache.get('9914:SK001');
    expect(result).toBeNull();
  });
});

// ─── SQLite adapter — APIdentityStore ───────────────────────────────────────
const TEST_DB_ID = '/tmp/peppol-ap-test-id.db';
describe('SQLite adapter — APIdentityStore', () => {
  /** @type {ReturnType<typeof import('../src/store/sqlite.js').createSQLiteStores>} */
  let stores;

  beforeAll(async () => {
    try { await rm(TEST_DB_ID, { force: true }); } catch {}
    try { await rm(`${TEST_DB_ID}-wal`, { force: true }); } catch {}
    try { await rm(`${TEST_DB_ID}-shm`, { force: true }); } catch {}
    const { createSQLiteStores } = await import('../src/store/sqlite.js');
    stores = createSQLiteStores(TEST_DB_ID);
  });

  afterAll(async () => {
    try { stores?.transactionStore?.db?.close(); } catch {}
    try { await rm(TEST_DB_ID, { force: true }); } catch {}
    try { await rm(`${TEST_DB_ID}-wal`, { force: true }); } catch {}
    try { await rm(`${TEST_DB_ID}-shm`, { force: true }); } catch {}
  });

  const makeCert = (id, active) => ({
    certId: id,
    certPem: `-----BEGIN CERTIFICATE-----\nMIIB${id}\n-----END CERTIFICATE-----`,
    privKeyPem: `-----BEGIN PRIVATE KEY-----\nMIIE${id}\n-----END PRIVATE KEY-----`,
    isActive: active,
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  });

  it('getActiveCert() returns null when no certs stored', async () => {
    const result = await stores.identityStore.getActiveCert();
    expect(result).toBeNull();
  });

  it('storeCert() and getCert() round-trip', async () => {
    await stores.identityStore.storeCert(makeCert('sq-cert-001', false));
    const result = await stores.identityStore.getCert('sq-cert-001');
    expect(result.certId).toBe('sq-cert-001');
  });

  it('getActiveCert() returns the active cert', async () => {
    await stores.identityStore.storeCert(makeCert('sq-cert-001', false));
    await stores.identityStore.storeCert(makeCert('sq-cert-002', true));
    const result = await stores.identityStore.getActiveCert();
    expect(result.certId).toBe('sq-cert-002');
  });

  it('storeCert() with isActive=true deactivates previous active cert', async () => {
    await stores.identityStore.storeCert(makeCert('sq-cert-003', true));
    await stores.identityStore.storeCert(makeCert('sq-cert-004', true));
    const cert3 = await stores.identityStore.getCert('sq-cert-003');
    const cert4 = await stores.identityStore.getCert('sq-cert-004');
    expect(cert3.isActive).toBe(false);
    expect(cert4.isActive).toBe(true);
  });
});

// ─── Factory tests ───────────────────────────────────────────────────────────
describe('Store factory', () => {
  it('createStore("mock") returns all three stores', () => {
    const { transactionStore: tx, smpCache: smp, identityStore: id } = createStore('mock');
    expect(typeof tx.save).toBe('function');
    expect(typeof smp.get).toBe('function');
    expect(typeof id.storeCert).toBe('function');
  });

  it('createStore() defaults to mock', async () => {
    const stores = createStore();
    const tx = await stores.transactionStore.get('nonexistent');
    expect(tx).toBeNull();
  });

  it('createStore("sqlite") with temp path succeeds', () => {
    const stores = createStore('sqlite', { dbPath: TEST_DB });
    expect(typeof stores.transactionStore.save).toBe('function');
    expect(typeof stores.smpCache.get).toBe('function');
    expect(typeof stores.identityStore.storeCert).toBe('function');
    try { stores.transactionStore.db?.close(); } catch {}
  });

  it('createStore("unknown") throws', () => {
    expect(() => createStore('unknown')).toThrow('Unknown store adapter');
  });
});
