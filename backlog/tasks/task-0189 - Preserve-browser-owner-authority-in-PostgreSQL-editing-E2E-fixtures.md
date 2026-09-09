---
id: TASK-0189
title: Preserve browser owner authority in PostgreSQL editing E2E fixtures
status: To Do
assignee: []
created_date: '2026-09-09 17:33'
labels:
  - e2e
  - postgresql
dependencies: []
references:
  - >-
    backlog/tasks/task-0188.02 -
    Restore-target-transfer-flow-after-reload-and-cache-grant-association-consent.md
  - e2e/helpers/timed-event-helpers.ts
  - e2e/specs/timed-event-date-added-header-layout-firefox.spec.ts
  - e2e/specs/timed-event-days-only-timezone-firefox.spec.ts
  - e2e/specs/timed-event-reprojection-firefox.spec.ts
  - e2e/specs/timed-event-specific-times-edit-firefox.spec.ts
  - e2e/specs/timed-event-time-format-toggle-alignment-firefox.spec.ts
  - e2e/specs/timed-event-utc4-edit-firefox.spec.ts
  - e2e/specs/timed-event-viewer-tz-column-duplication-firefox.spec.ts
  - e2e/specs/timed-event-owner-authority-firefox.spec.ts
  - /tmp/opencode/timeful-e2e-artifacts/2026-09-09T17-14-49.736212891Z-p235265/
  - /tmp/opencode/timeful-e2e-artifacts/2026-09-09T16-57-54.554927979Z-p177359/
documentation:
  - e2e/AGENTS.md
  - server/docs/postgres-anonymous-event-compatibility.md
priority: medium
type: bug
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the broader Firefox editing regressions exercise authorized event editing with PostgreSQL anonymous event creation enabled, while retaining default-mode coverage.
During TASK-0188.02 validation, seven specs failed waiting for the edit control: date-added headers, days-only timezone, reprojection, specific-times editing, time-format toggle alignment, UTC+4 editing, and viewer-timezone edit columns.
The date-added-header failure reproduced in isolation: its standalone Playwright request fixture receives creation credentials that are not shared with the page context, so the browser lacks owner authority and the edit control is correctly absent.
The full default-mode Firefox suite passed with 28 passed and 13 skipped; the PostgreSQL transfer-only suite passed all seven tests.
This follow-up covers the browser test fixtures and affected editing journeys, preserving server-enforced owner authorization and the original editing assertions.
Use Playwright's owned isolated test stack on API port 3003 and Vite port 4174, with E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true for PostgreSQL verification.
Retained diagnostic artifacts are referenced below; the task must remain understandable if temporary artifacts are no longer available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Affected API-seeded editing journeys open the event with valid owner authority in the browser when PostgreSQL anonymous event creation is enabled.
- [ ] #2 All seven previously failing editing specs complete their original editing and persistence assertions with PostgreSQL creation enabled without weakening owner authorization or bypassing the edit control.
- [ ] #3 The full Firefox project passes its enabled tests in both default creation mode and PostgreSQL anonymous creation mode with mode-dependent skips and results recorded.
- [ ] #4 PostgreSQL owner-authority browser coverage continues to reject owner actions for non-owner browsers and base visitor credentials.
- [ ] #5 E2E fixture guidance documents the browser credential-sharing requirement for API-seeded owner journeys.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
