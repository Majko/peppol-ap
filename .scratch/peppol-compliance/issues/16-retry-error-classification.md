# 16 — Retry Logic: Distinguish Retryable from Non-Retryable Errors

**What to build:** The AS4 send path must distinguish between **retryable errors** (network timeout, 503 Service Unavailable, connection refused) and **non-retryable errors** (certificate expired, signature verification failed, invalid message format). Retrying non-retryable errors wastes resources and can cause cascading failures. Phase4 issue #325 exposed this problem: `TRANSPORT_ERROR` was used for both categories, forcing AP operators to retry errors that should never be retried.

After this ticket, the send path uses a typed error classification and only retries errors in the retryable category.

**Blocked by:** 01 (simulation regression baseline)

**Status:** ready-for-agent

- [ ] Typed error classification: `RetryableError` (network, 5xx, timeout) vs `NonRetryableError` (4xx, cert expired, signature failed, validation error)
- [ ] Send path only retries `RetryableError` instances
- [ ] `NonRetryableError` instances log a warning and surface to the caller immediately
- [ ] All AS4 error codes (EB:001 through EB:007) are classified as non-retryable
- [ ] Error classification is tested with a table-driven test covering all known error scenarios
- [ ] Simulation mode: same error classification applies (retry behaviour can be tested with simulated errors)
- [ ] Regression test from ticket 01 continues to pass
