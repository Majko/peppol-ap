# Shifted focus: AP Core only, Service Platform deferred

After Lesson 4 (architecture), the user clarified that the Service Platform (React portal, multi-tenancy, PostgreSQL) is well-understood with their existing stack skills and will be handled in a separate project. All future lessons will focus exclusively on the **AP Core** — the certified Peppol transport layer.

## Implications

- No more lessons on Express routes, React components, or database schema design
- AP Core is the only code we build in this workspace
- The AP Core Interface + Validation Rules reference docs define the contract that the future Service Platform will use
- The Service Platform becomes "just another client" of the AP Core, not part of this learning track
- The 4-week timeline now applies specifically to: Node42 integration, AS4 send/receive, validation pipeline, certificate management, and Peppol Testbed readiness
