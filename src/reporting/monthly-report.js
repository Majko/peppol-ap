/**
 * Monthly Reporting Module
 *
 * Generates structured monthly reports from transaction data, covering:
 * - Summary statistics (total, by direction, by status)
 * - Value metrics (total invoice value, average, by country)
 * - Participant analytics (top senders/receivers)
 * - Delivery performance (success rate, avg time-to-deliver)
 * - Period-over-period comparison
 */

import { getTransactions } from '../index.js';

/**
 * Parse a period string like "2026-06" into from/to Date bounds.
 * @param {string} period  Format: YYYY-MM
 * @returns {{ from: Date, to: Date }}
 */
function parsePeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
}

/**
 * Extract country code from a participant ID like "9914:SK2023456789" or "SK2023456789".
 * @param {string|undefined} participantId
 * @returns {string}
 */
function extractCountry(participantId) {
  if (!participantId) return 'UNKNOWN';
  // Handle format "9914:SK2023456789"
  if (participantId.includes(':')) {
    const value = participantId.split(':')[1];
    if (value && value.length >= 2) return value.substring(0, 2);
  }
  // Handle bare country prefix like "SK2023456789"
  if (participantId.length >= 2 && participantId.substring(0, 2) === participantId.substring(0, 2).toUpperCase()) {
    return participantId.substring(0, 2);
  }
  return 'UNKNOWN';
}

/**
 * Parse an invoice XML to extract monetary totals.
 * Falls back gracefully if extraction fails.
 * @param {string|undefined} ublXml
 * @returns {number}
 */
function extractMonetaryTotal(ublXml) {
  if (!ublXml) return 0;
  try {
    // Try to find taxInclusiveAmount or payableAmount
    const match = ublXml.match(/<(?:TaxInclusiveAmount|PayableAmount)[^>]*>([^<]+)<\/[^>]+>/);
    if (match) {
      const val = parseFloat(match[1]);
      return isNaN(val) ? 0 : val;
    }
    // Fallback: line extension amount
    const lineMatch = ublXml.match(/<LineExtensionAmount[^>]*>([^<]+)<\/[^>]+>/);
    if (lineMatch) {
      const val = parseFloat(lineMatch[1]);
      return isNaN(val) ? 0 : val;
    }
  } catch {
    // ignore
  }
  return 0;
}

/**
 * Compute time-to-deliver in seconds between timestamp and completedAt.
 * @param {string|undefined} timestamp
 * @param {string|undefined} completedAt
 * @returns {number|null}
 */
function deliveryTimeSeconds(timestamp, completedAt) {
  if (!timestamp || !completedAt) return null;
  try {
    return (new Date(completedAt) - new Date(timestamp)) / 1000;
  } catch {
    return null;
  }
}

/**
 * Group an array of items by a key function and sum a value field.
 * @param {Array} items
 * @param {(item: Object) => string} keyFn
 * @param {(item: Object) => number} [valueFn]
 * @returns {Record<string, number>}
 */
function groupAndSum(items, keyFn, valueFn = () => 1) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + valueFn(item);
    return acc;
  }, {});
}

/**
 * Top-N entries from a record sorted by value descending.
 * @param {Record<string, number>} record
 * @param {number} n
 * @returns {Array<{key: string, count: number}>}
 */
