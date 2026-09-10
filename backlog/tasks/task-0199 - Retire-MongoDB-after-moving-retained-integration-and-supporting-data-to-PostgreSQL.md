---
id: TASK-0199
title: >-
  Retire MongoDB after moving retained integration and supporting data to
  PostgreSQL
status: To Do
assignee: []
created_date: '2026-09-10 19:56'
labels:
  - postgresql
  - migration
dependencies: []
references:
  - TASK-0190
  - TASK-0190.08
  - server/docs/postgres-core-migration-contracts.md
  - server/docs/postgres-core-migration-runbook.md
  - server/db/init.go
documentation:
  - BACKLOG_WORKFLOW.md
  - docs/environments.md
priority: high
type: feature
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make PostgreSQL authoritative for the data TASK-0190 deliberately retained in MongoDB, then remove MongoDB entirely.

Move calendar connections, provider tokens, calendar preferences, and OAuth origin off the retained MongoDB `users` document and into PostgreSQL, encrypted at rest.
Move OTP challenges off `otpCodes`, and historical daily user logs off `dailyuserlogs`.
Retire the dormant `friendrequests` collection instead of migrating it.
Move event-creator analytics and active-user/num-users bot reporting onto PostgreSQL.
After the core-record cutover (TASK-0190.08) and the retained-data cutover both pass, delete the retained MongoDB account document, the MongoDB runtime and driver, Compose and environment configuration, and the collections.

Use one authoritative store per record and no permanent dual writes.
Preserve account identity and relationships through platform_identities.external_user_id while legacy source documents remain intact for rollback.
Implementation and isolated rehearsal are in scope; live deployments and production data migration are separately scheduled operational actions.
Preserve historical handoffs and completed task records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Linked subtasks deliver independently verified calendar, OTP, daily-log, analytics, friend-request-retirement, retained-document-retirement, and MongoDB-removal stages.
- [ ] #2 Calendar connections, encrypted credentials, sub-calendars, and preferences are served authoritatively from PostgreSQL with identity preserved through platform_identities.external_user_id.
- [ ] #3 OTP challenges and historical daily user logs are served authoritatively from PostgreSQL with their existing expiry, lockout, and timezone-bucketing semantics preserved.
- [ ] #4 Event-creator analytics and active-user/num-users reporting read PostgreSQL without double counting across stores.
- [ ] #5 MongoDB runtime, driver, configuration, and collections are removed only after the core-record cutover and retained-data cutover both pass, with rollback boundaries recorded.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
