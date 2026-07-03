#!/usr/bin/env node
/**
 * Demo: Accounting App connecting to the Peppol AP Core
 *
 * Shows how an accounting/invoicing software would interact
 * with the simulated Peppol environment to send e-invoices.
 *
 * Usage:
 *   1. Start the server:   node server/index.js --start
 *   2. Run this demo:      node examples/demo-accounting-app.js
 */

const BASE = process.env.API_URL || 'http://localhost:3001';

// ── Sample invoice data (Slovak SME → municipal office) ──
const invoiceData = {
  id: `FA-${Date.now()}`,
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  invoiceTypeCode: '380',
  currencyCode: 'EUR',

  seller: {
    endpointID: 'SK2023456789',
    endpointSchemeID: '9914',
    name: 'MojaFaktura s.r.o.',
    streetName: 'Digital Park 42',
    cityName: 'Bratislava',
    postalZone: '821 09',
    countryCode: 'SK',
    vatID: 'SK2023456789',
    legalRegistrationName: 'MojaFaktura s.r.o.',
    companyID: 'SK87654321',
  },

  buyer: {
    endpointID: 'SK4498765432',
    endpointSchemeID: '9914',
    name: 'Mesto Trnava',
    streetName: 'Trojičné námestie 1',
    cityName: 'Trnava',
    postalZone: '917 01',
    countryCode: 'SK',
    vatID: 'SK4498765432',
    legalRegistrationName: 'Mesto Trnava',
    companyID: '00312316',
    companyIDSchemeID: '0130',
  },

  payment: {
    meansCode: '30',
    iban: 'SK6811000000001234567890',
    bic: 'TATRSKBX',
  },

  vatBreakdown: [
    { taxableAmount: 1200.0, taxAmount: 276.0, category: 'S', rate: 23.0 },
  ],

  monetaryTotal: {
    lineExtensionAmount: 1200.0,
    taxExclusiveAmount: 1200.0,
    taxInclusiveAmount: 1476.0,
    allowanceTotalAmount: 0,
    chargeTotalAmount: 0,
    payableAmount: 1476.0,
  },

  lines: [
    {
      id: 1,
      quantity: 40,
      unitCode: 'HUR',
      lineExtensionAmount: 1200.0,
      itemName: 'Konzultačné služby - IT podpora',
      vatCategory: 'S',
      vatRate: 23.0,
      priceAmount: 30.0,
    },
  ],
};

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🇸🇰  Accounting App Demo — Peppol Invoice Send     ║
║  Connected to: ${BASE.padEnd(38)}║
╚══════════════════════════════════════════════════════╝
`);

  // Step 1: Check health
  console.log('📡 1. Checking server health...');
  const health = await api('GET', '/api/health');
  console.log(`   ✅ Server ${health.status} | Mode: ${health.mode} | TXs: ${health.transactionCount}\n`);

  // Step 2: Validate the invoice before sending
  console.log('🔍 2. Pre-flight validation...');
  const genRes = await api('POST', '/api/generate', { invoiceData });
  const ublXml = genRes.raw;
  console.log(`   ✅ UBL XML generated (${ublXml.length} bytes)`);

  const validation = await api('POST', '/api/validate', { ublXml });
  if (validation.valid) {
    console.log(`   ✅ Invoice passed all ${validation.errors.length + validation.warnings.length} validation rules`);
  } else {
    console.log(`   ❌ Validation FAILED:`);
    for (const err of validation.errors) {
      console.log(`      ${err.rule}: ${err.message}`);
    }
    return;
  }
  console.log();

  // Step 3: Look up the receiver
  console.log('🌐 3. Looking up receiver participant...');
  try {
    const lookup = await api('GET', `/api/lookup/${encodeURIComponent('0088:SK4498765432')}`);
    console.log(`   ✅ Found: ${lookup.participantId}`);
    console.log(`   📍 Endpoint: ${lookup.services[0].endpoint}`);
  } catch {
    console.log('   ⚠️  Lookup note: receiver not on live Peppol network (expected in simulation)');
  }
  console.log();

  // Step 4: Send the invoice via Peppol
  console.log('📤 4. Sending invoice via Peppol...');
  const sendResult = await api('POST', '/api/send', {
    senderId: '9914:SK2023456789',
    receiverId: '0088:SK4498765432',
    ublXml,
  });

  if (sendResult.messageId) {
    console.log(`   ✅ Sent! Message ID: ${sendResult.messageId}`);
    console.log(`   📬 Status: ${sendResult.status}`);
    console.log(`   🕐 Timestamp: ${sendResult.timestamp}`);
  }
  console.log();

  // Step 5: Check delivery status
  console.log('📋 5. Checking delivery status...');
  const status = await api('GET', `/api/status/${sendResult.messageId}`);
  console.log(`   ✅ Message: ${status.messageId.substring(0, 50)}...`);
  console.log(`   📊 Status: ${status.status}`);
  console.log(`   🕐 Updated: ${status.updated_at}`);
  console.log();

  // Step 6: View transaction history
  console.log('📊 6. Transaction history...');
  const txs = await api('GET', '/api/transactions');
  console.log(`   📦 Total transactions: ${txs.count}`);
  for (const tx of txs.transactions) {
    const icon = tx.direction === 'send' ? '⬆️' : '⬇️';
    console.log(`   ${icon} [${tx.status}] ${tx.senderId} → ${tx.receiverId}  (${tx.documentType})`);
  }
  console.log();

  // Step 7: Build the AS4 message (for inspection)
  console.log('📦 7. Building AS4 wire message...');
  const as4 = await api('POST', '/api/build-as4', {
    senderId: '9914:SK2023456789',
    receiverId: '0088:SK4498765432',
    invoiceData,
  });
  const as4Size = as4.as4Message.length;
  const sbdhSize = as4.sbdhXml.length;
  console.log(`   ✅ AS4 MIME message: ${(as4Size / 1024).toFixed(1)} KB`);
  console.log(`   📑 SBDH envelope: ${(sbdhSize / 1024).toFixed(1)} KB`);
  console.log(`   📄 UBL payload: ${(as4.ublXml.length / 1024).toFixed(1)} KB`);
  console.log();

  // Summary
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ✅  Invoice successfully processed!                ║');
  console.log('║                                                     ║');
  console.log(`║  Invoice:  ${invoiceData.id.padEnd(33)}║`);
  console.log(`║  Amount:   €${invoiceData.monetaryTotal.payableAmount.toFixed(2).padStart(8)} EUR              ║`);
  console.log(`║  From:     ${invoiceData.seller.name.substring(0, 25).padEnd(25)}║`);
  console.log(`║  To:       ${invoiceData.buyer.name.substring(0, 25).padEnd(25)}║`);
  console.log('║  Status:   delivered                                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();
  console.log('💡 Your accounting app can POST invoice JSON or UBL XML to:');
  console.log(`   POST ${BASE}/api/send`);
  console.log(`   POST ${BASE}/api/send/xml (raw UBL XML)`);
  console.log(`   POST ${BASE}/api/validate`);
  console.log(`   GET  ${BASE}/api/status/:messageId`);
}

// ── API helper ──
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();

  try {
    return { ...JSON.parse(text), raw: text, _status: res.status };
  } catch {
    return { raw: text, _status: res.status };
  }
}

main().catch((err) => {
  console.error(`\n❌ Demo failed: ${err.message}`);
  console.error(`   Is the server running? Try: node server/index.js --start`);
  process.exit(1);
});
