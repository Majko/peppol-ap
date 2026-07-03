# Corrected mental model: 4-corner roles are direction-dependent, not fixed

The original lesson diagram incorrectly labelled Corner 1 as "SME (Buyer)" and Corner 4 as "Supplier (Seller)", implying fixed roles. In reality, corners describe document flow direction only:

- **C1** = document sender (whoever that is — SME, government, supplier)
- **C4** = document receiver (whoever that is)

The government typically appears as **C4** (receiving invoices from suppliers in B2G), but can also be **C1** when sending orders or contracts.

An SME using our AP can be either:
- **C1** (when they send invoices to their customers including government)
- **C4** (when their suppliers send invoices to them)

Our AP must handle both directions transparently.

## Evidence

User asked "where is government in the schema" after reading Lesson 1 — the original diagram was ambiguous. The explanation and table in the updated lesson resolves this.

## Implications

- Future lessons must always specify the document flow direction when discussing corners
- The AS4 engine must handle both sending (acting as C2) and receiving (acting as C3)
- When designing the SMP registration, we register the SME as capable of *receiving* certain document types (so other APs know to route to us)
