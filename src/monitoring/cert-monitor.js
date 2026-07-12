/**
 * Certificate Expiry Monitoring
 *
 * Checks the expiry status of certificates stored in the APIdentityStore.
 * Provides structured alerts with levels: ok | warning | critical
 *
 * Alert thresholds:
 *   ≤ 0 days   → critical  (expired)
 *   ≤ 7 days   → critical
 *   ≤ 30 days  → warning
 *   > 30 days  → ok
 *
 * Usage (CLI):
 *   node src/monitoring/cert-monitor.js
 *   node src/monitoring/cert-monitor.js --warning-days 14 --critical-days 3
 *
 * Usage (module):
 *   import { checkCertExpiry } from './monitoring/cert-monitor.js';
 *   const alerts = await checkCertExpiry(store, { warningDays: 30, criticalDays: 7 });
 */

import { getCertificateInfo } from '../as4/node42.js';
import { createStore } from '../store/factory.js';

/**
 * Check expiry status for all certificates in the identity store.
 *
 * @param {Object} store - APIdentityStore (with getActiveCert, getCert methods)
 * @param {Object} [options]
 * @param {number} [options.warningDays=30]  - Days remaining to trigger warning level
 * @param {number} [options.criticalDays=7]  - Days remaining to trigger critical level
 * @returns {Promise<Array<{ level: string, cert: Object, message: string }>>}
 */
export async function checkCertExpiry(store, options = {}) {
  const { warningDays = 30, criticalDays = 7 } = options;

  const results = [];

  // Check active cert
  const activeCert = await store.getActiveCert();
  if (!activeCert) {
    results.push({
      level: 'critical',
      cert: null,
      message: 'No active certificate found in identity store',
    });
    return results;
  }

  const activeResult = await _checkSingleCert(activeCert, warningDays, criticalDays);
  results.push(activeResult);

  return results;
}

/**
 * Check a single certificate's expiry.
 *
 * @param {Object} certEntry - CertEntry from APIdentityStore
 * @param {number} warningDays
 * @param {number} criticalDays
 * @returns {Promise<{ level: string, cert: Object, message: string }>}
 */
async function _checkSingleCert(certEntry, warningDays, criticalDays) {
  const { certId, certPem, expiresAt } = certEntry;

  let subject = '(unknown)';
  let issuer = '(unknown)';
  let daysRemaining;

  // Try to parse certificate for detailed info
  if (certPem && !certPem.includes('MOCKCERT')) {
    try {
      const info = await getCertificateInfo(certPem);
      subject = info.subject || subject;
      issuer = info.issuer || issuer;
      if (info.validTo) {
        const expiryDate = new Date(info.validTo);
        daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }
    } catch {
      // Fall through to expiresAt-based calculation
    }
  }

  // Fall back to stored expiresAt field
  if (daysRemaining === undefined && expiresAt) {
    const expiryDate = new Date(expiresAt);
    daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  // If no expiry info at all, return critical
  if (daysRemaining === undefined) {
    return {
      level: 'critical',
      cert: {
        certId,
        subject,
        issuer,
        expiresAt: expiresAt || null,
        daysRemaining: null,
      },
      message: `Certificate ${certId} has no expiry information`,
    };
  }

  // Determine alert level
  let level;
  if (daysRemaining <= 0) {
    level = 'critical';
  } else if (daysRemaining <= criticalDays) {
    level = 'critical';
  } else if (daysRemaining <= warningDays) {
    level = 'warning';
  } else {
    level = 'ok';
  }

  // Build human-readable message
  if (daysRemaining <= 0) {
    return {
      level,
      cert: { certId, subject, issuer, expiresAt: expiresAt || null, daysRemaining },
      message: `Certificate ${certId} expired ${Math.abs(daysRemaining)} day(s) ago`,
    };
  }

  const statusLabel = level === 'critical' ? 'EXPIRED' : level === 'warning' ? 'expiring soon' : 'OK';
  const message = daysRemaining === 1
    ? `Certificate ${certId} expires tomorrow`
    : `Certificate ${certId} expires in ${daysRemaining} days — Status: ${statusLabel}`;

  return {
    level,
    cert: { certId, subject, issuer, expiresAt: expiresAt || null, daysRemaining },
    message,
  };
}

// ── CLI entry point ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const warningDays = parseInt(_getFlag(args, '--warning-days', '-w') ?? '30', 10);
  const criticalDays = parseInt(_getFlag(args, '--critical-days', '-c') ?? '7', 10);

  const storeAdapter = process.env.PEPPOL_STORE_ADAPTER || 'mock';
  const stores = createStore(storeAdapter, { dbPath: process.env.AP_CORE_DB_PATH });

  console.log(`\n🔍 Certificate Expiry Check (warning: ${warningDays}d, critical: ${criticalDays}d)\n`);

  const alerts = await checkCertExpiry(stores.identityStore, { warningDays, criticalDays });

  let hasIssues = false;
  for (const alert of alerts) {
    const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '✅';
    console.log(`${icon} [${alert.level.toUpperCase()}] ${alert.message}`);
    if (alert.cert) {
      console.log(`   Subject: ${alert.cert.subject}`);
      console.log(`   Issuer:  ${alert.cert.issuer}`);
      if (alert.cert.expiresAt) {
        console.log(`   Expires: ${alert.cert.expiresAt} (${alert.cert.daysRemaining} days remaining)`);
      }
    }
    if (alert.level !== 'ok') hasIssues = true;
  }

  console.log('');
  if (hasIssues) {
    process.exit(alerts.some(a => a.level === 'critical') ? 1 : 0);
  } else {
    console.log('✅ All certificates are valid\n');
    process.exit(0);
  }
}

function _getFlag(args, long, short) {
  const i = args.indexOf(long);
  if (i !== -1 && i + 1 < args.length) return args[i + 1];
  const j = args.indexOf(short);
  if (j !== -1 && j + 1 < args.length) return args[j + 1];
  return null;
}

// Run as CLI only when this file is executed directly (not imported as a module)
// Use import.meta.url in ESM, process.argv[1] in CJS fallback
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cert-monitor.js');

if (isMain) {
  main().catch((err) => {
    console.error('Certificate check failed:', err.message);
    process.exit(1);
  });
}
