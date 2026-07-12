/**
 * Regression Test Harness
 *
 * Replays JSON transaction log fixtures and verifies the system produces
 * expected outputs. Each fixture covers a specific scenario (send flow,
 * receive flow, AS4 error handling, SMP lookup, webhook delivery).
 *
 * Architecture:
 * - Fixtures live in test/regression/fixtures/*.json
 * - Each fixture declares: input (sender, receiver, payload), setup (pre-conditions),
 *   and expected outcomes (status, messageId, delivery flag, etc.)
 * - runRegressionTests() loads all fixtures, runs them against the AP Core,
 *   and returns a structured result report.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as apCore from '../../src/index.js';
import { generateInvoice } from '../../src/ubl/generator.js';
import { buildInboundAS4Message } from '../../src/simulator.js';
import { resetMockStores } from '../../src/store/mock.js';

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures');

// ── Fixture Loading ─────────────────────────────────────────────────────────────

/**
 * Load all fixture files from the fixtures directory.
 * @returns {Fixture[]}
 */
function loadFixtures() {
  const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const content = readFileSync(join(FIXTURES_DIR, file), 'utf8');
    return JSON.parse(content);
  });
}

// ── Core Scenario Runners ───────────────────────────────────────────────────────

/**
 * Run the send flow scenario.
 */
async function runSendScenario(fixture) {
  const { input, expected } = fixture;
  const ublXml = generateInvoice(input.payload);

  const result = await apCore.sendInvoice({
    senderId: input.senderId,
    receiverId: input.receiverId,
    ublXml,
  });

  // Verify status
  if (expected.status && result.status !== expected.status) {
    throw new Error(
      `Expected status="${expected.status}" but got status="${result.status}"`
    );
  }

  // Verify messageId pattern
  if (expected.messageId?.pattern && !result.messageId?.match(new RegExp(expected.messageId.pattern))) {
    throw new Error(
      `Expected messageId to match pattern "${expected.messageId.pattern}" but got "${result.messageId}"`
    );
  }

  // Verify receipt
  if (expected.receipt?.present && !result.receipt) {
    throw new Error('Expected receipt to be present but it was missing');
  }

  // Verify simulated flag
  if (expected.simulated !== undefined && result.simulated !== expected.simulated) {
    throw new Error(
      `Expected simulated=${expected.simulated} but got simulated=${result.simulated}`
    );
  }

  // Verify error code
  if (expected.error && result.error !== expected.error) {
    throw new Error(
      `Expected error="${expected.error}" but got error="${result.error}"`
    );
  }

  // Verify transaction was recorded
  if (expected.transaction) {
    const tx = await apCore._getStores().transactionStore.get(result.messageId);
    if (expected.transaction.direction && tx?.direction !== expected.transaction.direction) {
      throw new Error(
        `Expected transaction direction="${expected.transaction.direction}" but got "${tx?.direction}"`
      );
    }
    if (expected.transaction.status && tx?.status !== expected.transaction.status) {
      throw new Error(
        `Expected transaction status="${expected.transaction.status}" but got "${tx?.status}"`
      );
    }
    if (expected.transaction.senderId && tx?.senderId !== expected.transaction.senderId) {
      throw new Error(
        `Expected transaction senderId="${expected.transaction.senderId}" but got "${tx?.senderId}"`
      );
    }
    if (expected.transaction.receiverId && tx?.receiverId !== expected.transaction.receiverId) {
      throw new Error(
        `Expected transaction receiverId="${expected.transaction.receiverId}" but got "${tx?.receiverId}"`
      );
    }
  }

  return result;
}

/**
 * Run the receive flow scenario.
 */
async function runReceiveScenario(fixture) {
  const { input, expected } = fixture;
  const ublXml = generateInvoice(input.payload);

  const inbound = await buildInboundAS4Message({
    senderId: input.senderId,
    receiverId: input.receiverId,
    ublXml,
  });

  const result = await apCore.handleIncomingMessage(inbound.as4Message);

  // Verify status
  if (expected.status && result.status !== expected.status) {
    throw new Error(
      `Expected status="${expected.status}" but got status="${result.status}"`
    );
  }

  // Verify messageId pattern
  if (expected.messageId?.pattern && !result.messageId?.match(new RegExp(expected.messageId.pattern))) {
    throw new Error(
      `Expected messageId to match pattern "${expected.messageId.pattern}" but got "${result.messageId}"`
    );
  }

  // Verify MDN receipt
  if (expected.mdnReceipt?.present && !result.mdnReceipt) {
    throw new Error('Expected MDN receipt to be present but it was missing');
  }

  // Verify transaction recorded
  if (expected.transaction) {
    const tx = await apCore._getStores().transactionStore.get(result.messageId);
    if (expected.transaction.direction && tx?.direction !== expected.transaction.direction) {
      throw new Error(
        `Expected transaction direction="${expected.transaction.direction}" but got "${tx?.direction}"`
      );
    }
    if (expected.transaction.status && tx?.status !== expected.transaction.status) {
      throw new Error(
        `Expected transaction status="${expected.transaction.status}" but got "${tx?.status}"`
      );
    }
    if (expected.transaction.senderId && tx?.senderId !== expected.transaction.senderId) {
      throw new Error(
        `Expected transaction senderId="${expected.transaction.senderId}" but got "${tx?.senderId}"`
      );
    }
    if (expected.transaction.receiverId && tx?.receiverId !== expected.transaction.receiverId) {
      throw new Error(
        `Expected transaction receiverId="${expected.transaction.receiverId}" but got "${tx?.receiverId}"`
      );
    }
  }

  return result;
}

