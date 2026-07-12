# 13 — CRL/OCSP Failure Mode: Soft-Fail with Circuit Breaker

**What to build:** Certificate revocation checks (CRL and OCSP) must use a **soft-fail** strategy: if the CRL server is unreachable or OCSP responder times out, the certificate is treated as valid rather than revoked. A hard-fail on network timeout caused a production AP outage (phase4 #354 — all certificates reported revoked after a 5s CRL timeout).

Additionally, implement a **circuit breaker** per CRL/OCSP endpoint: after 3 consecutive failures to reach an endpoint, open the circuit and skip revocation checks for that endpoint for a cooldown period (5 minutes).

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] CRL/OCSP checks use soft-fail: network timeout or HTTP error returns a "revocation check unavailable" result, NOT "certificate is revoked"
- [ ] Circuit breaker: after 3 consecutive CRL/OCSP failures for a given endpoint, skip checks for that endpoint for 5 minutes
- [ ] Circuit breaker state is logged: "circuit open for CRL endpoint X — skipping revocation checks"
- [ ] When circuit recloses (cooldown expires), a success or failure updates the circuit state appropriately
- [ ] Simulation mode: revocation checks are skipped entirely (or use a mock that returns "check unavailable")
- [ ] Regression test from ticket 01 continues to pass
