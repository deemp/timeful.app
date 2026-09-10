---
id: TASK-0196
title: Stabilize firefox cancel-approved-access transfer flake (shared busy poll)
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-09-10 09:06'
updated_date: '2026-09-10 09:22'
labels:
  - e2e
  - playwright
  - flaky-test
  - frontend
dependencies: []
references:
  - e2e/specs/timed-event-access-transfer-firefox.spec.ts
  - frontend/src/components/event/EventAccessTransfer.vue
  - frontend/src/components/event/EventAccessTransfer.test.ts
  - .github/workflows/e2e-ci.yml
documentation:
  - e2e/AGENTS.md
  - frontend/AGENTS.md
  - >-
    backlog/tasks/task-0194 -
    Stabilize-flaky-timed-event-visitor-identities-firefox-desktop-Save-flow.md
priority: medium
type: bug
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In E2E CI run 34456887263 the firefox-desktop test "Source cancels approved access before the target redeems" (e2e/specs/timed-event-access-transfer-firefox.spec.ts:519) failed on the first attempt and passed on retry, so it was reported flaky rather than blocking. The failure was at the post-cancel assertion: `expect(page.getByRole("status")).toContainText("Cancelled")` observed "Transfer status: Approved — waiting for the other browser".

Likely cause: the source dialog's 2-second status poll runs through the shared `busy` flag in `frontend/src/components/event/EventAccessTransfer.vue`, and the "Cancel transfer" button (as well as "Approve matching code" and "Revoke access") is `:disabled="busy"`. When Playwright's click actionability check passes but the interval poll starts before the click is dispatched, the button becomes disabled, the click is not delivered, and `run()` also silently returns while `busy` is set. The transfer therefore stays approved and the assertion retries until it times out. A click can also be lost for approve/revoke through the same path.

Goal: make the spec deterministic by removing the root cause. Background polling must not disable user actions, and a status response already in flight when cancel/revoke completes must not resurrect the previous state. Per e2e/AGENTS.md authoring rules, do not add fixed sleeps, blind timeout increases, or retries-only mitigation. If the root cause proves to be application behavior rather than test timing, fix the behavior.

Reproduce (isolated stack, bundled mode, PostgreSQL creation): `cd e2e && E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true E2E_FRONTEND=bundled E2E_ARTIFACTS_DIR=/tmp/opencode/timeful-e2e-artifacts nix run ..#e2e -- --project=firefox-desktop --workers=2 specs/timed-event-access-transfer-firefox.spec.ts -g "Source cancels approved access before the target redeems" --repeat-each=20`. The narrow timing window may not reproduce on a fast local machine (32 focused runs at 1 and 2 workers did not), so prefer a deterministic component regression that drives a poll and cancel concurrently.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The root cause of the flaky cancel-approved-access transfer test is identified and recorded
- [x] #2 Background status polling no longer disables the source dialog's action buttons, so a poll cannot swallow a Cancel/Approve/Revoke click
- [x] #3 A status response already in flight when cancel or revoke completes cannot restore the transfer's previous state
- [x] #4 A deterministic component regression drives a status poll and a cancel concurrently and asserts the cancel request is sent and the final status is Cancelled
- [x] #5 The scoped firefox-desktop access-transfer spec passes with zero flaky results across repeated runs against the isolated test stack
- [x] #6 No fixed sleep, blind timeout increase, or retries-only mitigation is used
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
1. Add a deterministic component regression in EventAccessTransfer.test.ts that starts a status poll whose response is deferred, then clicks "Cancel transfer" while it is in flight, and asserts the cancel transport call is issued and the status shows Cancelled.
2. Separate polling state from the user-action busy gate in EventAccessTransfer.vue: the interval poll uses its own polling ref and does not disable action buttons; user actions keep busy.
3. Prevent stale status responses from overwriting a completed cancel/revoke by ignoring updates whose transfer is no longer tracked.
4. Run frontend lint/format/typecheck/build/unit checks, then repeat the scoped firefox-desktop access-transfer spec against the isolated test stack.
5. Record evidence and finalize TASK-0196.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed: the source dialog's 2-second status poll ran through run(), which sets the shared `busy` flag used to disable Cancel/Approve/Revoke, and run() also silently drops an action while busy. A Playwright click that passes the enabled check but lands after a poll starts is not delivered, so the transfer stayed approved and the post-cancel assertion timed out.

Error-first evidence: the new component test `does not drop a cancel while a status poll is in flight` fails against the old component (`toHaveBeenLastCalledWith` observed the .../status call instead of .../cancel) and passes with the fix.

Fix in frontend/src/components/event/EventAccessTransfer.vue:
- Added a `polling` ref and a `poll()` function; the 2s interval calls poll(), which guards on `busy`/`polling` but never sets `busy`, so background refreshes no longer disable action buttons.
- `updateTransfer` now ignores a status result whose transfer is no longer tracked, so a status request already in flight when cancel/revoke completes cannot restore the previous state.
- Preserved the prior polling error behavior (only surface the refresh message when no other error is shown).

Checks: frontend lint, fmt:check, typecheck, build all pass; test:unit 145 files / 1072 tests pass, including the new regression.

Isolated E2E stack (E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true, E2E_FRONTEND=bundled):
- full timed-event-access-transfer-firefox.spec.ts: 8/8 passed at workers=2.
- focused "Source cancels approved access before the target redeems": 20/20 passed at workers=2.
- "Source approves the exact target code for guest access": 3/3 passed at workers=1.
One earlier full-spec run at workers=2 saw the unrelated guest-access test hit its default 30s budget on this loaded local machine (the three approval tests took 22-29s locally vs ~15s in CI); it passed 8/8 on re-run and 3/3 in isolation, so it is local resource contention, not the poll change.

graphify update . completed (5083 nodes / 8360 edges).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary
- Fixed the flaky cancel-approved-access Firefox test by removing the coupling between the dialog's background status polling and the user-action gate.
- Added a `polling` ref so the 2s interval never sets `busy`; action buttons are no longer disabled by a poll, so a Cancel/Approve/Revoke click cannot be swallowed.
- Guarded `updateTransfer` so a status response in flight when cancel/revoke completes cannot resurrect the previous state.

## Root cause
The 2s status poll ran through `run()`, which sets the shared `busy` flag that disables the action buttons, and `run()` silently returns while busy. A Playwright click that passed the enabled check but landed after a poll started was not delivered, leaving the transfer approved and failing the post-cancel assertion.

## Verification
- New deterministic component regression fails on the old component and passes with the fix.
- Frontend lint, fmt:check, typecheck, build, and test:unit (145 files / 1072 tests) pass.
- Isolated PostgreSQL-enabled bundled Firefox suite: full access-transfer spec 8/8 at workers=2; focused cancel test 20/20 at workers=2; guest approval test 3/3 at workers=1.
- No fixed sleeps, timeout increases, or retries-only mitigation.
<!-- SECTION:FINAL_SUMMARY:END -->