/**
 * Run the AS4 error handling scenario.
 */
async function runAS4ErrorScenario(fixture) {
  const { input, expected } = fixture;
  const ublXml = generateInvoice(input.payload);

  const result = await apCore.sendInvoice({
    senderId: input.senderId,
    receiverId: input.receiverId,
    ublXml,
  });

  // Verify error occurred (or didn't occur, if expected.error === false)
  if (expected.error === true && result.error !== expected.errorType) {
    throw new Error(`Expected an error (${expected.errorType}) but got status="${result.status}"`);
  }
  if (expected.error === false && result.error) {
    throw new Error(`Expected no error but got error="${result.error}"`);
  }

  // Verify details present
  if (expected.details?.present && (!result.details || result.details.length === 0)) {
    throw new Error('Expected details to be present but they were missing');
  }

  return result;
}

/**
 * Run the SMP lookup scenario (cache miss).
 */
async function runSMPLookupMissScenario(fixture) {
  const { input, expected } = fixture;
  const { smpCache } = apCore._getStores();

  // Ensure no cached entry for this participant
  await smpCache.invalidate(input.participantId);

  const result = await apCore.lookupParticipant(input.participantId);

  if (expected.participantId && result.participantId !== expected.participantId) {
    throw new Error(
      `Expected participantId="${expected.participantId}" but got "${result.participantId}"`
    );
  }

  if (expected.smpUrl?.present && !result.smpUrl) {
    throw new Error('Expected smpUrl to be present but it was missing');
  }

  if (expected.services?.nonEmpty && (!result.services || result.services.length === 0)) {
    throw new Error('Expected services to be non-empty but got empty array');
  }

  if (expected.simulated !== undefined && result.simulated !== expected.simulated) {
    throw new Error(
      `Expected simulated=${expected.simulated} but got simulated=${result.simulated}`
    );
  }

  return result;
}

/**
 * Run the SMP lookup scenario (cache hit).
 */
async function runSMPLookupHitScenario(fixture) {
  const { input, expected, setup } = fixture;
  const { smpCache } = apCore._getStores();

  // Pre-populate cache as per fixture setup
  if (setup?.preCache) {
    await smpCache.set(
      setup.preCache.participantId,
      {
        participantId: setup.preCache.participantId,
        smpUrl: setup.preCache.smpUrl,
        services: setup.preCache.services,
        simulated: true,
        resolved_at: new Date().toISOString(),
      },
      300
    );
  }

  // Clear metrics state — we can't easily check cache hit vs miss from outside,
  // but we can verify the cached value is returned correctly
  const result = await apCore.lookupParticipant(input.participantId);

  if (expected.participantId && result.participantId !== expected.participantId) {
    throw new Error(
      `Expected participantId="${expected.participantId}" but got "${result.participantId}"`
    );
  }

  if (expected.smpUrl && result.smpUrl !== expected.smpUrl) {
    throw new Error(
      `Expected smpUrl="${expected.smpUrl}" but got "${result.smpUrl}"`
    );
  }

  if (expected.services?.nonEmpty && (!result.services || result.services.length === 0)) {
    throw new Error('Expected services to be non-empty but got empty array');
  }

  if (expected.simulated !== undefined && result.simulated !== expected.simulated) {
    throw new Error(
      `Expected simulated=${expected.simulated} but got simulated=${result.simulated}`
    );
  }

  return result;
}

/**
 * Run the webhook delivery scenario.
 *
 * NOTE: actual webhook delivery to external URLs is skipped in the harness.
 * The test environment has no reachable webhook target, and the retry
 * delays (5s + 15s + 45s) would exceed test timeouts. Instead we verify:
 * - webhook is registered
 * - message is processed (status, messageId)
 * - transaction is recorded
 */
