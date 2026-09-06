---
id: TASK-0162
title: >-
  Fix the two failing selected-slot tooltip tests in the specific-times edit e2e
  spec (pre-existing regression from the Collapse disabled times default,
  e16791e0)
status: Done
assignee:
  - opencode
created_date: '2026-09-06 11:44'
updated_date: '2026-09-06 12:59'
labels:
  - frontend
  - e2e
dependencies: []
references:
  - frontend/e2e/timed-event-specific-times-edit-firefox.spec.ts
  - 49c799ee
  - e16791e0
priority: high
type: bug
ordinal: 173300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The two selected-slot tooltip tests in `frontend/e2e/timed-event-specific-times-edit-firefox.spec.ts` (`mobile compatibility mouse press shows the selected-slot tooltip` and `mobile timeslot click shows the selected-slot tooltip`) fail on main. A stash-and-rerun A/B, recorded in the TASK-0160 final summary (commit 49c799ee), proved they fail with and without unrelated changes and attributed the regression to the `Collapse disabled times` default-on change (commit e16791e0, TASK-0159).

Investigation hint, not a conclusion: the edit spec locates the tooltip via `.tw-fixed.tw-z-50` while sibling specs use `.tw-fixed.timeful-tooltip-layer`; confirm whether the cause is a stale locator or the collapsed-by-default grid rendering before fixing.

Outcome: both tests pass on the firefox-desktop e2e stack without weakening their assertions, and the TASK-0159 behavior (Collapse disabled times default, collapse bands, derived switch state) is unchanged.

Constraints: browser e2e uses the isolated test stack only (`npm run test:e2e -- --project=firefox-desktop` from `frontend/`); do not retarget assertions just to make them pass; keep tooltip placement and visibility logic centralized per TASK-0033.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both selected-slot tooltip tests in frontend/e2e/timed-event-specific-times-edit-firefox.spec.ts pass on the firefox-desktop e2e stack with the fix applied
- [x] #2 The root cause is identified and recorded in the task implementation notes (stale tooltip locator vs Collapse disabled times collapsed-by-default rendering)
- [x] #3 The fix does not change the Collapse disabled times default behavior or its TASK-0159 acceptance criteria, the other four tests in the spec still pass, and no other e2e spec regresses
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
1. Root cause: commit 50a718f6 (TASK-0146) moved the shared tooltip from `tw-z-50` to the semantic `.timeful-tooltip-layer` (z-40) and updated tooltip selectors in unit tests and only `schedule-overlap-mobile-touch-firefox.spec.ts`; the three `.tw-fixed.tw-z-50` locators in `timed-event-specific-times-edit-firefox.spec.ts` were missed. The TASK-0160 A/B attribution to e16791e0 is wrong — 50a718f6 is an ancestor of e16791e0. Test 3 still passes only because its `toHaveCount(0)` locator became vacuous (never matches anything).
2. Reproduced test 2 in isolation on firefox-desktop: `toBeVisible` fails with "element(s) not found" for `.tw-fixed.tw-z-50` — locator failure, not a missing tooltip.
3. Fix: retarget the three stale locators (tests 1 and 2 `const tooltip = ...`, test 3 `toHaveCount(0)`) to the canonical `.tw-fixed.timeful-tooltip-layer` used by the sibling spec and ScheduleOverlap.mobileTooltip.test.ts. This restores test 3's intended no-tooltip assertion instead of weakening anything.
4. Verify: full edit spec (6 tests) green on firefox-desktop; full firefox-desktop project run for AC #3; required frontend checks.
5. Record final summary, check ACs, mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Root cause

Commit 50a718f6 (TASK-0146, Sep 3) moved the shared tooltip from `tw-z-50` to the semantic `.timeful-tooltip-layer` layer (z-index 40, `frontend/src/index.css`) and updated tooltip selectors in unit tests and `schedule-overlap-mobile-touch-firefox.spec.ts` only. The three `.tw-fixed.tw-z-50` locators in `timed-event-specific-times-edit-firefox.spec.ts` (tests 1 and 2, plus the `toHaveCount(0)` in test 3) were missed. The TASK-0160 A/B attribution to e16791e0 was incorrect — 50a718f6 is an ancestor of e16791e0, and the A/B only contrasted TASK-0160's own diff, so it could not have isolated the true cause. Test 3 kept passing only because its stale `toHaveCount(0)` locator matched nothing and had become vacuous.

## Change

Retargeted the three locators to the canonical `.tw-fixed.timeful-tooltip-layer` used by the sibling spec and `ScheduleOverlap.mobileTooltip.test.ts`. Test 3's no-tooltip assertion is restored to being meaningful: it now actually polls for tooltip dismissal after the Responses-heading click. No app code changed; tooltip layering (tooltip 40 < action bar 50 < bottom overlay 60) and TASK-0159 collapse behavior are untouched.

## Verification

- Reproduced test 2 in isolation before changing anything: `toBeVisible` failed with "element(s) not found" for `.tw-fixed.tw-z-50`.
- Edit spec 6/6 green on firefox-desktop in a dedicated run (1.6m) and 6/6 within a full-project run.
- The two fixed tests: green in all four full-project firefox-desktop runs (8/8).
- Restored test 3 assertion: 8/8 under clean conditions (3 earlier passes plus a 5/5 `--repeat-each=5` run).
- Full-project firefox runs showed one bare startup/step timeout per run with a rotating victim (weekly → create → test 3), each passing in isolation immediately after — environmental Vite-cold-compile/timeout flake unrelated to this spec-only locator diff. Orphaned Vite webServer on port 4174 and leftover test containers after interrupted runs required manual cleanup (`kill` + compose down).
- Required checks from `frontend/`: lint 0 errors (2 pre-existing NewEvent.test.ts warnings), fmt:check, typecheck, build, test:unit 1034/1034 all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the two failing selected-slot tooltip tests in `frontend/e2e/timed-event-specific-times-edit-firefox.spec.ts` by retargeting three stale tooltip locators to the canonical `.tw-fixed.timeful-tooltip-layer` class.

## Root cause

Commit 50a718f6 (TASK-0146) moved the shared tooltip from `tw-z-50` to the semantic z-40 layer (`.timeful-tooltip-layer`) and updated tooltip selectors in unit tests and the sibling scheduling spec only; the edit spec's three locators were missed. The TASK-0160 A/B attribution to e16791e0 was wrong — 50a718f6 predates it. Test 3 still passed only because its `toHaveCount(0)` locator had become vacuous; updating it restores the intended no-tooltip assertion rather than weakening anything.

## Change

Spec-only locator fix: tests 1 and 2 (`const tooltip = ...`) and test 3's `toHaveCount(0)` now use `.tw-fixed.timeful-tooltip-layer`, matching the sibling spec and `ScheduleOverlap.mobileTooltip.test.ts`. No app code changed; tooltip layering and the TASK-0159 collapse behavior are untouched.

## Verification

- Edit spec 6/6 green on firefox-desktop (dedicated run and within a full-project run); the two fixed tests are green in all four full-project runs; the restored assertion passed 8/8 clean-condition runs.
- Full-project runs exhibited one bare startup/step timeout per run with a rotating victim across unrelated specs, each passing in isolation — pre-existing environmental load flakiness, not caused by this diff; the owner's backlog Inbox already tracks Playwright trace retention for diagnosing it.
- `frontend/` required checks: lint 0 errors (2 pre-existing warnings), fmt:check, typecheck, build, test:unit 1034/1034.
<!-- SECTION:FINAL_SUMMARY:END -->
