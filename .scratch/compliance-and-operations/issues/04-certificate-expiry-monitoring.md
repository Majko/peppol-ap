# Certificate Expiry Monitoring

**Status:** implemented

**Blocked by:** ap-core-infrastructure/03 - Production AS4 send path (needs identityStore.getActiveCert())

## What to build

SPA 9.4.4 requires: *"Paying attention to alerts, warnings and 'hot-fixes' published by the Peppol Coordinating Authority, and acting accordingly in a professional, diligent and timely manner adhering to any published migration plans and mandated dates."*

A Peppol certificate that expires without renewal means your AP is immediately disconnected from the network. This is not a gradual warning — the certificate simply stops being trusted by other APs.

Build a certificate expiry monitor that:
1. Checks the AP's own Peppol certificate daily
2. Warns when expiry is approaching (60, 30, 14, 7 days before)
3. Blocks AS4 sending if the certificate is expired (already covered by Slice 3)
4. Monitors OpenPeppol announcements for mandatory migrations (e.g., PKI CA changes)

### Certificate check

```javascript
// src/monitoring/certificate-monitor.js
import { getCertInfo } from '@n42/edelivery';

export async function checkCertExpiry(identityStore) {
  const cert = await identityStore.getActiveCert();
  if (!cert) return { status: 'error', message: 'No active certificate found' };
  
  const info = getCertInfo(cert.certPem);
  const expiresAt = new Date(info.validTo);
  const now = new Date();
  const daysLeft = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
  
  return {
    status: daysLeft <= 0 ? 'expired' :
            daysLeft <= 7 ? 'critical' :
            daysLeft <= 14 ? 'warning' :
            daysLeft <= 30 ? 'notice' :
            'ok',
    certId: cert.certId,
    expiresAt: info.validTo,
    daysLeft,
    subject: info.subject,
    issuer: info.issuer,
  };
}
```

### Alerting channels

| Days left | Severity | Action |
|-----------|----------|--------|
| ≤ 0 | 🔴 Critical | Log error, notify via email + SMS (or Slack/Teams webhook) |
| ≤ 7 | 🟠 Warning | Daily warning log, email notification |
| ≤ 14 | 🟡 Notice | Notice in daily log |
| ≤ 30 | 🔵 Info | Weekly reminder log |
| > 30 | ✅ OK | No action |

### OpenPeppol alert monitoring

OpenPeppol publishes critical updates via:
- Member mailing list
- Peppol Service Desk announcements
- Confluence (OpenPeppol Member Area)

Since these can't be automated via API (they're human-readable announcements), the operational process is:

1. Subscribe to the Peppol Service Provider mailing list upon membership
2. Add a monthly calendar reminder to check the OpenPeppol Member Area for updates
3. For critical items (PKI migrations, protocol changes), document a runbook

The code component is a `check-openpeppol-alerts` command that opens the relevant URLs for manual review, paired with a calendar-based tracking system.

### CLI commands

```bash
# Check cert expiry
peppol-ap cert check
# Output: Cert POP000001 expires in 92 days. Status: OK

# List all certs with expiry dates
peppol-ap cert list

# Run all health checks (cert + OpenPeppol alerts reminder)
peppol-ap health check
```

### New files

| File | Purpose |
|------|---------|
| `src/monitoring/certificate-monitor.js` | Certificate expiry check logic |
| `src/monitoring/README.md` | Operational runbook for alert monitoring |

### Modified files

| File | Change |
|------|--------|
| `src/store/interfaces.js` | (none — uses existing `getActiveCert`) |
| `package.json` | Add `"cert:check": "node src/monitoring/certificate-monitor.js"` script |

### Scheduling

Add to the system crontab during deployment:

```
# Daily certificate expiry check at 08:00
0 8 * * * cd /opt/peppol-ap && node src/monitoring/certificate-monitor.js
```

## Acceptance criteria

- [ ] `peppol-ap cert check` returns current certificate status with days until expiry
- [ ] Status is correctly categorized: ok (>30), notice (14–30), warning (7–14), critical (1–7), expired (0)
- [ ] Expired certificate triggers an error log entry
- [ ] Certificate list shows all stored certs with their expiry dates
- [ ] Alerting works (log-based; configurable webhook for critical alerts)
- [ ] OpenPeppol alert monitoring process is documented in `src/monitoring/README.md`
- [ ] No new dependencies required (uses existing `@n42/edelivery` cert utilities)