async function runWebhookScenario(fixture) {
  const { input, expected } = fixture;
  const { smpCache } = apCore._getStores();

  // Pre-cache the receiver so receive flow doesn't try real SMP
  await smpCache.set(input.receiverId, {
    participantId: input.receiverId,
    smpUrl: 'https://smp.receiver.sim.local',
    services: [],
    simulated: true,
    resolved_at: new Date().toISOString(),
  }, 300);

  // Register the test webhook — actual delivery is tested separately in
  // webhook integration tests; here we just verify registration succeeds.
  const webhookId = apCore.registerWebhook({
    url: input.webhookUrl,
    secret: input.webhookSecret,
  });

  const ublXml = generateInvoice(input.payload);

  const inbound = await buildInboundAS4Message({
    senderId: input.senderId,
    receiverId: input.receiverId,
    ublXml,
  });

  const result = await apCore.handleIncomingMessage(inbound.as4Message);

  // Verify webhook was registered (webhookId is returned)
  if (expected.webhookRegistered !== undefined) {
    // handleIncomingMessage doesn't return webhookId; check health endpoint
    const health = await apCore.getHealth();
    if (health.webhookRegistered !== expected.webhookRegistered) {
      throw new Error(
        `Expected webhookRegistered=${expected.webhookRegistered} but got ${health.webhookRegistered}`
      );
    }
  }

  // Verify messageId present
  if (expected.messageId?.present && !result.messageId) {
    throw new Error('Expected messageId to be present but it was missing');
  }

  // Verify status
  if (expected.status && result.status !== expected.status) {
    throw new Error(
      `Expected status="${expected.status}" but got status="${result.status}"`
    );
  }

  // Verify transaction recorded
  if (expected.transaction) {
    const tx = await apCore._getStores().transactionStore.get(result.messageId);
    if (expected.transaction.direction && tx?.direction !== expected.transaction.direction) {
      throw new Error(
        `Expected transaction direction="${expected.transaction.direction}" but got "${tx?.direction}"`
      );
    }
    if (expected.transaction.status && tx?.status !== expected.transaction.status) {
      throw new Error(
        `Expected transaction status="${expected.transaction.status}" but got "${tx?.status}"`
      );
    }
  }

  // Add simulation context to result
  return { ...result, simulated: true };
}

// ── Scenario Router ─────────────────────────────────────────────────────────────

const SCENARIO_RUNNERS = {
  send: runSendScenario,
  receive: runReceiveScenario,
  'as4-error': runAS4ErrorScenario,
  smp: runSMPLookupMissScenario,
  'smp-cache-hit': runSMPLookupHitScenario,
  webhook: runWebhookScenario,
};

// ── Main Harness Function ────────────────────────────────────────────────────────

/**
 * Run all regression test fixtures and return a structured report.
 *
 * @param {{ verbose?: boolean }} options
 * @returns {Promise<RegressionReport>}
 */
export async function runRegressionTests(options = {}) {
  const fixtures = loadFixtures();
  const results = [];

  // Always reset stores and enable simulation before running
  resetMockStores();
  apCore.enableSimulation();

  for (const fixture of fixtures) {
    // Reset stores between each fixture to ensure isolation
    resetMockStores();
    apCore.enableSimulation();

    const startTime = Date.now();
    try {
      const runner = SCENARIO_RUNNERS[fixture.category];
      if (!runner) {
        throw new Error(`No runner for fixture category "${fixture.category}"`);
      }
      const result = await runner(fixture);
      results.push({
        name: fixture.name,
        description: fixture.description,
        category: fixture.category,
        passed: true,
        duration_ms: Date.now() - startTime,
        result,
      });
      if (options.verbose) {
        console.log(`  ✓ ${fixture.name}`);
      }
    } catch (err) {
      results.push({
        name: fixture.name,
        description: fixture.description,
        category: fixture.category,
        passed: false,
        duration_ms: Date.now() - startTime,
        error: err.message,
      });
      if (options.verbose) {
        console.log(`  ✗ ${fixture.name}: ${err.message}`);
      }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    passed: failed === 0,
    total: fixtures.length,
    passed_count: passed,
    failed_count: failed,
    results,
    timestamp: new Date().toISOString(),
  };
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const report = await runRegressionTests({ verbose });

  console.log('\n=== Regression Test Report ===');
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Total: ${report.total} | Passed: ${report.passed_count} | Failed: ${report.failed_count}`);
  console.log('');

  for (const r of report.results) {
    const icon = r.passed ? '✓' : '✗';
    const duration = `${r.duration_ms}ms`;
    if (r.passed) {
      console.log(`  ${icon} ${r.name} (${r.category}) — ${duration}`);
    } else {
      console.log(`  ${icon} ${r.name} (${r.category}) — ${duration}`);
      console.log(`      Error: ${r.error}`);
    }
  }

  console.log('');
  if (report.passed) {
    console.log('All regression tests passed.');
    process.exit(0);
  } else {
    console.log(`${report.failed_count} regression test(s) failed.`);
    process.exit(1);
  }
}
