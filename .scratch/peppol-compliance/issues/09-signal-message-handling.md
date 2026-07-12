# 09 — AS4 Signal Message Handling

**What to build:** `handleIncomingMessage` must dispatch on AS4 message type. It currently drops `eb:SignalMessage` nodes entirely. After this ticket, the receive path handles `eb:SignalMessage/eb:Receipt` (ReceiptSignal) and `eb:SignalMessage/eb:Error` (ErrorSignal) as first-class message types.

This closes G17 (no AS4 signal message handling).

**Blocked by:** 02 (receive endpoint wired), 03 (MIME parser), 07 (error response generation for error signals)

**Status:** ready-for-agent

- [ ] `handleIncomingMessage` dispatches:
  - `eb:UserMessage` → existing invoice/creditnote handling (unchanged)
  - `eb:SignalMessage/eb:Receipt` → log ReceiptSignal, store transaction with status `receipt_received`
  - `eb:SignalMessage/eb:Error` → parse error, update transaction with status `error_received`, include ebMS error code
- [ ] ReceiptSignal: extract `eb:MessageId` from the receipt and match to a stored transaction
- [ ] ErrorSignal: extract ebMS error code and `eb:RefToMessageId`, update the matching transaction
- [ ] Unknown signal types are logged and ignored (no crash)
- [ ] Simulation mode: the send path can be tested by sending a mock ReceiptSignal back to the simulator
- [ ] Regression test from ticket 01 continues to pass
