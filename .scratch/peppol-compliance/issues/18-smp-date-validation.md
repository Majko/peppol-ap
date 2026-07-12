# 18 — SMP ServiceActivationDate / ServiceExpirationDate Validation

**What to build:** SMP lookup responses include `ServiceActivationDate` and `ServiceExpirationDate` fields. These are currently ignored (peppol-commons #38). When a participant's SMP entry has expired, the AP should refuse to send — not attempt delivery to an expired endpoint. Implement validation of these date fields after SMP lookup.

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] After SMP lookup, check `ServiceActivationDate`: if the current date is before this date, refuse to send and log a warning
- [ ] After SMP lookup, check `ServiceExpirationDate`: if the current date is after this date, refuse to send and log a warning
- [ ] The send path returns a typed `NonRetryableError` (from ticket 16) when the participant's SMP entry is not yet active or has expired
- [ ] Error message includes which date failed and the actual date value
- [ ] Simulation mode: simulation participants have `ServiceActivationDate` in the past and `ServiceExpirationDate` far in the future, so they always pass
- [ ] Regression test from ticket 01 continues to pass
