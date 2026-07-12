/**
 * Regression Test Suite
 *
 * Runs the regression test harness against all JSON fixtures.
 * Each fixture represents a complete end-to-end scenario (send, receive,
 * AS4 error handling, SMP lookup, webhook delivery).
 *
 * The harness is imported as a module and exercised via vitest,
 * producing a structured test report.
 *
 * Note: webhook fixtures are tested WITHOUT real HTTP delivery since
 * the test environment has no reachable webhook target. The harness
 * verifies webhook registration and messageId; actual delivery would
 * require a test HTTP server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runRegressionTests } from './regression/harness.js';

describe('Regression Test Harness', () => {
  // Each fixture run can involve webhook retry delays (5s + 15s + 45s = 65s total).
  // We set a generous per-test timeout here.
  const TEST_TIMEOUT = 90_000;

  describe('all regression fixtures pass', () => {
    it(
      'should pass all fixtures',
      { timeout: TEST_TIMEOUT },
      async () => {
        const report = await runRegressionTests();

        const failures = report.results.filter(r => !r.passed);
        const failureSummary = failures.length > 0
          ? failures.map(f => `  - ${f.name}: ${f.error}`).join('\n')
          : '';

        expect(report.passed, `Regression harness failed. ${report.failed_count} of ${report.total} fixture(s) did not pass:\n${failureSummary}`).toBe(true);
        expect(report.total).toBeGreaterThan(0);
        expect(report.passed_count).toBe(report.total);
      }
    );
  });

  describe('each fixture category produces a result', () => {
    it(
      'should produce results for all expected categories',
      { timeout: TEST_TIMEOUT },
      async () => {
        const report = await runRegressionTests();

        const categories = new Set(report.results.map(r => r.category));
        const expectedCategories = [
          'send',
          'receive',
          'as4-error',
          'smp',
          'smp-cache-hit',
          'webhook',
        ];

        for (const cat of expectedCategories) {
          expect(categories.has(cat), `Missing fixture category: "${cat}"`).toBe(true);
        }
      }
    );
  });

  describe('send-flow-valid-invoice fixture', () => {
    it(
      'should produce delivered status and messageId',
      { timeout: TEST_TIMEOUT },
      async () => {
        const report = await runRegressionTests();
        const fixture = report.results.find(r => r.name === 'send-flow-valid-invoice');

        expect(fixture, `Fixture not found or failed: ${fixture?.error}`).toBeDefined();
        expect(fixture.passed, `Fixture failed: ${fixture?.error}`).toBe(true);
        expect(fixture.result).toBeDefined();
        expect(fixture.result.messageId).toBeDefined();
      }
    );
  });

  describe('smp-lookup-cache-miss fixture', () => {
    it(
      'should return simulated lookup result',
      { timeout: TEST_TIMEOUT },
      async () => {
        const report = await runRegressionTests();
        const fixture = report.results.find(r => r.name === 'smp-lookup-cache-miss');

        expect(fixture, `Fixture not found or failed: ${fixture?.error}`).toBeDefined();
        expect(fixture.passed, `Fixture failed: ${fixture?.error}`).toBe(true);
        expect(fixture.result.participantId).toBe('9914:SK0000000001');
        expect(fixture.result.simulated).toBe(true);
      }
    );
  });

  describe('webhook-delivery-success fixture', () => {
    it(
      'should register webhook and produce messageId',
      { timeout: TEST_TIMEOUT },
      async () => {
        const report = await runRegressionTests();
        const fixture = report.results.find(r => r.name === 'webhook-delivery-success');

        expect(fixture, `Fixture not found or failed: ${fixture?.error}`).toBeDefined();
        // Webhook registration succeeds; actual delivery is not verified
        // since the test environment has no reachable HTTP target.
        expect(fixture.result.messageId).toBeDefined();
        expect(fixture.result.status).toBeDefined();
      }
    );
  });
});
