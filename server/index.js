#!/usr/bin/env node
/**
 * Peppol AP Core — Simulated Environment Server
 *
 * Express server that wraps the AP Core and exposes REST endpoints
 * so an accounting app can connect, send invoices, validate documents,
 * look up participants, and check delivery status.
 *
 * Usage:
 *   node server/index.js          # Start server
 *   node server/index.js --start  # Start server (explicit)
 *
 * As a library:
 *   import { createApp } from './server/index.js';
 *   const app = createApp();
 *   app.listen(3001);
 *
 * Environment variables:
 *   PORT              - Server port (default: 3001)
 *   PEPPOL_AP_ID      - AP identifier (default: POP000001)
 *   PEPPOL_MODE       - 'test' or 'production' (default: test)
 *   AP_CORE_DRY_RUN   - Set to 'true' to skip actual network send (default: false)
 *   AP_CORE_TRUSTSTORE_PATH - Path to truststore PEM (default: ~/.node42/certs/truststore.pem)
 */

import express from 'express';
import cors from 'cors';
import * as apCore from '../src/index.js';
import * as simulator from '../src/simulator.js';
import { generateInvoice, generateCreditNote } from '../src/ubl/generator.js';
import { parseUBL } from '../src/ubl/parser.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { buildAS4Message, buildAS4Error, EbMSErrorCodes } from '../src/as4/message.js';
import { getMetrics } from '../src/middleware/metrics.js';
import { generateMonthlyReport } from '../src/reporting/monthly-report.js';
import { checkCertExpiry } from '../src/monitoring/cert-monitor.js';
// Inline sample data (avoids importing test fixtures in production)
const sampleInvoiceData = {
  id: 'FA-2026-9999', issueDate: '2026-07-03', invoiceTypeCode: '380', currencyCode: 'EUR',
  seller: { endpointID: 'SK2023456789', endpointSchemeID: '9914', name: 'Sample s.r.o.', countryCode: 'SK', vatID: 'SK2023456789', legalRegistrationName: 'Sample s.r.o.', companyID: 'SK12345678' },
  buyer: { endpointID: 'SK4498765432', endpointSchemeID: '9914', name: 'Sample Buyer', countryCode: 'SK', vatID: 'SK4498765432', legalRegistrationName: 'Sample Buyer', companyID: '87654321' },
  payment: { meansCode: '30', iban: 'SK68...', bic: 'TATRSKBX' },
  vatBreakdown: [{ taxableAmount: 100, taxAmount: 23, category: 'S', rate: 23 }],
  monetaryTotal: { lineExtensionAmount: 100, taxExclusiveAmount: 100, taxInclusiveAmount: 123, payableAmount: 123 },
  lines: [{ id: 1, quantity: 1, unitCode: 'C62', lineExtensionAmount: 100, itemName: 'Sample', vatCategory: 'S', vatRate: 23, priceAmount: 100 }],
};

/**
 * Create the Express app (without starting the server)
 * Useful for testing or embedding in another app
 */
