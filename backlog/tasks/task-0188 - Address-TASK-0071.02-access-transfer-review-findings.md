---
id: TASK-0188
title: Address TASK-0071.02 access-transfer review findings
status: To Do
assignee: []
created_date: '2026-09-09 12:49'
labels: []
dependencies: []
references:
  - docs/design/architecture/adr/ADR-010.md
  - server/docs/postgres-anonymous-event-compatibility.md
  - server/routes/postgres_transfers.go
  - frontend/src/composables/transfer/transferBoundary.ts
modified_files:
  - server/migrations/20260909110000_access_transfers.sql
  - server/postgres/transfers.go
  - server/routes/postgres_transfers.go
  - server/routes/postgres_transfers_test.go
  - frontend/src/components/event/EventAccessTransfer.vue
  - frontend/src/components/event/GrantedAccessConfirmation.vue
  - frontend/src/composables/transfer/transferBoundary.ts
  - frontend/src/views/AccessTransfer.vue
priority: high
type: task
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A post-completion review of TASK-0071.02 (commit b34a4b70) identified lifecycle, consent, storage, schema, and polish issues in the source-confirmed cross-device transfer flow. Fix them without changing approved semantics: approval stays single-use and source-confirmed, the five-minute window and matching-code process stay as specified, Granted EVCC powers stay unchanged, and MongoDB behavior and credentials remain untouched. Deliver as subtasks: server lifecycle and schema hardening, target and consent flow fixes, and source-dialog hygiene with UI polish.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A target browser that reloads a transfer link after source approval but before redemption can still complete redemption within the transfer window
- [ ] #2 A source can cancel an approved-but-unredeemed transfer and a cancelled transfer rejects subsequent approval and redemption
- [ ] #3 Redeeming a session transfer over an existing different sign-in requires explicit target confirmation and redemption replaces only the session identity
- [ ] #4 Saved-transfer storage, status polling, and grant-association inspection scale with active grants and events needing consent, not with accumulated history
- [ ] #5 Expired transfer rows are pruned automatically and approved_request_id integrity is enforced by schema
- [ ] #6 Transfer and grant cookie attributes match the base EVCC cookie or their difference is documented
- [ ] #7 Transfer state and errors are presented in user-facing language that names the failed action
- [ ] #8 Regression coverage exists for open-after-approval, cancel-after-approval, storage pruning, and consent caching
- [ ] #9 MongoDB persistence, request behavior, and credentials remain unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
