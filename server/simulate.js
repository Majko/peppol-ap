#!/usr/bin/env node
/**
 * Peppol AP Core — Simulation CLI
 *
 * CLI tool for developers to interact with the Peppol AP Core.
 * No actual Peppol network connectivity, PKI certs, or DNS access needed.
 *
 * Commands:
 *
 *   inbound           Simulate an invoice arriving from another Access Point.
 *                     Builds a real AS4 MIME message and pushes it through
 *                     the AP Core's receive pipeline. Use this to test
 *                     how your app handles incoming invoices.
 *
 *   send              Smoke-test sending an invoice (same as POST /api/send
 *                     but auto-generates fake invoice data so you don't have
 *                     to craft JSON). Returns an MDN receipt.
 *
 *   register          Add a trading partner to the simulated network so
 *                     lookup and send can find them.
 *
 *   participants      List everyone registered on the simulated network.
 *
 * Examples:
 *   node server/simulate.js inbound --sender 9914:SK5599887766 --amount 1500
 *   node server/simulate.js inbound --file invoice.xml
 *   node server/simulate.js send --amount 2500 --to 0088:SK4498765432
 *   node server/simulate.js register 9914:SK1122334455 --name "My Supplier"
 */

 const BASE = process.env.API_URL || 'http://localhost:3001';

 const cmd = process.argv[2];
 
 async function main() {
   switch (cmd) {
     case 'receive':
     case 'inbound':
       return cmdReceive();
     case 'send':
       return cmdSend();
     case 'register':
       return cmdRegister();
     case 'participants':
       return cmdParticipants();
     case 'help':
     case '--help':
     case '-h':
     default:
       return help();
   }
 }
 
 // ── receive — Simulate another AP sending an invoice to us ──────────────
 
 async function cmdReceive() {
   const args = parseArgs(process.argv.slice(3));
   const senderId = args.sender || args['--sender'] || '9914:SK5599887766';
   const receiverId = args.receiver || args['--receiver'] || args['--to'] || '9914:SK2023456789';
   const file = args.file || args['--file'] || args['-f'];
   const amount = parseFloat(args.amount || args['--amount'] || args['-a'] || '500');
   const name = args.name || args['--name'] || 'Dodávateľ s.r.o.';
 
   let ublXml;
   if (file) {
     const fs = await import('fs');
     ublXml = fs.readFileSync(file, 'utf-8');
     console.log(`📄 Loaded UBL from ${file}`);
   } else {
     // Generate a sample invoice
     const { generateInvoice } = await import('../src/ubl/generator.js');
     ublXml = generateInvoice({
       id: `SIM-IN-${Date.now()}`,
       issueDate: new Date().toISOString().split('T')[0],
       dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
       invoiceTypeCode: '380',
       currencyCode: 'EUR',
       buyerReference: `SIM-${Date.now()}`,
       seller: {
         endpointID: senderId.split(':')[1] || senderId,
         endpointSchemeID: senderId.split(':')[0] || '9914',
         name,
         streetName: 'Simulovaná 1',
         cityName: 'Bratislava',
         postalZone: '821 01',
         countryCode: 'SK',
         vatID: senderId.split(':')[1] || senderId,
         legalRegistrationName: name,
         companyID: `SK${senderId.slice(-8)}`,
       },
       buyer: {
         endpointID: receiverId.split(':')[1] || receiverId,
         endpointSchemeID: receiverId.split(':')[0] || '9914',
         name: 'Môj AP Klient s.r.o.',
         streetName: 'Priemyselná 12',
         cityName: 'Košice',
         postalZone: '040 01',
         countryCode: 'SK',
         vatID: receiverId.split(':')[1] || receiverId,
         legalRegistrationName: 'Môj AP Klient s.r.o.',
         companyID: `SK${receiverId.slice(-8)}`,
       },
       payment: { meansCode: '30', iban: 'SK6811000000001234567890', bic: 'TATRSKBX' },
       vatBreakdown: [{ taxableAmount: amount, taxAmount: +(amount * 0.23).toFixed(2), category: 'S', rate: 23 }],
       monetaryTotal: {
         lineExtensionAmount: amount,
         taxExclusiveAmount: amount,
         taxInclusiveAmount: +(amount * 1.23).toFixed(2),
         payableAmount: +(amount * 1.23).toFixed(2),
       },
       lines: [{ id: 1, quantity: 1, unitCode: 'C62', lineExtensionAmount: amount, itemName: 'Simulované služby', vatCategory: 'S', vatRate: 23, priceAmount: amount }],
     });
     console.log(`📄 Generated sample invoice (€${amount})`);
   }
 
   console.log(`📤 Injecting invoice from ${senderId} → ${receiverId}...`);
 
   const res = await fetch(`${BASE}/api/simulate/inject`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ senderId, receiverId, ublXml }),
   });
 
   const data = await res.json();
 
   if (res.ok) {
     console.log(`✅ Injected! Message: ${data.injectedMessageId?.substring(0, 40)}...`);
     console.log(`   Status: ${data.status}`);
     console.log(`   Sender: ${data.senderId}`);
     console.log(`   Receiver: ${data.receiverId}`);
     if (data.validationErrors?.length) {
       console.log(`   ⚠️  ${data.validationErrors.length} validation errors`);
     }
   } else {
     console.log(`❌ Failed: ${data.error}`);
     console.log(`   ${JSON.stringify(data.details)}`);
   }
 }
 
 // ── send — Simulate sending an invoice ──────────────────────────────────
 
 async function cmdSend() {
  const args = parseArgs(process.argv.slice(3));
  const senderId = args.sender || args['--sender'] || args['--from'] || '9914:SK2023456789';
  const receiverId = args.receiver || args['--receiver'] || args['--to'] || '0088:SK4498765432';
  const file = args.file || args['--file'] || args['-f'];
  const amount = parseFloat(args.amount || args['--amount'] || args['-a'] || '1200');
  const name = args.name || args['--name'] || 'Odosielateľ s.r.o.';

  let ublXml;
  if (file) {
    const fs = await import('fs');
    ublXml = fs.readFileSync(file, 'utf-8');
    console.log(`📄 Loaded UBL from ${file}`);
  } else {
    const { generateInvoice } = await import('../src/ubl/generator.js');
    ublXml = generateInvoice({
      id: `SIM-OUT-${Date.now()}`,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      invoiceTypeCode: '380', currencyCode: 'EUR',
      seller: {
        endpointID: senderId.split(':')[1] || senderId,
        endpointSchemeID: senderId.split(':')[0] || '9914', name,
        streetName: 'Moja 123', cityName: 'Bratislava', postalZone: '821 01',
        countryCode: 'SK', vatID: senderId.split(':')[1] || senderId,
        legalRegistrationName: name, companyID: `SK${senderId.slice(-8)}`,
      },
      buyer: {
        endpointID: receiverId.split(':')[1] || receiverId,
        endpointSchemeID: receiverId.split(':')[0] || '0088',
        name: 'Príjemca s.r.o.', streetName: 'Ich 456', cityName: 'Trnava',
        postalZone: '917 01', countryCode: 'SK',
        vatID: receiverId.split(':')[1] || receiverId,
        legalRegistrationName: 'Príjemca s.r.o.', companyID: `SK${receiverId.slice(-8)}`,
      },
      payment: { meansCode: '30', iban: 'SK6811000000001234567890' },
      vatBreakdown: [{ taxableAmount: amount, taxAmount: +(amount * 0.23).toFixed(2), category: 'S', rate: 23 }],
      monetaryTotal: {
        lineExtensionAmount: amount, taxExclusiveAmount: amount,
        taxInclusiveAmount: +(amount * 1.23).toFixed(2), payableAmount: +(amount * 1.23).toFixed(2),
      },
      lines: [{ id: 1, quantity: 1, unitCode: 'C62', lineExtensionAmount: amount, itemName: 'Služby', vatCategory: 'S', vatRate: 23, priceAmount: amount }],
    });
    console.log(`📄 Generated invoice (€${amount})`);
  }

  console.log(`📤 Sending from ${senderId} → ${receiverId}...`);

  const res = await fetch(`${BASE}/api/simulate/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId, receiverId, ublXml }),
  });

  const data = await res.json();
  console.log(`✅ ${res.ok ? 'Sent!' : 'Failed'}`);
  console.log(`   Message: ${data.messageId?.substring(0, 40)}...`);
  console.log(`   Status: ${data.status}`);
  if (data.receipt) console.log(`   📬 MDN Receipt: ✓ (${data.receipt.length} bytes)`);
  if (data.simulated) console.log(`   🔄 Simulated network`);
}

// ── register — Register a participant ───────────────────────────────────

async function cmdRegister() {
  const id = process.argv[3];
  const args = parseArgs(process.argv.slice(4));
  const name = args.name || args['--name'] || args['-n'];

  if (!id) {
    console.log('❌ Usage: node server/simulate.js register <participant-id> [--name "Name"]');
    process.exit(1);
  }

  const res = await fetch(`${BASE}/api/simulate/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name }),
  });

  const data = await res.json();
  if (data.success) {
    console.log(`✅ Registered: ${id}`);
  } else {
    console.log(`❌ Failed: ${data.error}`);
  }
}

