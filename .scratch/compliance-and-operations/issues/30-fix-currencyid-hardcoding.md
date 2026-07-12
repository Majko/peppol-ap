# 30 — Fix currencyID hardcoding — use document currency on all monetary elements

**What to build:** All `currencyID` attributes on monetary amounts in `src/ubl/generator.js` currently hardcode `EUR` regardless of the document's actual currency. Fix them to use the document's `currencyCode`.

**Status:** ready-for-agent

- [ ] `buildVAT()` uses `data.currencyCode` instead of hardcoded `"EUR"` on `cbc:TaxAmount` and `cbc:TaxableAmount`
- [ ] `buildMonetaryTotal()` uses `data.currencyCode` instead of hardcoded `"EUR"` on all `cbc:*Amount` elements
- [ ] `buildLines()` uses `data.currencyCode` instead of hardcoded `"EUR"` on `cbc:InvoicedQuantity`, `cbc:LineExtensionAmount`, and `cbc:PriceAmount`
- [ ] Add a unit test that generates an invoice with `currencyCode: "CZK"` and asserts all monetary `currencyID` attributes are `"CZK"`, not `"EUR"`
- [ ] Existing EUR invoice fixture still generates with `currencyID="EUR"`
- [ ] Simulation regression test continues to pass
