# HMAC Webhook Signing

**Status:** implemented

**Blocked by:** 01 - Storage adapter interface + mock

## Parent

Depends on ticket 01 — Storage adapter interface + mock

## What to build

Add HMAC-SHA256 signing to outgoing webhooks so that downstream systems (the Service Platform or third-party integrations) can cryptographically verify the authenticity and integrity of delivered payloads.

### Why this matters

When the AP Core receives an incoming AS4 message and delivers it via webhook, the downstream system needs to trust that the payload actually came from the AP Core and hasn't been tampered with. Without signing, an attacker who can TCP-intercept the webhook URL could inject fake invoices.

### Signing scheme (Stripe/Svix-compatible)

```
HMAC-SHA256(secret, payload + timestamp)

Headers:
  X-Peppol-Signature: sha256=<hex_signature>
  X-Peppol-Timestamp: <unix_epoch_seconds>
```

### Verification (for downstream systems)

```
1. Read timestamp from X-Peppol-Timestamp header
2. Reject if timestamp is older than 5 minutes (replay protection)
3. Compute HMAC-SHA256(shared_secret, body + timestamp)
4. Compare against X-Peppol-Signature value
5. If match → payload is authentic
```

### Implementation in the AP Core

In `src/index.js`, the `callWebhook()` function currently does:

```javascript
async function callWebhook(payload) {
  if (!webhookConfig) return;
  await fetch(webhookConfig.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

After this change:

```javascript
async function callWebhook(payload) {
  if (!webhookConfig) return;
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = computeHmac(webhookConfig.secret, body, timestamp);

  await fetch(webhookConfig.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Peppol-Signature': `sha256=${signature}`,
      'X-Peppol-Timestamp': String(timestamp),
    },
    body,
  });
}
```

### HMAC computation

```javascript
import { createHmac } from 'node:crypto';

function computeHmac(secret, payload, timestamp) {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  hmac.update(String(timestamp));
  return hmac.digest('hex');
}
```

### Webhook config changes

The `webhookConfig` currently stores just `{ url }`. Extend to:

```javascript
{
  url: string;       // POST destination
  secret: string;    // shared HMAC secret (from WEBHOOK_SECRET env var)
}
```

### Replay protection note

Replay protection is the downstream's responsibility (they check the timestamp). The AP Core documents the expected verification logic in the webhook API reference.

### Retry on webhook failure

If the downstream returns a non-2xx status:

- Wait 5 seconds, retry up to 3 times
- Exponential backoff: 5s, 15s, 45s
- Log all delivery attempts
- Store delivery status in the transaction record (future: add `webhook_status` and `webhook_last_attempt` columns)

### Files to modify

| File | Change |
|------|--------|
| `src/index.js` | `callWebhook()` computes HMAC, adds headers, retries on failure. `registerWebhook()` accepts `secret`. |
| `server/index.js` | Read `WEBHOOK_SECRET` env var and pass to `registerWebhook()`. |
| `test/ap-core.test.js` | Add tests for HMAC header presence, correct signature, tampered body detection, retry on failure. |

### Test cases

| Test | Scenario | Assertion |
|------|----------|-----------|
| HMAC header present | Call webhook with secret set | `X-Peppol-Signature` header is present |
| HMAC matches expected | Call webhook, compute expected HMAC externally | Header value matches computed value |
| Different secret → different signature | Call webhook with two different secrets | Signatures differ |
| Tampered body detected | Call webhook, modify body post-signing | Signature doesn't match (tested by simulating downstream verification) |
| Timestamp header present | Call webhook | `X-Peppol-Timestamp` is within 2 seconds of current time |
| Webhook failure retry | Downstream returns 503 | AP Core retries 3 times with backoff |
| No secret → no HMAC header | Call webhook with empty secret | Headers are absent (backwards compatible) |

## Acceptance criteria

- [ ] `callWebhook()` computes `HMAC-SHA256(body + timestamp, secret)` and sends it as `X-Peppol-Signature`
- [ ] `X-Peppol-Timestamp` header contains Unix epoch seconds
- [ ] When `WEBHOOK_SECRET` is empty, no signature headers are sent (backwards compatible)
- [ ] When downstream returns non-2xx, webhook is retried 3 times with 5s/15s/45s backoff
- [ ] After all retries exhausted, the failure is logged but does not crash the AP Core
- [ ] Webhook delivery status is tracked (logged with transaction messageId)
- [ ] `registerWebhook()` accepts and stores the secret
- [ ] All existing tests remain green
