---
id: TASK-0190
title: Move core event and account data from MongoDB to PostgreSQL
status: To Do
assignee: []
created_date: '2026-09-09 21:45'
labels:
  - postgresql
  - migration
dependencies: []
references:
  - TASK-0189
  - server/docs/postgres-anonymous-event-compatibility.md
  - server/db/init.go
  - backlog/backlog.md
documentation:
  - BACKLOG_WORKFLOW.md
  - docs/environments.md
priority: high
type: feature
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make PostgreSQL authoritative for existing and new accounts, identities, events, responses, and event organization through separately testable stages.
Include signed-in polls, signup forms, availability groups, folders, and historical data migration.
Temporarily retain calendar connections, provider tokens and calendar preferences, OTP challenges, friend requests, and historical daily user logs in MongoDB.
Retained integration documents must not remain a second account authority.
Preserve existing event links, account references, and access rights through explicit legacy-ID mappings.
Use one authoritative store per migrated record and avoid permanent dual writes.
Implementation and isolated rehearsal are in scope; live deployments and production data migration are separately scheduled operational actions.
Preserve historical handoffs and completed task records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Linked subtasks deliver independently verified account, event-type, organization, migration, default-routing, and cutover-readiness stages.
- [ ] #2 Existing and new core records can be served authoritatively from PostgreSQL with old links and identity references preserved.
- [ ] #3 Retained MongoDB integrations continue to work through explicit identity mappings without acting as a second source of account truth.
- [ ] #4 Both anonymous-creation flags are removed after migration rehearsal and browser fixture readiness.
- [ ] #5 A tested migration and backup/restore runbook records reconciliation evidence, handling of ambiguous records, and rollback boundaries.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
