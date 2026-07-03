# 🇸🇰 Peppol Access Point Core

A **pure Node.js** implementation of a Peppol Access Point (AP) Core — the certified transport layer for Peppol BIS Billing 3.0 e-invoices.

Built for the Slovak market (mandatory B2B e-invoicing from **1 January 2027**), but fully Peppol-compliant for any EU country.

Powered by **[Node42](https://github.com/node42-dev/node42-edelivery)** (`@n42/edelivery`) for real AS4 transport, SMP lookup, and Schematron validation.

---

## Quick Start

```bash
# Install
npm install

# Run all tests (74 vitest + 16 standalone)
npm test

# Standalone verification
npm run verify

# Start the AP server in simulation mode (no Peppol network needed)
npm run start:sim

# Start the AP server in live mode (requires Peppol network access)
npm start
```

---

## Modes

### 🔄 Simulation Mode (`--simulate`)

Fully simulated Peppol network — all operations happen in-memory. No DNS, no SML/SMP, no PKI certificates needed. Returns realistic MDN receipts as if the other AP received and acknowledged the message.

```bash
npm run start:sim
# Server on http://localhost:3001 — SIMULATION mode
```

In simulation mode:

| What happens | Behaviour |
|---|---|
| `POST /api/send` | Validates → looks up receiver in simulated SMP → returns **MDN receipt** (1289-byte SOAP envelope with simulated XML signature) |
| `POST /api/simulate/inject` | Builds an AS4 message as if **another AP sent it** to us, processes through receive pipeline |
| `GET /api/lookup/:id` | Returns simulated SMP data (no DNS resolution) |
| `GET /api/simulate/participants` | Lists all participants in the simulated network |

### 🌐 Live Mode (default)

Connects to the real Peppol network via Node42. Requires:

- Peppol PKI certificates (from OpenPeppol Service Desk)
- DNS resolution of the Peppol SML (`sml.peppolcentral.org`)
- Network access to Peppol SMP endpoints

```bash
npm start
# Server on http://localhost:3001 — LIVE mode
```

---

## Server API

Start the server:

```bash
# Simulation mode (recommended for development)
node server/index.js --start --simulate

# Live mode (requires Peppol network)
node server/index.js --start

# Custom port
PORT=4000 node server/index.js --start --simulate
```

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health, mode, transaction count |
| `POST` | `/api/send` | Send an invoice (JSON with `ublXml` or `invoiceData`) |
| `POST` | `/api/send/xml` | Send raw UBL XML (`Content-Type: application/xml`) |
| `POST` | `/api/validate` | Validate a UBL document against Peppol rules |
| `GET` | `/api/lookup/:id` | Look up a Peppol participant |
| `GET` | `/api/status/:id` | Check delivery status of a sent message |
| `GET` | `/api/transactions` | List all transactions |
| `GET` | `/api/txs` | Alias for transactions |

### Simulation Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/simulate/send` | Send with simulated network (always simulates, ignores mode) |
| `POST` | `/api/simulate/inject` | Simulate **another AP** sending an invoice to us |
| `GET` | `/api/simulate/participants` | List registered participants |
| `POST` | `/api/simulate/participants` | Register a participant `{ id, name? }` |

### Utility Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/generate` | Convert invoice JSON to UBL XML |
| `POST` | `/api/generate-sample` | Generate a sample invoice with optional overrides |
| `POST` | `/api/build-as4` | Build a complete AS4 MIME message (for inspection) |
| `POST` | `/api/receive` | Manually feed an AS4 MIME message into the receive pipeline |

---

## CLI Simulation Tool

The `server/simulate.js` CLI lets you simulate Peppol network activity interactively.

```bash
node server/simulate.js <command> [options]
```

### Commands

#### `receive` — Simulate another AP sending an invoice to us

```bash
# Generate and inject a €2,500 invoice from a supplier
node server/simulate.js receive --sender 9914:SK5599887766 --amount 2500

# Inject from a UBL XML file
node server/simulate.js receive --file ./invoice.xml

# Full example
node server/simulate.js receive \
  --sender 9914:SK5599887766 \
  --receiver 9914:SK2023456789 \
  --amount 1500 \
  --name "Dodávateľ s.r.o."
```

#### `send` — Simulate sending an invoice (with MDN receipt)

```bash
# Send a €999 invoice
node server/simulate.js send --amount 999 --to 0088:SK4498765432

# Send from a UBL file
node server/simulate.js send --file ./invoice.xml

# Full example
node server/simulate.js send \
  --sender 9914:SK2023456789 \
  --to 0088:SK4498765432 \
  --amount 5000 \
  --name "MojaFaktura s.r.o."
```

#### `register` — Add a trading partner to the simulated network

```bash
node server/simulate.js register 9914:SK1122334455 --name "My Supplier"
node server/simulate.js register 0088:SK9988776655
```

#### `participants` — List all registered participants

```bash
node server/simulate.js participants
# → 📋 Registered participants (3):
#    • 9914:SK2023456789            Odosielateľ s.r.o.
#    • 0088:SK4498765432            Príjemca s.r.o.
#    • 9914:SK1122334455            My Supplier
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--sender`, `--from` | | Sender Peppol participant ID |
| `--receiver`, `--to` | | Receiver Peppol participant ID |
| `--file` | `-f` | Path to a UBL XML file |
| `--amount` | `-a` | Invoice amount in EUR (default: 500) |
| `--name` | | Trading name for the invoice |

### NPM Scripts

```bash
npm run sim:receive      # node server/simulate.js inbound (simulate another AP sending to us)
npm run sim:send         # node server/simulate.js send (smoke-test POST /api/send)
npm run sim:register     # node server/simulate.js register <id>
npm run sim:participants # node server/simulate.js participants
```

---

## Accounting App Integration

Your accounting app can connect to the AP Core via HTTP. CORS is enabled.

### Send an Invoice

```bash
curl -X POST http://localhost:3001/api/send \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "9914:SK2023456789",
    "receiverId": "0088:SK4498765432",
    "ublXml": "<?xml version=\"1.0\"?>..."
  }'
```

Or send structured JSON data (converted to UBL automatically):

```bash
curl -X POST http://localhost:3001/api/send \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "9914:SK2023456789",
    "receiverId": "0088:SK4498765432",
    "invoiceData": {
      "id": "FA-2026-0042",
      "issueDate": "2026-07-03",
      "invoiceTypeCode": "380",
      "currencyCode": "EUR",
      ...seller, buyer, lines, totals...
    }
  }'
```

### Send Raw UBL XML

```bash
curl -X POST http://localhost:3001/api/send/xml \
  -H 'Content-Type: application/xml' \
  --data-binary @invoice.xml
```

### Validate Before Sending

```bash
curl -X POST http://localhost:3001/api/validate \
  -H 'Content-Type: application/json' \
  -d '{"ublXml": "<?xml version=\"1.0\"?>..."}'
# → { "valid": true/false, "errors": [...], "warnings": [...] }
```

### Check Delivery Status

```bash
curl http://localhost:3001/api/status/uuid:abc123...@ap.mojafaktura.sk
# → { "messageId": "...", "status": "delivered", "receipt": "<?xml...>" }
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              PEPPOL NETWORK                 │
│           (other APs, SMP, SML)             │
└────────────────┬────────────────────────────┘
                 │ AS4 over HTTPS (port 443)
                 ▼
╔══════════════════════════════════════════════╗
║         PEPPOL ACCESS POINT CORE             ║
║                                              ║
║  ┌──────────────────────────────────────┐    ║
║  │  AP Core Interface:                  │    ║
║  │  sendInvoice · validateDocument      │    ║
║  │  lookupParticipant · getStatus       │    ║
║  │  handleIncoming · registerWebhook    │    ║
║  └──────────────┬───────────────────────┘    ║
║                 │                             ║
║  ┌──────────────┴───────────────────────┐    ║
║  │  Modules:                           │    ║
║  │  UBL Gen/Parser · Validator (15 rules) │  ║
║  │  SBDH Envelope · AS4 MIME Message    │    ║
║  │  Node42 Integration · Simulator      │    ║
║  └──────────────────────────────────────┘    ║
╚══════════════════════════════════════════════╝
        │
        ▼
┌──────────────────────────────────────────────┐
│         YOUR ACCOUNTING APP                   │
│  (React portal, accounting SW, CLI, etc.)     │
│  POST /api/send · GET /api/status/:id         │
└──────────────────────────────────────────────┘
```

---

## Project Structure

```
src/
├── index.js           # AP Core — 5 operations + simulation mode
├── simulator.js       # In-memory Peppol network (SMP, MDN, routing)
├── ubl/
│   ├── generator.js   # UBL Invoice/CreditNote XML builder
│   ├── parser.js      # UBL XML parser → internal JSON
│   └── validator.js   # 15 Peppol BIS 3.0 business rules
└── as4/
    ├── sbdh.js        # SBDH envelope builder/parser
    ├── message.js     # AS4 SOAP/MIME multipart builder/parser
    └── node42.js      # @n42/edelivery integration layer

server/
├── index.js           # Express server (--start / --simulate)
└── simulate.js        # CLI tool for Peppol network simulation

test/
├── fixtures.js        # Test data (Slovak bakery invoice)
├── ubl-generator.test.js   # 12 tests
├── ubl-validator.test.js   # 14 tests
├── sbdh.test.js             # 9 tests
├── as4-message.test.js      # 6 tests
├── ap-core.test.js          # 13 tests
└── server-integration.test.js # 20 tests

examples/
├── sample-invoice.xml       # Peppol-compliant sample UBL invoice
├── verify-standalone.js     # Full end-to-end verification (16 tests)
└── demo-accounting-app.js   # Accounting app integration demo
```

---

## Validation Rules

| Rule | Description | Severity |
|------|-------------|----------|
| R001 | Mandatory fields (CustomizationID, ProfileID, ID, IssueDate, etc.) | fatal |
| R003 | Valid invoice type codes (380, 381, 383, 384, 386, 389) | fatal |
| R004 | Valid ISO country codes | warning |
| R005 | Valid ISO currency codes | warning |
| R006 | Valid VAT category codes (S, AA, E, AE, K, G, O) | fatal |
| R010 | Invoice line must have item name | fatal |
| R029 | TaxInclusiveAmount = TaxExclusiveAmount + VAT total | fatal |
| R030 | PayableAmount check against inclusive amount | warning |
| R031 | LineExtensionAmount = sum of invoice lines | fatal |
| R033 | VAT total = sum of TaxSubtotal/TaxAmount | fatal |
| R065 | Standard rate (S) must have rate > 0 | fatal |
| R066 | Exempt categories (E, AE, K, G) must have rate = 0 | fatal |
| R067 | Reduced rate (AA) must have rate > 0 | fatal |

Also runs **Node42's official Peppol Schematron** (SaxonJS-based) for additional coverage when available.

---

## NPM Scripts Reference

```bash
npm test              # Run all vitest tests (74)
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run verify        # Standalone verification (16 tests)
npm start             # Start server (live mode)
npm run start:sim     # Start server (simulation mode)
npm run demo          # Accounting app demo
npm run sim:receive   # CLI: simulate inbound invoice (another AP sends to us)
npm run sim:send      # CLI: smoke-test send endpoint (auto-generates data)
npm run sim:register  # CLI: register a participant
npm run sim:participants # CLI: list participants
```

---

## Production Path

This AP Core provides the complete interface. For actual Peppol accreditation:

1. **PKI Certificates** — request from OpenPeppol Service Desk
2. **Node42** — already installed, handles AS4 transport
3. **Schematron** — SaxonJS-based validation bundled with Node42
4. **SML/SMP** — real DNS lookup via Node42 (works when Peppol network is reachable)
5. **Webhook HMAC** — add shared-secret signing for inbound delivery

See the lessons in `doc/lessons/` for the complete accreditation path.

---

## License

MIT
