/**
 * Integration tests for the Simulated Environment Server
 * Tests all HTTP endpoints that an accounting app would use
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../server/index.js';
import { sampleInvoiceData } from './fixtures.js';
import { generateInvoice } from '../src/ubl/generator.js';
import http from 'http';

let server;
let baseUrl;

beforeAll(async () => {
  await new Promise((resolve) => {
    const app = createApp();
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server on ${baseUrl}`);
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

function fetchJson(path, opts = {}) {
  const url = `${baseUrl}${path}`;
  return fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  }).then(async (r) => {
    const text = await r.text();
    try { return { status: r.status, data: JSON.parse(text), headers: r.headers }; }
    catch { return { status: r.status, data: text, headers: r.headers }; }
  });
}

function fetchText(path, opts = {}) {
  const url = `${baseUrl}${path}`;
  return fetch(url, opts).then(async (r) => {
    return { status: r.status, data: await r.text(), headers: r.headers };
  });
}

describe('Server Health & Info', () => {
  it('GET /api/health should return OK', async () => {
    const { status, data } = await fetchJson('/api/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.version).toBe('1.0.0');
  });

  it('GET / should return API docs', async () => {
    const { status, data } = await fetchJson('/');
    expect(status).toBe(200);
    expect(data.name).toContain('Peppol AP Core');
    expect(data.docs).toBeDefined();
    expect(data.docs.send).toBeDefined();
  });
});

describe('POST /api/validate', () => {
  it('should validate a correct UBL XML', async () => {
    const ublXml = generateInvoice(sampleInvoiceData);
    const { status, data } = await fetchJson('/api/validate', {
      method: 'POST',
      body: JSON.stringify({ ublXml }),
    });
    expect(status).toBe(200);
    expect(data.valid).toBe(true);
  });

  it('should reject invalid UBL XML', async () => {
    const { status, data } = await fetchJson('/api/validate', {
      method: 'POST',
      body: JSON.stringify({ ublXml: '<invalid>broken</invalid>' }),
    });
    expect(status).toBe(200);
    expect(data.valid).toBe(false);
  });

  it('should return 400 when ublXml is missing', async () => {
    const { status, data } = await fetchJson('/api/validate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(data.error).toBe('bad_request');
  });
});

describe('POST /api/send', () => {
  it('should accept invoice JSON data and return messageId', async () => {
    const { status, data } = await fetchJson('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        invoiceData: sampleInvoiceData,
      }),
    });
    expect(status).toBe(200);
    expect(data.messageId).toBeDefined();
    expect(data.messageId).toMatch(/^uuid:/);
    expect(data.status).toBe('delivered');
  });

  it('should accept raw UBL XML and return messageId', async () => {
    const ublXml = generateInvoice(sampleInvoiceData);
    const { status, data } = await fetchJson('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      }),
    });
    expect(status).toBe(200);
    expect(data.messageId).toBeDefined();
    expect(data.status).toBe('delivered');
  });

  it('should reject invalid UBL with 422', async () => {
    const { status, data } = await fetchJson('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml: '<invalid>not-an-invoice</invalid>',
      }),
    });
    expect(status).toBe(422);
    expect(data.error).toBe('validation_failed');
  });

  it('should return 400 when body is empty', async () => {
    const { status, data } = await fetchJson('/api/send', {
      method: 'POST',
      body: JSON.stringify({ senderId: 'test', receiverId: 'test' }),
    });
    expect(status).toBe(400);
    expect(data.error).toBe('bad_request');
  });
});

describe('POST /api/send/xml (raw XML content)', () => {
  it('should accept raw UBL XML as text body', async () => {
    const ublXml = generateInvoice(sampleInvoiceData);
    const { status, data } = await fetchJson('/api/send/xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ublXml }),
    });
    expect(status).toBe(200);
    expect(data.messageId).toBeDefined();
  });
});

describe('GET /api/lookup/:id', () => {
  it('should return participant metadata for valid ID', async () => {
    const { status, data } = await fetchJson('/api/lookup/9914:SK2023456789');
    expect(status).toBe(200);
    expect(data.participantId).toBe('9914:SK2023456789');
    expect(Array.isArray(data.services)).toBe(true);
    expect(data.services[0].endpoint).toContain('https://');
  });

  it('should return 404 for invalid participant ID', async () => {
    const { status, data } = await fetchJson('/api/lookup/invalid');
    expect(status).toBe(404);
    expect(data.error).toBe('lookup_failed');
  });
});

describe('GET /api/status/:id', () => {
  it('should return delivered for a known message', async () => {
    // First send a document
    const { data: sendData } = await fetchJson('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        invoiceData: sampleInvoiceData,
      }),
    });

    const { status, data } = await fetchJson(`/api/status/${sendData.messageId}`);
    expect(status).toBe(200);
    expect(data.messageId).toBe(sendData.messageId);
    expect(data.status).toBe('delivered');
  });

  it('should return failed for unknown message', async () => {
    const { status, data } = await fetchJson('/api/status/unknown-msg-id');
    expect(status).toBe(200);
    expect(data.status).toBe('failed');
    expect(data.error).toBe('Unknown message ID');
  });
});

describe('GET /api/transactions', () => {
  it('should list all transactions', async () => {
    const { status, data } = await fetchJson('/api/transactions');
    expect(status).toBe(200);
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.transactions)).toBe(true);
  });
});

describe('POST /api/generate', () => {
  it('should generate UBL XML from invoice data', async () => {
    const { status, data } = await fetchJson('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ invoiceData: sampleInvoiceData }),
    });
    expect(status).toBe(200);
    expect(data).toContain('<Invoice');
    expect(data).toContain('FA-2026-0042');
    expect(data).toContain('Pekáreň Pod Hradom');
  });

  it('should return 400 without invoiceData', async () => {
    const { status, data } = await fetchJson('/api/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
  });
});

describe('POST /api/generate-sample', () => {
  it('should generate a sample invoice with optional overrides', async () => {
    const { data } = await fetchJson('/api/generate-sample', {
      method: 'POST',
      body: JSON.stringify({ id: 'TEST-001' }),
    });
    expect(data).toContain('<Invoice');
    expect(data).toContain('TEST-001');
  });
});

describe('POST /api/build-as4', () => {
  it('should build a complete AS4 message from invoice data', async () => {
    const { status, data } = await fetchJson('/api/build-as4', {
      method: 'POST',
      body: JSON.stringify({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        invoiceData: sampleInvoiceData,
      }),
    });
    expect(status).toBe(200);
    expect(data.messageId).toBeDefined();
    expect(data.ublXml).toContain('<Invoice');
    expect(data.sbdhXml).toContain('StandardBusinessDocumentHeader');
    expect(data.as4Message).toContain('soap:Envelope');
  });

  it('should build AS4 from raw UBL XML', async () => {
    const ublXml = generateInvoice(sampleInvoiceData);
    const { status, data } = await fetchJson('/api/build-as4', {
      method: 'POST',
      body: JSON.stringify({
        senderId: '9914:SK2023456789',
        receiverId: '0088:SK4498765432',
        ublXml,
      }),
    });
    expect(status).toBe(200);
    expect(data.as4Message).toContain('soap:Envelope');
  });
});
