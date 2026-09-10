---
id: TASK-0197
title: Address TASK-0071.02 access-transfer review findings
status: Done
assignee:
  - Codex
created_date: '2026-09-09 12:49'
updated_date: '2026-09-09 21:30'
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
- [x] #1 A target browser that reloads a transfer link after source approval but before redemption can still complete redemption within the transfer window
- [x] #2 A source can cancel an approved-but-unredeemed transfer and a cancelled transfer rejects subsequent approval and redemption
- [x] #3 Redeeming a session transfer over an existing different sign-in requires explicit target confirmation and redemption replaces only the session identity
- [x] #4 Saved-transfer storage, status polling, and grant-association inspection scale with active grants and events needing consent, not with accumulated history
- [x] #5 Expired transfer rows are pruned automatically and approved_request_id integrity is enforced by schema
- [x] #6 Transfer and grant cookie attributes match the base EVCC cookie or their difference is documented
- [x] #7 Transfer state and errors are presented in user-facing language that names the failed action
- [x] #8 Regression coverage exists for open-after-approval, cancel-after-approval, storage pruning, and consent caching
- [x] #9 MongoDB persistence, request behavior, and credentials remain unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [x] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the completed subtasks and commits cover every parent acceptance criterion and preserve the approved transfer semantics.
2. Inspect the combined implementation and regression coverage, using the completed subtasks' recorded full validation where code is unchanged.
3. Run focused transfer regressions and Markdown formatting, consolidate acceptance evidence, and mark the umbrella task Done if no gaps remain.

Parent AC #2 audit found Cancel transfer is nested under pending-only source controls, so approved transfers cannot be cancelled through the UI. Add a failing component regression, expose cancellation for pending/approved states, and run all frontend checks plus isolated Firefox transfer coverage.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All three implementation subtasks are Done in commits 63eae4e4, 72877d74, and 6c560940. Remaining source-dialog cancellation gap is within parent AC #2; completed subtask records remain unchanged.

Parent audit acceptance mapping: AC #1 is covered by approved-open target-proof checks in postgres_transfers.go, AccessTransfer.vue restoration, and reload browser/unit regressions; AC #2 by server pending/approved cancellation and rejection matrix plus this session's source-dialog fix and regression; AC #3 by the non-consuming 409 confirmation gate and session.Set-only redemption; AC #4 by terminal-handle pruning, deduplicated active polling, stable numbering, and once-per-event-per-sign-in inspection caching; AC #5 by automatic create-time pruning with cascading requests and the approved-request foreign key (redeemed revocation anchors intentionally retained); AC #6 by shared Lax/HttpOnly/path/Secure cookie attributes; AC #7 by friendly source states/action-specific failures and target error styling; AC #8 by route, boundary, component, and browser tests; AC #9 by the combined diff leaving MongoDB implementation and credentials untouched.

New cancellation component regression failed before the UI fix because Cancel transfer was absent after approval, then passed. Current full frontend checks passed: lint, fmt:check, typecheck, build, and 145 unit files / 1,067 tests. E2E lint, fmt:check, and typecheck passed. Markdown formatting completed; graphify update completed after sandbox EPERM retry (5,058 nodes / 8,324 edges). Isolated Firefox transfer suite is running outside the sandbox after the sandboxed web server could not start.

Final isolated PostgreSQL-enabled Firefox transfer suite passed 8/8 in 2.5 minutes, including the new source UI cancellation after approval and target redemption rejection.
The successful run logged transient Vite optimized-dependency missing-file messages but all journeys completed without retries.
Log: /tmp/task0188-e2e-retry.log.
No backend changes were needed in this continuation; server route/package validation remains the passing evidence recorded in TASK-0188.01 and TASK-0188.02.
The broader PostgreSQL editing-fixture issue is already tracked separately in TASK-0189.
Final git diff HEAD --check passed.
No commit was created.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the umbrella review of TASK-0188.01, TASK-0188.02, and TASK-0188.03 and verified all nine acceptance criteria.
Closed the remaining source UI gap: Cancel transfer now remains available after approval until redemption, with component and Firefox regressions proving cancellation and blocked target redemption.
Existing subtask implementations provide target reload recovery, explicit account-switch consent, session-key preservation, active-transfer storage/polling, consent caching, pruning, schema integrity, matching cookie attributes, and action-specific feedback.
MongoDB implementation and credentials remain unchanged.

Validation: all required frontend checks passed, including 145 unit files and 1,067 tests; E2E lint, formatting, typecheck, and all 8 isolated PostgreSQL-enabled Firefox transfer tests passed.
Markdown formatting and graph refresh completed.
Prior passing server validation is recorded in the completed subtasks.
Changes are uncommitted.
<!-- SECTION:FINAL_SUMMARY:END -->
