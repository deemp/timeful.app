# Design Records

This directory is the canonical record of durable Timeful design decisions.
Design records describe architectural choices that constrain implementation, while requirements specify outcomes.

## Layout

- `architecture/README.md` contains architecture-decision-record authoring
  guidance.
- `architecture/adr/` contains architecture decision records (ADRs).
- Future design-record categories belong in their own subdirectory and are
  indexed here.

## Related Artifacts

- Functional requirements (FRs) state required system behavior.
- Quality requirements (QRs) state required quality attributes or runtime
  constraints.
- Specifications (SPECs) describe a feature or domain in broader context and
  may link to multiple requirements.
- Architecture decision records (ADRs) record architectural decisions.
- ADRs may link to the FRs and QRs that they enable, constrain, or satisfy.
  FRs and QRs remain self-contained specifications and must not cite ADRs as
  normative dependencies.
  Requirement provenance is recorded separately from
  the requirement statement.
- Backlog tasks track work to investigate, implement, or verify requirements.

## Architecture Records

| ID                                     | Scope                   | Title                                                                          |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| [ADR-001](architecture/adr/ADR-001.md) | Frontend                | Frontend Boundary Models and Canonical Internal Shapes                         |
| [ADR-002](architecture/adr/ADR-002.md) | Frontend                | Frontend Timezone Decoding and Fixed-Offset Boundaries                         |
| [ADR-003](architecture/adr/ADR-003.md) | Frontend                | Frontend Freemium Operational Gating                                           |
| [ADR-004](architecture/adr/ADR-004.md) | Frontend                | Frontend Temporal Runtime Model                                                |
| [ADR-005](architecture/adr/ADR-005.md) | Frontend                | Frontend Civil-Date and End-of-Day Model                                       |
| [ADR-006](architecture/adr/ADR-006.md) | Frontend                | Frontend Temporal Collection Semantics                                         |
| [ADR-007](architecture/adr/ADR-007.md) | Frontend                | Frontend Semantic Styling Tokens                                               |
| [ADR-008](architecture/adr/ADR-008.md) | Frontend                | Frontend Event Ownership Semantics                                             |
| [ADR-009](architecture/adr/ADR-009.md) | Frontend                | Frontend Guest Response Ownership Semantics                                    |
| [ADR-010](architecture/adr/ADR-010.md) | Frontend, Backend       | Source-Confirmed Access Transfers                                              |
| [ADR-011](architecture/adr/ADR-011.md) | Backend, Infrastructure | PostgreSQL Owns Core Records While MongoDB Retains Integrations                |
| [ADR-012](architecture/adr/ADR-012.md) | Backend, Infrastructure | Resolve Legacy Accounts By external_user_id And Rewrite Migrated Relationships |
| [ADR-013](architecture/adr/ADR-013.md) | Backend, Infrastructure | Cut Over By Resumable Backfill With A Short Write Freeze                       |
| [ADR-014](architecture/adr/ADR-014.md) | Backend, Infrastructure | Quarantine Legacy Guest Credentials And Ambiguous Ownership                    |
