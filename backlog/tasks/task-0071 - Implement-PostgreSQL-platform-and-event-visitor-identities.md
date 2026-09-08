---
id: TASK-0071
title: Implement PostgreSQL platform and event visitor identities
status: In Progress
assignee:
  - '@Codex'
created_date: '2026-08-25 16:15'
updated_date: '2026-09-08 16:14'
labels:
  - postgresql
  - identity
  - event-visitor
  - platform-identity
dependencies: []
references:
  - docs/requirements/functional/fr/FR-073.md
  - docs/requirements/functional/fr/FR-079.md
  - docs/requirements/functional/fr/FR-001.md
  - docs/requirements/functional/fr/FR-060.md
  - docs/requirements/functional/fr/FR-062.md
  - backlog/handoffs/handoff-2026-08-25T16-12-59Z.md
  - docs/requirements/functional/fr/FR-081.md
  - docs/requirements/functional/fr/FR-082.md
  - docs/requirements/quality/qr/QR-014.md
  - docs/requirements/functional/fr/FR-083.md
  - docs/requirements/functional/fr/FR-084.md
  - docs/requirements/quality/qr/QR-006.md
  - backlog/handoffs/handoff-2026-08-25T21-03-31Z.md
  - backlog/handoffs/handoff-2026-09-08T16-09-03Z.md
documentation:
  - docs/terminology/glossary.md
  - server/docs/postgres-anonymous-event-compatibility.md
  - docs/design/architecture/adr/ADR-009.md
  - docs/design/architecture/adr/ADR-010.md
priority: high
type: feature
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the first PostgreSQL-only Platform Identity and Event Visitor Identity foundation. New PostgreSQL events establish opaque event-scoped visitor identities, private Event Visitor Control Credentials (EVCCs), and response ownership through Event Visitor Identities; authenticated visitors may associate those identities with a private Platform Identity. PostgreSQL responses use opaque response IDs and an explicit selected-response contract that supports multiple responses per visitor and blind availability. Preserve MongoDB persistence, credentials, request behavior, and data isolation without migration, mutation, or lookup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PostgreSQL stores Platform Identities and event-scoped Event Visitor Identities with internal UUID relations
- [ ] #2 A PostgreSQL Event Visitor Identity is opaque browser-local and retained independently from EVCCs and Platform Identity values
- [ ] #3 Authenticated PostgreSQL visitors associate Event Visitor Identities with private PostgreSQL Platform Identities without MongoDB queries or migration
- [ ] #4 PostgreSQL issues and validates private EVCC authority for every response owned by an Event Visitor Identity without exposing credential values to application JavaScript
- [ ] #5 PostgreSQL availability responses are owned by Event Visitor Identity relations and do not expose raw authentication subjects as response identifiers
- [ ] #6 One Event Visitor Identity can own multiple availability responses for an event and database integrity rejects an event and owner Event Visitor Identity mismatch
- [ ] #7 PostgreSQL response APIs use opaque response IDs and an explicit selection creation edit and deletion contract that supports multiple visitor-owned responses
- [ ] #8 PostgreSQL blind-availability reads expose a non-owner only authorized responses and no other-response counts while an owner can view all responses
- [ ] #9 MongoDB event and user persistence request behavior and guest credentials remain unchanged
- [ ] #10 Cross-device transfers matching-code approval and Granted EVCC issuance remain out of scope for this foundation
- [ ] #11 Repository route and frontend regression coverage verifies PostgreSQL identity behavior blind filtering and MongoDB non-regression
- [ ] #12 Relevant documentation reflects the delivered PostgreSQL identity boundary and deferred cross-device transfer behavior
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approved plan (2026-08-31)

Scope confirmed: foundation only. Transfers, Granted EVCC, matching codes, and revocation remain in TASK-0071.02. MongoDB persistence, request behavior, and credentials remain unchanged throughout.

### Decisions recorded

