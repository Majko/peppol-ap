/**
 * Store factory — selects and initialises the requested storage adapter.
 *
 * @param {'mock'|'sqlite'} [adapter='mock']
 * @param {Object} [options]
 * @param {string} [options.dbPath]  Required when adapter is 'sqlite'
 * @returns {{ transactionStore: TransactionStore, smpCache: SMPCache, identityStore: APIdentityStore }}
 */
import { transactionStore as mockTx, smpCache as mockSMP, identityStore as mockIdentity } from './mock.js';
import { createSQLiteStores } from './sqlite.js';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_DB_PATH = join(homedir(), '.peppol-ap', 'ap-core.db');

export function createStore(adapter = 'mock', options = {}) {
  switch (adapter) {
    case 'mock':
      return {
        transactionStore: mockTx,
        smpCache: mockSMP,
        identityStore: mockIdentity,
      };
    case 'sqlite': {
      const dbPath = options.dbPath || process.env.AP_CORE_DB_PATH || DEFAULT_DB_PATH;
      return createSQLiteStores(dbPath);
    }
    default:
      throw new Error(`Unknown store adapter: ${adapter}. Supported: 'mock', 'sqlite'.`);
  }
}