// ── participants — List registered participants ─────────────────────────

async function cmdParticipants() {
  const res = await fetch(`${BASE}/api/simulate/participants`);
  const data = await res.json();
  console.log(`📋 Registered participants (${data.count}):`);
  for (const p of data.participants) {
    console.log(`   • ${p.id.padEnd(30)} ${p.name}`);
  }
}

// ── Help ────────────────────────────────────────────────────────────────

function help() {
  console.log(`
🇸🇰  Peppol AP Core — Simulation CLI

Usage:
  inbound  [options]     Simulate an invoice arriving from another AP
                         (tests the receive pipeline & your webhook)
  send     [options]     Smoke-test sending (same as POST /api/send,
                         generates fake data so you don't have to)
  register <id> [opts]   Register a trading partner on the network
  participants           List everyone registered

Most useful command — test inbound delivery:
  node server/simulate.js inbound --sender 9914:SK5599887766 --amount 2500

Smoke test — quick check the AP responds:
  node server/simulate.js send --amount 999 --to 0088:SK4498765432

Options:
  --sender, --from    Participant ID of the sender     (default: 9914:SK5599887766)
  --receiver, --to    Participant ID of the receiver   (default: 0088:SK4498765432)
  --file, -f          Path to a UBL XML file
  --amount, -a        Invoice amount in EUR            (default: 500)
  --name              Trading name for the invoice

Examples:
  node server/simulate.js inbound --sender 9914:SK5599887766 --amount 2500
  node server/simulate.js inbound --file ./invoice.xml
  node server/simulate.js send --amount 999 --to 0088:SK4498765432
  node server/simulate.js register 9914:SK1122334455 --name "My Supplier"
  node server/simulate.js participants
`);
}

// ── Args parser ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name' && !argv[i+1]?.startsWith('-')) {
      // name might be the rest of the args
      args.name = argv.slice(i + 1).join(' ');
      break;
    }
    if (argv[i].startsWith('--') || argv[i].startsWith('-')) {
      const key = argv[i].replace(/^--?/, '');
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args[key] = argv[i + 1];
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

main().catch((err) => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
