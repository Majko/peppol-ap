# 36 — Add replay protection — reject duplicate MessageId on receive

**What to build:** `src/index.js` `handleIncomingMessage()` does not check whether the incoming `eb:MessageId` has already been processed. Add deduplication using the transaction store.

**Status:** ready-for-agent

- [ ] In `handleIncomingMessage()`, before processing, call `transactionStore.get(messageId)`
- [ ] If a record exists with any status (`received`, `receipt_sent`, `error`), throw `new NonRetryableError('Duplicate message')` with ebMS code EB:001 — the message has already been seen
- [ ] If `transactionStore.get(messageId)` returns null, proceed with normal processing and save the new transaction with `received` status
- [ ] If the transaction store throws an error during the check, do not block — log the error and proceed with processing (store unavailability is not a message rejection reason)
- [ ] Add a unit test: call `handleIncomingMessage` twice with the same messageId → second call throws `NonRetryableError`
- [ ] Add a unit test: call with a new messageId → succeeds and stores the transaction
- [ ] Simulation regression test continues to pass
