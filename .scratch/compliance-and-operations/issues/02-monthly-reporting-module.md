# Monthly Reporting Module (EUSR + TSR)

**Status:** implemented

**Blocked by:** ap-core-infrastructure/02 - SQLite storage adapter (needs transaction store with country fields populated)

## What to build

SPA 9.4.8 requires submitting two monthly reports to OpenPeppol:

1. **End User Statistics Report (EUSR)** — number of end users, by country, by document type
2. **Transaction Statistics Report (TSR)** — number of documents sent/received, by direction, by document type, by country pair

These must be submitted monthly via OpenPeppol's defined format and channel. Build a reporting module that aggregates our transaction data and generates the required reports.

### Report formats

Based on the OpenPeppol Reporting Operational Guideline v1.0.2:

**EUSR — End User Statistics:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<EndUserStatisticsReport>
  <reportingPeriod>
    <from>2026-07-01</from>
    <to>2026-07-31</to>
  </reportingPeriod>
  <serviceProvider>
    <id>POP000001</id>
    <country>SK</country>
  </serviceProvider>
  <endUsers>
    <endUser country="SK" documentType="invoice" count="45"/>
    <endUser country="SK" documentType="creditnote" count="3"/>
    <endUser country="CZ" documentType="invoice" count="12"/>
  </endUsers>
</EndUserStatisticsReport>
```

**TSR — Transaction Statistics:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<TransactionStatisticsReport>
  <reportingPeriod>...</reportingPeriod>
  <serviceProvider>
    <id>POP000001</id>
  </serviceProvider>
  <transactions>
    <transaction direction="send" docType="invoice"
                 senderCountry="SK" receiverCountry="SK" count="380"/>
    <transaction direction="receive" docType="invoice"
                 senderCountry="CZ" receiverCountry="SK" count="95"/>
  </transactions>
</TransactionStatisticsReport>
```

> **Note:** Exact XML schema should be verified against the latest OpenPeppol reporting specification at time of implementation.

### Aggregation queries

Against our transaction store (SQLite/DynamoDB):

```sql
-- EUSR: count unique end users by country and doc type
SELECT
  receiver_country AS country,
  doc_type_id AS documentType,
  COUNT(DISTINCT receiver_id) AS count
FROM transactions
WHERE created_at BETWEEN ? AND ?
  AND direction = 'receive'
  AND status = 'delivered'
GROUP BY receiver_country, doc_type_id;

-- TSR: count transactions by direction, type, country pair
SELECT
  direction,
  doc_type_id AS docType,
  sender_country,
  receiver_country,
  COUNT(*) AS count
FROM transactions
WHERE created_at BETWEEN ? AND ?
  AND status IN ('delivered', 'sent')
GROUP BY direction, doc_type_id, sender_country, receiver_country;
```

### CLI usage

```bash
# Generate both reports for last month
peppol-ap reports generate --month 2026-07 --format xml

# Generate and preview (stdout)
peppol-ap reports preview --month 2026-07

# Output directory
peppol-ap reports generate --month 2026-07 --output ./reports/
```

### Automated scheduling

- Run on the 1st of each month via cron / scheduler
- Generate both reports
- Email to OpenPeppol (or upload to their portal — verify delivery method at time of implementation)
- Archive in `./reports/` for audit trail

### New files

| File | Purpose |
|------|---------|
| `src/reports/eusr.js` | End User Statistics Report generator |
| `src/reports/tsr.js` | Transaction Statistics Report generator |
| `src/reports/scheduler.js` | Monthly scheduling logic |
| `test/reports.test.js` | Tests for report generation and aggregation |

### Modified files

| File | Change |
|------|--------|
| `src/store/interfaces.js` | Add `getEndUserStats(from, to)` and `getTransactionStats(from, to)` to TransactionStore interface |
| `src/store/sqlite.js` | Implement the two aggregation queries |
| `src/store/mock.js` | Implement mock versions for testing |
| `package.json` | Add `"report": "node src/reports/scheduler.js"` script |

## Acceptance criteria

- [ ] EUSR generates correct XML with end user counts by country and doc type
- [ ] TSR generates correct XML with transaction counts by direction, type, country pair
- [ ] Both reports are scoped to a configurable monthly period
- [ ] CLI commands work: `peppol-ap reports generate`, `peppol-ap reports preview`
- [ ] Aggregation queries are implemented in the TransactionStore interface + SQLite adapter
- [ ] Report output matches OpenPeppol expected format (verify against latest spec)
- [ ] Scheduler can run as a cron job
- [ ] Reports are archived in a configured directory
- [ ] Tests cover: empty period, single transaction, mixed directions, multiple countries