1. Owner binding: the foundation binds an owner Event Visitor Identity on PostgreSQL event creation for blind-availability visibility (AC #8). Event Owner Edit Token issuance and FR-018/FR-115/FR-116 owner-power enforcement are deferred to a follow-up task.
2. EVCC transport: HttpOnly, SameSite=Lax cookie. The credential value never reaches application JavaScript; the browser sends only the public eventVisitorId.
3. Full owner powers are tracked as a separate follow-up task dependent on this task.

### Delivery subtasks (dependency-chained)

1. Schema & repository — platform_identities, event_visitor_identities, event_visitor_credentials migration; responses gain event_visitor_identity_id with composite (event_id, event_visitor_identity_id) integrity and opaque public_id; backfill existing PG guest/account/name-keyed rows; server/postgres repository methods.
2. EVCC issuance & transport — crypto/rand credential stored hashed; HttpOnly SameSite=Lax cookie; constant-time validation; value never exposed to JavaScript.
3. Backend routes — creation returns eventVisitorId and binds owner EVI; fetch exposes public IDs with blind-availability filtering; response CRUD authorized via source EVCC or associated PVI session with an explicit selected-response contract supporting multiple responses per EVI; sign-in PVI association (FR-079).
4. Frontend integration — transport decode/encode for eventVisitorId and opaque response IDs; per-event localStorage eventVisitorId surviving sign-out (FR-073); selection keyed by publicId; sign-in association; Mongo guest flow untouched.
5. Verification & docs — PG+Mongo route suite via the compose.test.yaml overlay; frontend lint/typecheck/build/test:unit; new e2e regression spec; swagger regen and gen:api; postgres-anonymous-event-compatibility.md update; graphify update.

Subtask completion closes this task's acceptance criteria; this task remains the umbrella for review and final AC verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research completed before the review gate. PostgreSQL creation currently runs only for anonymous requests (`postgresCreationEnabled` rejects signed-in sessions), so creation must issue and return an unassociated Event Visitor Identity; the subsequent sign-in association flow attaches it to the private Platform Identity.

Current frontend response selection and analytics use `authUser._id` as a `responses` map key. PostgreSQL response UUID map keys require an explicit non-subject selected-response contract before implementation.

Confirmed seams: event-source dispatch is centralized in `server/routes/events.go`; all frontend requests pass through `frontend/src/utils/fetch_utils.ts`; event fetch/response decoding is `frontend/src/composables/event/eventTransportBoundary.ts`; event creation currently returns only `eventId`; OAuth sign-in payload is owned by `Auth.vue` and `UserService.ts`. `postgresResponseModel` currently calls the Mongo-dependent `populateResponsePayloadIdentity` and must be replaced for PostgreSQL. No runtime code changed.

The confirmed documentation model establishes source EVCC authority in this foundation. Matching-code transfers, Granted EVCC issuance, source revocation, and owner-role delegation remain deferred to TASK-0071.02.

Review gate satisfied 2026-08-31: user approved the revised plan and scope in session. Decisions confirmed: (1) foundation-only scope, cross-device transfers remain in TASK-0071.02; (2) the foundation binds an owner Event Visitor Identity on PostgreSQL events now, while Event Owner Edit Token issuance and FR-018/FR-115/FR-116 owner-power enforcement are deferred to a follow-up task; (3) EVCCs are delivered and validated exclusively through an HttpOnly, SameSite=Lax cookie so the credential value is never available to application JavaScript. Delivery is split into five dependency-chained subtasks under this task (schema/repository, EVCC issuance/transport, backend routes, frontend integration, verification/docs).

Research grounding for the approved plan: PG events are structurally ownerless today (owner_external_id never written, edits unauthenticated); PG responses carry per-response guest_id + guest_edit_token with one-response-per-guest unique indexes that contradict the multi-response-per-EVI contract; no EVI/PVI/EVCC code exists in backend or frontend. Confirmed seams: event-source dispatch centralized in server/routes/events.go, PG handlers in server/routes/postgres_event_routes.go, repository in server/postgres/, frontend transport in src/types/transport.ts with boundary composables eventTransportBoundary.ts and responseSubmissionBoundary.ts, guest credentials in scheduleOverlapStorage.ts, sign-in payload in Auth.vue and UserService.ts.

2026-09-08: User requested implementation of Platform Visitor Identities together with Event Visitor Identities. Resuming the approved foundation plan; transfers and owner-power enforcement remain deferred.

2026-09-08 handoff requested by user before completion. Implementation now spans schema/repository, EVCC cookies, PostgreSQL route ownership/filtering, sign-in association and frontend explicit response selection; detailed evidence and gaps are recorded on TASK-0071.04 through TASK-0071.08. All remain In Progress. No commit or deployment was performed by this session. Current worktree changes were observed staged at handoff time although this agent did not stage them; preserve that state. Existing backlog/backlog.md was already dirty at session start. Foundation not complete: real Firefox run, final checks, compatibility documentation, Swagger contract review and graph update remain.
<!-- SECTION:NOTES:END -->
