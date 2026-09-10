---
id: TASK-0189
title: Preserve browser owner authority in PostgreSQL editing E2E fixtures
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-09 17:33'
updated_date: '2026-09-09 22:31'
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
modified_files:
  - e2e/AGENTS.md
  - e2e/helpers/timed-event-helpers.ts
  - e2e/specs/timed-event-date-added-header-layout-firefox.spec.ts
  - e2e/specs/timed-event-days-only-timezone-firefox.spec.ts
  - e2e/specs/timed-event-reprojection-firefox.spec.ts
  - e2e/specs/timed-event-specific-times-edit-firefox.spec.ts
  - e2e/specs/timed-event-time-format-toggle-alignment-firefox.spec.ts
  - e2e/specs/timed-event-utc4-edit-firefox.spec.ts
  - e2e/specs/timed-event-viewer-tz-column-duplication-firefox.spec.ts
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
- [x] #1 Affected API-seeded editing journeys open the event with valid owner authority in the browser when PostgreSQL anonymous event creation is enabled.
- [x] #2 All seven previously failing editing specs complete their original editing and persistence assertions with PostgreSQL creation enabled without weakening owner authorization or bypassing the edit control.
- [x] #3 The full Firefox project passes its enabled tests in both default creation mode and PostgreSQL anonymous creation mode with mode-dependent skips and results recorded.
- [x] #4 PostgreSQL owner-authority browser coverage continues to reject owner actions for non-owner browsers and base visitor credentials.
- [x] #5 E2E fixture guidance documents the browser credential-sharing requirement for API-seeded owner journeys.
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
1. Reproduce the date-added-header PostgreSQL failure in the owned isolated Firefox stack and inspect the missing edit control.
2. Seed the seven affected editing specs through the page-associated API request context so creation cookies reach the browser; preserve independent read/visitor contexts and all original editing assertions.
3. Document cookie-sharing requirements at the shared seed helper and in e2e/AGENTS.md.
4. Re-run the isolated regression, then the full Firefox project in default and PostgreSQL creation modes sequentially, including existing owner-authority denial coverage.
5. Run E2E lint, formatting and type checks, applicable unit checks, Markdown formatting, and graphify update; record objective results and finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the date-added-header failure before editing: the event rendered without an edit control because standalone request creation cookies did not reach the browser (2026-09-09T21-47-09.284770996Z-p865121). Switching the seed to page.request made the isolated regression pass.

Full default Firefox verification: E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=false npm run test:e2e -- --project=firefox-desktop — 28 passed, 14 skipped, 6.8m; artifacts /tmp/opencode/timeful-e2e-artifacts/2026-09-09T22-12-53.740163086Z-p983262/. Skips: eight PostgreSQL transfer tests, two owner-authority tests, one PostgreSQL plugin test, two visitor-identity tests, and the existing signup-layout skip.

Full PostgreSQL Firefox verification: E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true npm run test:e2e -- --project=firefox-desktop — 41 passed, 1 skipped, 7.4m; artifacts /tmp/opencode/timeful-e2e-artifacts/2026-09-09T22-22-46.234056885Z-p1027051/. Only the existing signup-layout test is skipped. All seven affected specs retain and pass their editing assertions; owner-authority coverage rejects base visitor credentials and non-owner requests.

Earlier PostgreSQL full runs encountered guest-transfer and dialog timing failures; both passed isolated. Another run exceeded the shell's 600-second timeout under high host load, and a later run was user-aborted. The aborted run left test Vite on 4174; identified and terminated only that orphan process tree before the final passing run. No test timeouts, authorization behavior, or assertions were relaxed.

Checks passed: e2e npm run lint, npm run fmt:check, npm run typecheck; frontend npm run lint, npm run fmt:check, npm run typecheck, and npm run test:unit (145 files / 1067 tests). Frontend build passed as part of Playwright's owned webServer command (npm run build && npm run dev:test). Root npm run format:markdown passed; the script rejects extra path arguments, so it was run without arguments. graphify update . completed; it reported four zero-node JSON sources and community-label drift.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated API-seeded owner journeys in all seven affected Firefox specs to create events through page.request, preserving server-issued HttpOnly owner cookies in the editing browser.
Documented the shared-cookie requirement in the seed helper and e2e/AGENTS.md while retaining independent visitor/read contexts and all existing editing and persistence assertions.

Verification: full default Firefox project 28 passed / 14 skipped; full PostgreSQL Firefox project 41 passed / 1 skipped, including owner-action denial coverage.
E2E lint/format/typecheck, frontend lint/format/typecheck/build, all 1067 frontend unit tests, and Markdown formatting passed.
Graphify AST update completed.
<!-- SECTION:FINAL_SUMMARY:END -->
