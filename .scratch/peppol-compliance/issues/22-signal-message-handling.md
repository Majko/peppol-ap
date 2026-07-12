# 22 — AS4: Signal Message Dispatch (SPEC GAP)

**What to build:** `handleIncomingMessage` in `src/index.js` does not dispatch on message type. All incoming messages go through the invoice/validation path. PRD 0004 §A6 requires:

- `eb:SignalMessage/eb:Receipt` → log and store (ReceiptSignal)
- `eb:SignalMessage/eb:Error` → parse error, update transaction status (ErrorSignal)

**Status:** ready-for-agent

- [ ] After parsing the AS4 message in `handleIncomingMessage`, inspect the SOAP body for `eb:SignalMessage` (not `eb:UserMessage`).
- [ ] `eb:SignalMessage/eb:Receipt`: log the receipt, update the corresponding transaction status to `receipt_received` (or similar), store the receipt XML. Do NOT try to validate it as a UBL invoice.
- [ ] `eb:SignalMessage/eb:Error`: extract `eb:Error` details (code, message, short description), update the corresponding transaction status to `error`, store error details. Map ebMS 3.0 error codes to internal error codes.
- [ ] `eb:UserMessage`: existing invoice/creditnote handling (unchanged).
- [ ] If the signal references a message ID not in the transaction store, log a warning but don't throw.
- [ ] Simulation mode: same dispatch logic applies.
- [ ] Regression test from ticket 01 continues to pass.

**Reference:** PRD 0004 §A6, ticket 09.
