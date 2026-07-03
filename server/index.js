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
 *   PORT          - Server port (default: 3001)
 *   PEPPOL_AP_ID  - AP identifier (default: POP000001)
 *   PEPPOL_MODE   - 'test' or 'production' (default: test)
 */

import express from 'express';
import cors from 'cors';
import * as apCore from '../src/index.js';
import { generateInvoice, generateCreditNote } from '../src/ubl/generator.js';
import { parseUBL } from '../src/ubl/parser.js';
import { buildSBDH } from '../src/as4/sbdh.js';
import { buildAS4Message } from '../src/as4/message.js';
import { sampleInvoiceData } from '../test/fixtures.js';

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

  app.get('/api/health', (_req, res) => {
    res.json(apCore.getHealth());
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

  app.get('/api/status/:id', (req, res) => {
    res.json(apCore.getStatus(req.params.id));
  });

  // ─── GET /api/transactions ────────────────────

  app.get('/api/transactions', (_req, res) => {
    const txs = apCore.getTransactions();
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

  return app;
}

// ─── Start server when run directly ──────────────
const isMain = process.argv[1]?.endsWith('server/index.js') ||
               process.argv.includes('--start');

if (isMain) {
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║     🇸🇰  Peppol AP Core — Simulated Environment     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Server:    http://localhost:${String(PORT).padEnd(5)}                     ║
║  Health:    http://localhost:${PORT}/api/health       ║
║  Send:      POST http://localhost:${PORT}/api/send   ║
║  Validate:  POST http://localhost:${PORT}/api/validate║
║  Lookup:    GET  http://localhost:${PORT}/api/lookup/ ║
║  Status:    GET  http://localhost:${PORT}/api/status/ ║
║  TXs:       GET  http://localhost:${PORT}/api/txs     ║
║                                                      ║
║  Accounting app → POST JSON/XML to /api/send         ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
  });
}
