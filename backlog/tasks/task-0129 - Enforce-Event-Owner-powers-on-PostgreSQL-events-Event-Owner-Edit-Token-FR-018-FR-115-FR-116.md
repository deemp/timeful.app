---
id: TASK-0129
title: >-
  Enforce Event Owner powers on PostgreSQL events (Event Owner Edit Token,
  FR-018/FR-115/FR-116)
status: In Progress
assignee:
  - Codex
created_date: '2026-09-01 19:03'
updated_date: '2026-09-08 22:06'
labels:
  - postgresql
  - identity
  - backend
  - authorization
dependencies:
  - TASK-0071
references:
  - docs/requirements/functional/fr/FR-018.md
  - docs/requirements/functional/fr/FR-063.md
  - docs/requirements/functional/fr/FR-083.md
  - docs/requirements/functional/fr/FR-115.md
  - docs/requirements/functional/fr/FR-116.md
  - docs/requirements/quality/qr/QR-003.md
  - backlog/handoffs/handoff-2026-09-08T21-47-02Z.md
documentation:
  - docs/design/architecture/adr/ADR-010.md
  - docs/terminology/glossary.md
  - server/docs/postgres-anonymous-event-compatibility.md
modified_files:
  - server/routes/postgres_event_routes.go
  - server/postgres/repository.go
  - server/errs/errors.go
priority: high
type: feature
ordinal: 142300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the PostgreSQL Event Owner authorization foundation on TASK-0071. Issue and validate the PostgreSQL-only Event Owner Edit Token, authorize Event Settings edits and archive/delete via that token or the associated Platform Visitor Identity, and provide a distinct owner-grant authorization foundation for future Granted EVCC issuance. Base EVCCs never grant these powers. Ownership association and takeover follow FR-063. User confirmed transfer integration is postponed; source-confirmed issuance, transfer UI, and end-to-end Granted EVCC integration remain in TASK-0071.02. MongoDB owner authorization remains legacy and unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PostgreSQL events issue an Event Owner Edit Token to the creating owner as a PostgreSQL-only credential per FR-018 and the glossary
- [ ] #2 Event Settings edits on PostgreSQL events authorize through the Event Owner Edit Token or the associated Platform Visitor Identity; the authorization foundation distinguishes future owner-issued Granted EVCCs from base EVCCs, which never authorize settings edits
- [ ] #3 PostgreSQL event archive/unarchive and deletion use the same owner authorization foundation; archived events reject settings and response mutations and deleted events stop resolving
- [ ] #4 Proving a valid Event Owner Edit Token with a different Platform Visitor Identity moves event ownership to the proving identity and the previously associated identity loses Event Settings authority, without transferring response ownership
- [ ] #5 MongoDB event-settings authorization remains legacy and unchanged
- [ ] #6 Route and frontend regression coverage verifies the owner authorization foundation, including rejection of base-EVCC and unauthorized anonymous attempts; transfer issuance and end-to-end transfer integration remain deferred to TASK-0071.02
- [ ] #7 Swagger annotations regenerated and npm run gen:api run from frontend/ where annotations changed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add PostgreSQL owner-token hash and separate ownership-to-Platform Visitor Identity association, plus explicit credential kind/owner-grant metadata for future Granted EVCC validation.
2. Issue an HttpOnly owner-token cookie at creation; centralize owner authorization and transactional takeover separately from response ownership; enforce settings/archive/delete and archived read-only behavior while preserving MongoDB dispatch guards.
3. Expose server-proven owner capabilities through the frontend transport boundary and use them for read-only settings and owner actions.
4. Add route/repository, frontend unit, and isolated Firefox regression coverage; regenerate API artifacts, run required checks, update compatibility documentation and graph.
5. Record completion evidence for the approved foundation scope; leave transfer issuance and integration in TASK-0071.02.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-0071 is Done; TASK-0071.02 remains To Do and no Granted EVCC issuance has been delivered. Requested user direction on implementing TASK-0129 with transfer integration pending versus including TASK-0071.02. Initial worktree contains an existing backlog/backlog.md modification and two untracked handoffs; preserve these.

Implementation audit: postgresCreateEvent binds the owner Event Visitor Identity and issues only a base EVCC; postgresEditEvent currently has no owner authorization. PostgreSQL archive/delete dispatch to postgresEventRouteUnavailable behind the shared AuthRequired middleware, so anonymous owner support requires storage-specific authorization while retaining MongoDB's guard. Event Visitor Identity association deliberately refuses reassignment; FR-063 ownership takeover therefore needs a separate event-to-Platform Visitor Identity association rather than reassigning response ownership. Frontend eventOwnership.ts currently permits metadata edits for anonymous ownerId values, including PostgreSQL's zero ownerId; it needs explicit server-proven owner capabilities. No runtime files changed pending the dependency/scope decision.

User confirmed: postpone transfer integration and implement just its foundation. Acceptance criteria narrowed accordingly without changing canonical product requirements.

User requested a handoff before completion: backlog/handoffs/handoff-2026-09-08T21-47-02Z.md. Foundation implementation and generated APIs are present; transfer issuance/integration remains deferred per user direction. Backend route tests pass, migration backfill regression passes after correcting its fixture ID, and frontend lint/fmt/typecheck plus all 1043 unit tests pass. New Firefox spec has not executed: configured webServer failed startup with exit code 1. Build/browser diagnosis, compatibility documentation, graph update, and final acceptance verification remain. Most changes were observed staged externally; preserve index and worktree. No commit or deployment performed.

Resumed from the 2026-09-08T21-47-02Z handoff. Standalone production build passes. Diagnosed browser startup failure as sandbox listen EPERM on 127.0.0.1:4174; rerun outside the sandbox passes both new Firefox owner-authority tests (2/2). E2E lint, formatting, and typecheck pass. Updated compatibility documentation for delivered owner authority, unrecoverable older anonymous owner tokens, and the deferred TASK-0071.02 transfer boundary; removed the unused validPostgresCredential wrapper. Existing identity/plugin browser regressions and final backend verification are in progress.
<!-- SECTION:NOTES:END -->
