---
id: TASK-0194
title: Stabilize flaky timed-event-visitor-identities-firefox desktop Save flow
status: To Do
assignee: []
created_date: '2026-09-10 08:10'
labels:
  - e2e
  - playwright
  - flaky-test
dependencies: []
references:
  - backlog/tasks/task-0193 - Run-the-Firefox-E2E-projects-in-E2E-CI.md
documentation:
  - e2e/specs/timed-event-visitor-identities-firefox.spec.ts
  - e2e/AGENTS.md
priority: medium
type: bug
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When TASK-0193 enabled the full firefox-desktop project in E2E CI, repeated local runs (CI=true, workers:1) showed `timed-event-visitor-identities-firefox.spec.ts:8` ("Event Visitor Identity survives reload and edits two independently selected responses") failing on the first attempt and passing on retry #1. CI's retries:2 currently hides this, so it does not block CI, but it is real test instability that can mask genuine regressions.

Observed failure (2026-09-10, isolated test stack):
- `TimeoutError: page.waitForRequest: Timeout 15000ms exceeded while waiting for event "request"` at `e2e/specs/timed-event-visitor-identities-firefox.spec.ts:80`, followed by `locator.click: Timeout 15000ms exceeded` where the desktop Save button resolved to `<button disabled ...>` and never became enabled.
- The next attempt passed in 13.9s.

Goal: make the spec deterministic. A future worker should reproduce the flake locally, trace why the Save button stays disabled after clicking Edit for the seeded guest response (for example an editor-readiness or response-load race), and fix the cause per the e2e authoring rules (no fixed sleeps or blind timeout increases). If the root cause proves to be an application defect rather than test timing, fix that behavior instead.

Evidence/context:
- Reproduce: `cd e2e && CI=true E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true E2E_ARTIFACTS_DIR=/tmp/opencode/timeful-e2e-artifacts npm run test:e2e -- --project=firefox-desktop specs/timed-event-visitor-identities-firefox.spec.ts`
- The spec was migrated to the PostgreSQL mode exercised by TASK-0193; prior CI never ran it, so this instability may have existed since it was written.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The flaky first-attempt failure in timed-event-visitor-identities-firefox no longer reproduces across repeated runs of the firefox-desktop project at CI settings (workers:1, retries:2)
- [ ] #2 The root cause is identified and recorded: why the Save button intermittently stays disabled after clicking Edit for the seeded guest response
- [ ] #3 The fix addresses the cause rather than masking it; no fixed sleep, no blind timeout increase, and no retries-only mitigation
- [ ] #4 The affected assertions use state-based waits or web-first expectations consistent with e2e/AGENTS.md authoring rules
- [ ] #5 The project run passes with zero flaky results on repeated local runs against the isolated test stack
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