export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ limit: '10mb', type: 'application/xml' }));
  app.use(express.text({ limit: '10mb', type: 'text/xml' }));

  // Request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });

  // ─── Health & Info ────────────────────────────

  app.get('/api/health', async (_req, res) => {
    const health = await apCore.getHealth();
    res.json(health);
  });

  app.get('/api/health/certs', async (_req, res) => {
    try {
      const warningDays = parseInt(_req.query.warningDays ?? '30', 10);
      const criticalDays = parseInt(_req.query.criticalDays ?? '7', 10);
      const alerts = await checkCertExpiry(apCore._getStores().identityStore, { warningDays, criticalDays });
      const worstLevel = alerts.some(a => a.level === 'critical') ? 'critical'
        : alerts.some(a => a.level === 'warning') ? 'warning'
        : 'ok';
      res.json({ status: worstLevel, alerts });
    } catch (err) {
      console.error('GET /api/health/certs error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  app.get('/metrics', async (_req, res) => {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'Peppol AP Core — Simulated Environment',
      version: '1.0.0',
      docs: {
        health:    { method: 'GET',    path: '/api/health' },
        send:      { method: 'POST',   path: '/api/send',        body: 'JSON with senderId, receiverId, ublXml OR invoiceData' },
        sendXml:   { method: 'POST',   path: '/api/send/xml',    body: 'Raw UBL XML (Content-Type: application/xml)' },
        validate:  { method: 'POST',   path: '/api/validate',    body: '{ "ublXml": "..." }' },
        lookup:    { method: 'GET',    path: '/api/lookup/:id' },
        status:    { method: 'GET',    path: '/api/status/:id' },
        txs:       { method: 'GET',    path: '/api/transactions' },
        receive:   { method: 'POST',   path: '/api/receive',     body: 'Raw AS4 MIME message' },
        generate:  { method: 'POST',   path: '/api/generate',    body: 'Invoice JSON data → UBL XML' },
        buildAs4:  { method: 'POST',   path: '/api/build-as4',   body: 'Build full AS4 MIME message' },
        simInject: { method: 'POST',   path: '/api/simulate/inject',       body: 'Simulate receiving an AS4 message from another AP' },
        simSend:   { method: 'POST',   path: '/api/simulate/send',         body: 'Simulate sending (returns MDN receipt)' },
        simParts:  { method: 'GET',    path: '/api/simulate/participants', desc: 'List simulated participants' },
        simReg:    { method: 'POST',   path: '/api/simulate/participants', body: '{ id, name? } Register a participant' },
      },
    });
  });

  // ─── POST /api/send — Send an invoice ─────────

  app.post('/api/send', async (req, res) => {
    try {
      const { senderId, receiverId, ublXml, invoiceData, documentType } = req.body;

      let xml = ublXml;
      if (!xml && invoiceData) {
        xml = documentType === 'credit_note'
          ? generateCreditNote(invoiceData)
          : generateInvoice(invoiceData);
      }

      if (!xml) {
        return res.status(400).json({
          error: 'bad_request',
          details: [{ message: 'Either ublXml or invoiceData is required' }],
        });
      }

      const result = await apCore.sendInvoice({
        senderId: senderId || '9914:SK2023456789',
        receiverId: receiverId || '0088:SK4498765432',
        ublXml: xml,
        documentType,
      });

      if (result.error) {
        return res.status(422).json(result);
      }

      res.json(result);
    } catch (err) {
      console.error('POST /api/send error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/send/xml — Raw UBL XML ─────────

  app.post('/api/send/xml', async (req, res) => {
    try {
      const ublXml = typeof req.body === 'string' ? req.body : req.body?.ublXml;
      if (!ublXml) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'UBL XML body required' }] });
      }

      let senderId = '9914:SK2023456789';
      let receiverId = '0088:SK4498765432';
      try {
        const parsed = parseUBL(ublXml);
        if (parsed.seller?.endpointID) senderId = `9914:${parsed.seller.endpointID}`;
        if (parsed.buyer?.endpointID) receiverId = `0088:${parsed.buyer.endpointID}`;
      } catch { /* use defaults */ }

      const result = await apCore.sendInvoice({ senderId, receiverId, ublXml });
      if (result.error) return res.status(422).json(result);
      res.json(result);
    } catch (err) {
      console.error('POST /api/send/xml error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/validate ───────────────────────

  app.post('/api/validate', async (req, res) => {
    try {
      const ublXml = req.body?.ublXml || (typeof req.body === 'string' ? req.body : null);
      if (!ublXml) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'ublXml is required' }] });
      }
      const result = await apCore.validateDocument(ublXml);
      res.json(result);
    } catch (err) {
      console.error('POST /api/validate error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── GET /api/lookup/:id ──────────────────────

  app.get('/api/lookup/:id', async (req, res) => {
    try {
      const result = await apCore.lookupParticipant(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: 'lookup_failed', details: [{ message: err.message }] });
    }
  });

  // ─── GET /api/status/:id ──────────────────────

  app.get('/api/status/:id', async (req, res) => {
    try {
      const result = await apCore.getStatus(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── GET /api/transactions ────────────────────

  app.get('/api/transactions', async (_req, res) => {
    try {
      const txs = await apCore.getTransactions();
      res.json({
        count: txs.length,
        transactions: txs.map((tx) => ({
          messageId: tx.messageId,
          direction: tx.direction,
          status: tx.status,
          senderId: tx.senderId,
          receiverId: tx.receiverId,
          documentType: tx.documentType,
          timestamp: tx.timestamp,
          completedAt: tx.completedAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── GET /api/reports/monthly ────────────────

  app.get('/api/reports/monthly', async (req, res) => {
    try {
      const { period, period_last, ap_id, country } = req.query;

      if (!period) {
        return res.status(400).json({
          error: 'bad_request',
          details: [{ message: 'period query parameter (YYYY-MM) is required' }],
        });
      }

      // Validate period format
      if (!/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({
          error: 'bad_request',
          details: [{ message: 'period must be in YYYY-MM format (e.g. 2026-06)' }],
        });
      }

      const config = {
        period,
        apId: ap_id || process.env.PEPPOL_AP_ID || 'POP000001',
        country: country || 'SK',
        periodLast: period_last || null,
      };

      const report = await generateMonthlyReport(config);
      res.json(report);
    } catch (err) {
      console.error('GET /api/reports/monthly error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── GET /api/txs (alias) ─────────────────────

  app.get('/api/txs', (_req, res) => {
    res.redirect('/api/transactions');
  });

  // ─── POST /api/receive ────────────────────────

  app.post('/api/receive', async (req, res) => {
    try {
      const mimeMessage = typeof req.body === 'string' ? req.body : req.body?.as4Message;
      if (!mimeMessage) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'as4Message body required' }] });
      }
      const result = await apCore.handleIncomingMessage(mimeMessage);
      res.json(result);
    } catch (err) {
      console.error('POST /api/receive error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── GET /as4/receive ─────────────────────────────────────────────────────────
  // AS4 receive endpoint only accepts POST; return 405 for any other method.

  app.get('/as4/receive', (_req, res) => {
    res.set('Allow', 'POST');
    res.status(405).type('text/plain').send('Method Not Allowed');
  });

  // ─── POST /as4/receive ────────────────────────────────────────────────────────
  // Official AS4 receive endpoint — receives raw MIME multipart body and
  // returns an AS4 MDN receipt (application/xop+xml) on success.

  app.post(
    '/as4/receive',
    express.raw({ type: 'multipart/related', limit: '10mb' }),
    async (req, res) => {
      try {
        const mimeMessage = req.body?.toString('utf8') || req.body;
        if (!mimeMessage) {
          const errorSignal = buildAS4Error(
            EbMSErrorCodes.EB001_MESSAGE_STRUCTURE,
            'Missing request body',
            'The AS4 receive endpoint requires a non-empty MIME body.'
          );
          res.set('Content-Type', 'application/xop+xml');
          return res.status(500).send(errorSignal);
        }

        const result = await apCore.handleIncomingMessage(mimeMessage);

        // Return MDN receipt as AS4 response
        res.set('Content-Type', 'application/xop+xml');
        res.status(200).send(result.mdnReceipt);
      } catch (err) {
        console.error('POST /as4/receive error:', err);

        // Determine appropriate ebMS error code based on error type
        let errorCode = EbMSErrorCodes.EB001_MESSAGE_STRUCTURE;
        if (err.message.includes('payload') || err.message.includes('Payload')) {
          errorCode = EbMSErrorCodes.EB002_REQUIRED_FIELD_MISSING;
        } else if (err.message.includes('signature') || err.message.includes('Signature')) {
          errorCode = EbMSErrorCodes.EB007_SIGNATURE_FAILED;
        } else if (err.message.includes('decrypt') || err.message.includes('Decrypt')) {
          errorCode = EbMSErrorCodes.EB006_DECRYPTION_ERROR;
        } else if (err.message.includes('expired') || err.message.includes('certificate')) {
          errorCode = EbMSErrorCodes.EB005_CERT_EXPIRED;
        }

        // Map ebMS error codes to HTTP status codes
        let httpStatus = 500;
        switch (errorCode) {
          case EbMSErrorCodes.EB001_MESSAGE_STRUCTURE:
          case EbMSErrorCodes.EB002_REQUIRED_FIELD_MISSING:
            httpStatus = 400;
            break;
          case EbMSErrorCodes.EB003_VALUE_FORMAT:
          case EbMSErrorCodes.EB004_UNSUPPORTED_ACTION:
          case EbMSErrorCodes.EB006_DECRYPTION_ERROR:
            httpStatus = 422;
            break;
          case EbMSErrorCodes.EB005_CERT_EXPIRED:
          case EbMSErrorCodes.EB007_SIGNATURE_FAILED:
            httpStatus = 403;
            break;
          default:
            httpStatus = 500;
        }

        const errorSignal = buildAS4Error(
          errorCode,
          err.message,
          null,
          null // refMessageId not available when parse fails
        );
        res.set('Content-Type', 'application/xop+xml');
        res.status(httpStatus).send(errorSignal);
      }
    }
  );

  // ─── POST /api/simulate/inject — Simulate incoming AS4 message ────

  app.post('/api/simulate/inject', async (req, res) => {
    try {
      const { senderId, receiverId, ublXml, invoiceData, senderApId } = req.body;

      let xml = ublXml;
      if (!xml && invoiceData) {
        xml = generateInvoice(invoiceData);
      }
      if (!xml) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'ublXml or invoiceData required' }] });
      }

      const s = senderId || '9914:SK5599887766';
      const r = receiverId || '9914:SK2023456789';
      const apId = senderApId || 'POP000999';

      simulator.registerParticipant(s, { name: 'External: ' + s });

      const { as4Message, messageId } = await simulator.buildInboundAS4Message({
        senderId: s,
        receiverId: r,
        ublXml: xml,
        senderApId: apId,
      });

      const result = await apCore.handleIncomingMessage(as4Message);

      res.json({ ...result, injectedMessageId: messageId });
    } catch (err) {
      console.error('POST /api/simulate/inject error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── GET /api/simulate/participants — List simulated participants ────

  app.get('/api/simulate/participants', (_req, res) => {
    res.json({
      count: simulator.listParticipants().length,
      participants: simulator.listParticipants(),
    });
  });

  // ─── POST /api/simulate/participants — Register a participant ────

  app.post('/api/simulate/participants', (req, res) => {
    try {
      const { id, name, country } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'id is required' }] });
      }
      simulator.registerParticipant(id, { name, country });
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/simulate/send — Simulate sending (bypasses real network) ────

  app.post('/api/simulate/send', async (req, res) => {
    try {
      const { senderId, receiverId, ublXml, invoiceData, documentType } = req.body;

      let xml = ublXml;
      if (!xml && invoiceData) {
        xml = documentType === 'credit_note'
          ? generateCreditNote(invoiceData)
          : generateInvoice(invoiceData);
      }
      if (!xml) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'ublXml or invoiceData required' }] });
      }

      const s = senderId || '9914:SK2023456789';
      const r = receiverId || '0088:SK4498765432';

      simulator.registerParticipant(s);
      simulator.registerParticipant(r);

      const result = await simulator.simulateSend(s, r, xml, documentType);
      res.json(result);
    } catch (err) {
      console.error('POST /api/simulate/send error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/generate ───────────────────────

  app.post('/api/generate', (req, res) => {
    try {
      const { invoiceData, documentType } = req.body;
      if (!invoiceData) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'invoiceData is required' }] });
      }
      const xml = documentType === 'credit_note'
        ? generateCreditNote(invoiceData)
        : generateInvoice(invoiceData);
      res.type('application/xml').send(xml);
    } catch (err) {
      console.error('POST /api/generate error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/generate-sample ────────────────

  app.post('/api/generate-sample', (req, res) => {
    try {
      const overrides = req.body || {};
      const data = {
        ...sampleInvoiceData,
        ...overrides,
        seller: overrides.seller ? { ...sampleInvoiceData.seller, ...overrides.seller } : sampleInvoiceData.seller,
        buyer: overrides.buyer ? { ...sampleInvoiceData.buyer, ...overrides.buyer } : sampleInvoiceData.buyer,
        monetaryTotal: overrides.monetaryTotal
          ? { ...sampleInvoiceData.monetaryTotal, ...overrides.monetaryTotal }
          : sampleInvoiceData.monetaryTotal,
      };
      res.type('application/xml').send(generateInvoice(data));
    } catch (err) {
      console.error('POST /api/generate-sample error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/build-as4 ──────────────────────

  app.post('/api/build-as4', (req, res) => {
    try {
      const { senderId, receiverId, invoiceData, ublXml, documentType } = req.body;

      let xml = ublXml;
      if (!xml && invoiceData) {
        xml = documentType === 'credit_note'
          ? generateCreditNote(invoiceData)
          : generateInvoice(invoiceData);
      }
      if (!xml) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'ublXml or invoiceData required' }] });
      }

      // Build the message using invoice data
      const result = apCore.buildCompleteAS4Message({
        senderId: senderId || '9914:SK2023456789',
        receiverId: receiverId || '0088:SK4498765432',
        invoiceData: invoiceData || { id: 'generated' },
        fromApId: apCore._apId || 'POP000001',
        toApId: 'POP000999',
        documentType,
      });

      // Rebuild with the provided UBL if given
      let finalAs4 = result.as4Message;
      let finalSbdh = result.sbdhXml;
      let finalUbl = result.ublXml;

      if (ublXml) {
        const msgId = result.messageId;
        const ts = new Date().toISOString();
        const sbdhParams = {
          senderId: senderId || '9914:SK2023456789',
          receiverId: receiverId || '0088:SK4498765432',
          instanceIdentifier: msgId,
          creationDateAndTime: ts,
          documentType: documentType === 'credit_note' ? 'CreditNote' : 'Invoice',
          documentTypeIdentifier: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##...',
          processID: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
          countryC1: 'SK',
          ublXml,
        };
        finalSbdh = buildSBDH(sbdhParams);
        finalAs4 = buildAS4Message({
          messageId: msgId,
          fromApId: 'POP000001',
          toApId: 'POP000999',
          senderParticipantId: senderId || '9914:SK2023456789',
          receiverParticipantId: receiverId || '0088:SK4498765432',
          payload: finalSbdh,
          documentType: documentType || 'invoice',
          processId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
          timestamp: ts,
        });
        finalUbl = ublXml;
      }

      res.json({
        messageId: result.messageId,
        ublXml: finalUbl,
        sbdhXml: finalSbdh,
        as4Message: finalAs4,
      });
    } catch (err) {
      console.error('POST /api/build-as4 error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  // ─── POST /api/webhook/register ────────────────

  app.post('/api/webhook/register', (req, res) => {
    try {
      const { url, secret } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'bad_request', details: [{ message: 'url is required' }] });
      }
      // WEBHOOK_SECRET env var can be used as a default secret
      const effectiveSecret = secret || process.env.WEBHOOK_SECRET || null;
      const result = apCore.registerWebhook({ url, secret: effectiveSecret });
      res.json(result);
    } catch (err) {
      console.error('POST /api/webhook/register error:', err);
      res.status(500).json({ error: 'internal_error', details: [{ message: err.message }] });
    }
  });

  return app;
}

// ─── Readiness state for graceful drain ─────────────────────────────────────────
let isReady = true;

/** @internal - Reset ready state between tests */
export function _resetReady() {
  isReady = true;
}

/** @internal - Set ready state directly (for testing) */
export function _setReady(value) {
  isReady = value;
}

/**
 * Start the Express server and optionally handle graceful shutdown.
 *
 * @param {Object} options
 * @param {boolean} [options.graceful=false] - If true, registers SIGTERM handler that drains
 *        in-flight requests before exiting. Workers use this mode.
 * @param {number} [options.port=3001] - Port to listen on
 * @param {boolean} [options.simulation=false] - Enable simulation mode
 */
export function startWorker({ graceful = false, port = 3001, simulation = false } = {}) {
  // Enable simulation mode when requested
  if (simulation) {
    apCore.enableSimulation();
  }

  const app = createApp();

  // ── Kubernetes-compatible health probes ─────────────────────────────────────
  // Liveness: am I alive?
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', pid: process.pid });
  });

  // Readiness: am I able to serve traffic? Returns 503 during graceful drain.
  app.get('/health/ready', async (_req, res) => {
    if (!isReady) {
      return res.status(503).json({ status: 'draining', pid: process.pid });
    }
    // Verify store is reachable as part of readiness check
    try {
      const health = await apCore.getHealth();
      const ready = health.status !== 'error';
      if (!ready) {
        isReady = false;
        return res.status(503).json({ status: 'unhealthy', pid: process.pid, detail: health });
      }
      res.json({ status: 'ok', pid: process.pid, detail: health });
    } catch (err) {
      isReady = false;
      res.status(503).json({ status: 'error', pid: process.pid, error: err.message });
    }
  });

  const server = app.listen(port, () => {
    const mode = simulation ? '🔄 SIMULATION' : '🌐 LIVE';
    console.log(`
╔══════════════════════════════════════════════════════╗
║     🇸🇰  Peppol AP Core — ${mode.padEnd(29)}║
║     Worker PID: ${String(process.pid).padEnd(39)}║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Server:    http://localhost:${String(port).padEnd(5)}                     ║
║  Health:    http://localhost:${port}/api/health       ║
║  Liveness:  http://localhost:${port}/health/live     ║
║  Readiness: http://localhost:${port}/health/ready     ║
║  Metrics:   http://localhost:${port}/metrics          ║
║  Send:      POST http://localhost:${port}/api/send   ║
║  Validate:  POST http://localhost:${port}/api/validate║
║  Lookup:    GET  http://localhost:${port}/api/lookup/ ║
║  Status:    GET  http://localhost:${port}/api/status/ ║
║  TXs:       GET  http://localhost:${port}/api/txs     ║
║  Simulate:  POST http://localhost:${port}/api/simulate/*║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
  });

  if (graceful) {
    // ── Graceful shutdown (worker drain) ───────────────────────────────────
    // On SIGTERM: mark as not ready (503), stop accepting new connections,
    // wait for in-flight to drain, then exit.
    process.on('SIGTERM', () => {
      console.log(`[worker] PID ${process.pid} received SIGTERM, draining...`);
      isReady = false;

      // Stop accepting new connections (existing requests keep running)
      server.close(async () => {
        console.log(`[worker] PID ${process.pid} server closed, closing store...`);

        // Close the store (SQLite) connection
        try {
          const stores = await import('../src/index.js').then(m => m._getStores?.());
          if (stores?.transactionStore?.close) {
            await stores.transactionStore.close();
          }
          if (stores?.smpCache?.close) {
            await stores.smpCache.close();
          }
        } catch (_) {
          // ignore close errors
        }

        console.log(`[worker] PID ${process.pid} exiting gracefully.`);
        process.exit(0);
      });

      // Force-exit after 30 seconds regardless
      setTimeout(() => {
        console.error(`[worker] PID ${process.pid} graceful drain timed out after 30s, forcing exit.`);
        process.exit(1);
      }, 30_000);
    });
  } else {
    // ── Simple shutdown (development mode) ────────────────────────────────
    process.on('SIGINT', () => { server.close(); process.exit(0); });
    process.on('SIGTERM', () => { server.close(); process.exit(0); });
  }

  return { server, app };
}

// ─── Start server when run directly ──────────────
const isMain = process.argv[1]?.endsWith('server/index.js') ||
               process.argv.includes('--start');

if (isMain) {
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const hasSimulate = process.argv.includes('--simulate');
  startWorker({ graceful: false, port: PORT, simulation: hasSimulate });
}