function topN(record, n = 10) {
  return Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Generate a monthly report from a list of transactions.
 *
 * @param {Object} config
 * @param {string} config.period          YYYY-MM period identifier
 * @param {string} [config.apId='POP000001']  Service provider ID
 * @param {string} [config.country='SK']  Own country for country-pair analysis
 * @param {string} [config.periodLast]    Prior period for comparison (YYYY-MM)
 * @param {Transaction[]} [transactions]  Pre-loaded transactions (optional, will fetch if omitted)
 * @returns {Promise<Object>} Structured report object
 */
export async function generateMonthlyReport(config, transactions) {
  const { period, apId = 'POP000001', country = 'SK', periodLast = null } = config;

  // Fetch transactions if not provided
  if (!transactions) {
    transactions = await getTransactions({ limit: 10000 });
  }

  const { from, to } = parsePeriod(period);

  // Filter to the requested period
  const periodTxs = transactions.filter(tx => {
    try {
      const ts = new Date(tx.timestamp);
      return ts >= from && ts <= to;
    } catch {
      return false;
    }
  });

  // ── Summary statistics ──────────────────────────────────────────────────────
  const total = periodTxs.length;
  const byDirection = groupAndSum(periodTxs, tx => tx.direction ?? 'unknown');
  const byStatus = groupAndSum(periodTxs, tx => tx.status ?? 'unknown');

  // ── Value metrics ──────────────────────────────────────────────────────────
  // Extract monetary totals from UBL XML where available
  const withValues = periodTxs.map(tx => ({
    ...tx,
    value: extractMonetaryTotal(tx.ublXml),
  }));

  const totalValue = withValues.reduce((sum, tx) => sum + (tx.value || 0), 0);
  const valuedTxs = withValues.filter(tx => tx.value > 0);
  const avgValue = valuedTxs.length > 0 ? totalValue / valuedTxs.length : 0;

  // By-country value breakdown (use receiver country for received, sender for sent)
  /** @type {Record<string, {count: number, total: number}>} */
  const countryValueMap = {};
  for (const tx of periodTxs) {
    const c = tx.direction === 'receive'
      ? extractCountry(tx.receiverId)
      : extractCountry(tx.senderId);
    if (!countryValueMap[c]) countryValueMap[c] = { count: 0, total: 0 };
    const v = extractMonetaryTotal(tx.ublXml);
    countryValueMap[c].count++;
    countryValueMap[c].total += v;
  }
  const byCountry = Object.entries(countryValueMap).map(([c, { count, total: tot }]) => ({
    country: c,
    count,
    totalValue: Math.round(tot * 100) / 100,
    avgValue: count > 0 ? Math.round((tot / count) * 100) / 100 : 0,
  }));

  // ── Participant analytics ───────────────────────────────────────────────────
  const senderCounts = groupAndSum(periodTxs, tx => tx.senderId ?? 'unknown');
  const receiverCounts = groupAndSum(periodTxs, tx => tx.receiverId ?? 'unknown');

  const topSenders = topN(senderCounts, 10).map(e => ({ participantId: e.key, count: e.count }));
  const topReceivers = topN(receiverCounts, 10).map(e => ({ participantId: e.key, count: e.count }));

  // ── Delivery performance ───────────────────────────────────────────────────
  const deliverableStatuses = new Set(['delivered', 'received']);
  const deliveredTxs = periodTxs.filter(tx => deliverableStatuses.has(tx.status));
  const successRate = total > 0 ? Math.round((deliveredTxs.length / total) * 10000) / 100 : 0;

  // Average time-to-deliver for transactions that have completedAt
  const deliveryTimes = periodTxs
    .map(tx => deliveryTimeSeconds(tx.timestamp, tx.completedAt))
    .filter(t => t !== null && t >= 0);

  const avgDeliverySeconds = deliveryTimes.length > 0
    ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length * 100) / 100
    : null;

  // ── Period-over-period comparison ─────────────────────────────────────────
  let pop = null;
  if (periodLast) {
    const { from: lastFrom, to: lastTo } = parsePeriod(periodLast);
    const lastPeriodTxs = transactions.filter(tx => {
      try {
        const ts = new Date(tx.timestamp);
        return ts >= lastFrom && ts <= lastTo;
      } catch {
        return false;
      }
    });

    const lastTotal = lastPeriodTxs.length;
    const lastDelivered = lastPeriodTxs.filter(tx => deliverableStatuses.has(tx.status)).length;
    const lastSuccessRate = lastTotal > 0 ? Math.round((lastDelivered / lastTotal) * 10000) / 100 : 0;

    const lastValue = lastPeriodTxs.reduce((sum, tx) => sum + extractMonetaryTotal(tx.ublXml), 0);

    pop = {
      previousPeriod: periodLast,
      transactionCount: { current: total, previous: lastTotal,
        delta: lastTotal > 0 ? Math.round(((total - lastTotal) / lastTotal) * 10000) / 100 : null },
      successRate: { current: successRate, previous: lastSuccessRate,
        delta: lastSuccessRate > 0 ? Math.round(((successRate - lastSuccessRate) / lastSuccessRate) * 10000) / 100 : null },
      totalValue: { current: Math.round(totalValue * 100) / 100, previous: Math.round(lastValue * 100) / 100,
        delta: lastValue > 0 ? Math.round(((totalValue - lastValue) / lastValue) * 10000) / 100 : null },
    };
  }

  return {
    reportPeriod: period,
    generatedAt: new Date().toISOString(),
    serviceProvider: { id: apId, country },
    summary: {
      totalTransactions: total,
      byDirection,
      byStatus,
    },
    valueMetrics: {
      totalValue: Math.round(totalValue * 100) / 100,
      avgValue: Math.round(avgValue * 100) / 100,
      transactionsWithValue: valuedTxs.length,
      byCountry,
    },
    participantAnalytics: {
      topSenders,
      topReceivers,
    },
    deliveryPerformance: {
      successRate,
      avgDeliverySeconds,
      deliveredCount: deliveredTxs.length,
    },
    periodOverPeriod: pop,
  };
}

export default generateMonthlyReport;
