# 🇸🇰 Peppol Access Point Core

A **pure Node.js** implementation of a Peppol Access Point (AP) Core — the certified transport layer for Peppol BIS Billing 3.0 e-invoices.

Built for the Slovak market (mandatory B2B e-invoicing from **1 January 2027**), but fully Peppol-compliant for any EU country.

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
║  │                                      │    ║
║  │  sendInvoice()       → AS4 send     │    ║
║  │  validateDocument()  → Schematron   │    ║
║  │  lookupParticipant() → SMP resolve  │    ║
║  │  getStatus()         → TX tracking  │    ║
║  │  handleIncoming()    → AS4 receive  │    ║
║  └──────────────┬───────────────────────┘    ║
║                 │                             ║
║  ┌──────────────┴───────────────────────┐    ║
║  │  Modules:                           │    ║
║  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐ │    ║
║  │  │ UBL  │ │ SBDH │ │ AS4  │ │ TX │ │    ║
║  │  │ Gen  │ │ Env  │ │ Msg  │ │ Log│ │    ║
║  │  └──────┘ └──────┘ └──────┘ └────┘ │    ║
║  │  ┌──────┐ ┌──────┐ ┌──────────┐    │    ║
║  │  │ UBL  │ │ UBL  │ │ Validate │    │    ║
║  │  │Parse │ │Gen    │ │ Rules    │    │    ║
║  │  └──────┘ └──────┘ └──────────┘    │    ║
║  └────────────────────────────────────┘    ║
╚══════════════════════════════════════════════╝
        │
        ▼
┌──────────────────────────────────────────────┐
│         SERVICE PLATFORM (your product)       │
│  React Portal · Express API · PostgreSQL      │
│  (separate project — consumes AP Core API)    │
└──────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install
npm install

# Run tests (54+ tests across 5 test files)
npm test

# Run standalone verification
npm run verify

# Run tests in watch mode during development
npm run test:watch
```

## Project Structure

```
src/
├── index.js          # AP Core main interface — 5 operations
├── ubl/
│   ├── generator.js   # UBL Invoice/CreditNote XML builder
│   ├── parser.js      # UBL XML parser → internal JSON
│   └── validator.js   # Peppol BIS 3.0 business rule validation
└── as4/
    ├── sbdh.js        # SBDH envelope builder/parser
    └── message.js     # AS4 SOAP/MIME message builder/parser

test/
├── fixtures.js               # Test data (Slovak bakery invoice)
├── ubl-generator.test.js     # 12 tests
├── ubl-validator.test.js     # 14 tests
├── sbdh.test.js              # 9 tests
├── as4-message.test.js       # 6 tests
└── ap-core.test.js           # 13 tests

examples/
├── sample-invoice.xml        # Peppol-compliant sample UBL invoice
└── verify-standalone.js      # Full end-to-end verification
```

## Validation Rules Implemented

| Rule | Description | Severity |
|------|------------|----------|
| R001 | Mandatory fields present (CustomizationID, ProfileID, ID, IssueDate, etc.) | fatal |
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

## AP Core Interface

### 1. Send Invoice
```js
import { sendInvoice } from 'peppol-ap';

const result = await sendInvoice({
  senderId: '9914:SK2023456789',
  receiverId: '0088:SK4498765432',
  ublXml: '<?xml...>',
});
// → { messageId, status: 'delivered'|'sent', receipt, timestamp }
```

### 2. Validate Document
```js
import { validateDocument } from 'peppol-ap';

const result = validateDocument(ublXml);
// → { valid: true/false, errors: [...], warnings: [...] }
```

### 3. Lookup Participant
```js
import { lookupParticipant } from 'peppol-ap';

const result = await lookupParticipant('9914:SK2023456789');
// → { participantId, smpUrl, services: [...] }
```

### 4. Get Status
```js
import { getStatus } from 'peppol-ap';

const status = getStatus('uuid:...@ap.mojafaktura.sk');
// → { messageId, status, receipt, error, retries }
```

### 5. Register Webhook
```js
import { registerWebhook } from 'peppol-ap';

registerWebhook({
  url: 'https://app.example.com/api/webhook/invoice-received',
  secret: 'whsec_...',
});
```

## Documents

### Sample UBL Invoice (`examples/sample-invoice.xml`)

A fully Peppol-compliant BIS Billing 3.0 invoice:
- Slovak bakery → municipal office
- Two VAT rates: 23% (standard) + 10% (reduced)
- Full IBAN + BIC payment details
- Two line items with proper unit codes (KGM, DAY)

## Production Path

This AP Core provides the complete interface — but for actual AS4 transport, you need:

1. **Node42** (`@n42/edelivery`) for AS4 send/receive over HTTPS
2. **Peppol PKI certificates** from OpenPeppol (test + production)
3. **SML/SMP** DNS + HTTP lookup services
4. **Schematron engine** (Node42 bundles this)
5. **Webhook HMAC** signing for secure delivery

See the lessons in `doc/lessons/` for the complete accreditation path.

## License

MIT
