# Peppol Service Provider Resources

## Knowledge

- [OpenPeppol — Learn More / Interoperability Framework](https://peppol.org/learn-more/peppol-interoperability-framework/)
  Core overview of the Peppol Network: the legal agreements, architectural framework, and BIS specifications. Start here for the big picture.
- [Peppol eDelivery Network Conceptual Architecture (OpenPeppol Knowledge Base)](https://openpeppol.atlassian.net/wiki/spaces/PKB/pages/4717805586/Peppol+eDelivery+Network+Conceptual+Architecture)
  Deep dive into the 4-corner model, SML/SMP discovery, and AS4 messaging. Essential for understanding the transport layer.
- [How to set up a Post-Award Peppol Access Point (v2.1, OpenPeppol PDF)](https://peppol.org/wp-content/uploads/2024/04/how_to_set-up_a__post-award__peppol_access_point_v2.1.pdf)
  Step-by-step guide from OpenPeppol on becoming a certified AP provider. Covers membership, SPA, PKI certificates, testbed, and production.
- [Slovak Peppol Authority — Accreditation Instructions (PDF)](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Podnikatelia/Dan_z_pridanej_hodnoty/efaktura/2026/2026.04.17_detailed_step_by_step.pdf)
  Official Slovak Republic procedure for accrediting service providers. Mandatory reading for operating in Slovakia.
- [Peppol AS4 Profile Specification](https://docs.peppol.eu/edelivery/as4/specification/)
  The technical spec for AS4 messaging in Peppol. Reference when implementing the transport layer.
- [Peppol BIS Billing 3.0 — Specification](https://docs.peppol.eu/poacc/billing/3.0/)
  The current mandatory BIS for invoicing. Defines the UBL XML structure, Schematron rules, and code lists. The core document standard to implement.
- [Peppol BIS Billing 3.0 — UBL Invoice Syntax](https://docs.peppol.eu/poacc/billing/3.0/syntax/ubl-invoice/)
  The actual UBL XML tree for invoices. Reference when generating or parsing invoice XML.
- [eInvoicing in Slovakia — EU Digital Building Blocks](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108899/eInvoicing+in+Slovakia)
  Country sheet with legal mandate details, timelines, and operating model. Verified by the European Commission.
- [Slovakia Country Profile — OpenPeppol](https://peppol.org/learn-more/country-profiles/slovakia/)
  Official OpenPeppol page for Slovak Peppol Authority contacts and national specifics.
- [Peppol Validator](https://peppolvalidator.com/peppol-network)
  Third-party explainer of the 4-corner model and AP mechanics. Good for visualising the flow.

## Wisdom (Communities)

- [OpenPeppol eDelivery Domain Community](https://peppol.org/communities/edelivery-domain-community/)
  Mandatory community for all service providers. Best place to ask technical questions and get implementation advice from other AP operators.
- OpenPeppol membership — includes access to member mailing lists, webinars, and working groups.
- [Peppol Service Desk](https://OpenPeppol.atlassian.net/servicedesk/customer/portal/1)
  For PKI certificate requests and testbed support.
- Slovak Peppol Authority: `peppol@financnasprava.sk`
  Direct contact for accreditation questions specific to Slovakia.

## Gaps

- No good single resource on building a Peppol AP in Node.js specifically. Most reference implementations are in Java or .NET. This gap is what the lessons will fill.
- Slovak PASR (Peppol Authority Specific Requirements) full document not yet publicly available in English — only the accreditation procedure PDF is published as of Q2 2026.
