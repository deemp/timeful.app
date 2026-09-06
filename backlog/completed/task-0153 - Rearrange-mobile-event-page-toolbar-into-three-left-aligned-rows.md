---
id: TASK-0153
title: Rearrange mobile event-page toolbar into three left-aligned rows
status: Done
assignee:
  - opencode
created_date: '2026-09-04 13:47'
updated_date: '2026-09-04 13:58'
labels:
  - frontend
  - mobile
  - layout
dependencies: []
priority: medium
type: enhancement
ordinal: 164300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rework the mobile event-page toolbar (ToolRow mobileRow) from the current two-row arrangement to three left-aligned rows:

- Row 1: Display Time Format toggle, Display Timezone control, and the 3 days/7 days switch grouped left with compact gaps. They must no longer spread edge to edge (justify-between) nor center when the days switch is hidden.
- Row 2: Show best times (or Show best days on Dates-Only Events) on its own full-width row. The zero-response timed case keeps the inline Show all hours switch in this row (FR-048) with no More options control.
- Row 3: More options on its own full-width row whenever the menu variant is shown.

Context: FR-049 (status proposed) currently describes the two-row arrangement and its wording no longer matches the shipped implementation (row order is inverted relative to code). Update FR-049 in place, retitle it to the three-row arrangement, and update its docs/requirements/README.md index row. FR-114 governs only when the days switch is visible, but the e2e spec that pairs with it asserts row-1 centering when the switch is hidden; that assertion changes to left alignment.

Affected code: frontend/src/components/schedule_overlap/ToolRow.vue (mobileRow template only; desktop compact layout unchanged). Affected tests: ToolRow.test.ts source/behavior assertions, frontend/e2e/event-toolbar-mobile-layout.spec.ts rows/gaps/centering assertions, and row references in frontend/e2e/event-mobile-editing-options.spec.ts wording.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a mobile Timed Event page with responses, the Display Time Format toggle, Display Timezone control, and 3 days/7 days switch form a single left-aligned group with compact gaps in the first row, with no space-between spreading or centering
- [x] #2 On a mobile Timed Event page with responses, Show best times occupies the second row on its own and More options occupies the third row on its own
- [x] #3 On a mobile Timed Event page with zero responses, the Show all hours switch occupies the second row and no More options control appears
- [x] #4 On a mobile Dates-Only Event page, the Display Time Format, Display Timezone, and days switch controls do not appear, and Show best days and More options keep their second-row and third-row placement
- [x] #5 FR-049 is updated in place to state the three-row left-aligned arrangement and its row in docs/requirements/README.md matches the new title
- [x] #6 ToolRow unit tests and the mobile toolbar e2e specs assert the new three-row left-aligned layout and pass
- [x] #7 npm run lint, fmt:check, typecheck, build, and test:unit pass in frontend
- [x] #8 The chromium-mobile e2e specs covering the mobile toolbar layout pass
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
1. ToolRow.vue (mobileRow template only):
   - Row 1: drop the `showMobileNumDaysSwitch ? justify-between : justify-center` binding; keep `tw-flex tw-w-full tw-flex-row tw-items-center` with a tight `tw-gap-x-2` so the three controls group left.
   - Row 2: wrapper `tw-flex tw-w-full tw-items-center` rendered only when `numResponses >= 1 || showAllHoursDirect`, containing the best-times switch (responses) or Show-all-hours switch (timed, zero responses); switches keep `schedule-overlap-compact-switch tw-w-full`.
   - Row 3: EventOptions menu (unchanged props) as a sibling full-width row with `v-if="!showAllHoursDirect"`.
2. FR-049: update in place (still proposed): retitle "Arrange mobile event-page controls in three rows"; statement: row 1 = Display Time Format + Display Timezone + number-of-days controls left-aligned; row 2 = Show best times/days; row 3 = More options; keep Dates-Only exclusion. Update docs/requirements/README.md index row title.
3. ToolRow.test.ts: update the source-structure test (row classes, gap, three-row comments) and rename/adjust the justify-between/center behavior tests to left alignment.
4. e2e event-toolbar-mobile-layout.spec.ts: test 1 asserts row-1 left group (left edges of rows 1-3 align, uniform compact gaps, tz width < 160) and rows 2/3 stacked (More options below Show best times, shared left edge); test 2 asserts left alignment instead of centering when the days switch is hidden.
5. e2e event-mobile-editing-options.spec.ts: update row wording in names/comments (row 2 best times, row 3 More options); assertions unchanged.
6. Verify: frontend lint, fmt:check, typecheck, build, test:unit; then targeted chromium-mobile e2e (event-toolbar-mobile-layout, event-mobile-editing-options) via npm run test:e2e.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User refinement mid-implementation: row 1 must group its controls at the left edge with a compact gap (no justify-between spread, no centering when the days switch is hidden), and the More options button must be content-sized rather than full-width. Implemented as: row 1 `tw-gap-x-2` with no justify classes; row 3 EventOptions gets `tw-self-start` and no `menu-activator-class` override. FR-049 statement updated to match.

First row-3 attempt used `tw-self-start` on the EventOptions section; the shrink-wrapped flex column collapsed the Vuetify activator to a tiny wrapped button (user screenshot). Final approach keeps the row full-width and sizes the button itself via `menu-activator-class="tw-w-fit"`, which resolves fit-content against the definite row width. e2e asserts the button stays one line tall (height <= 40), >= 100px wide, and leaves 40px+ empty on the right.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reworked the mobile event-page toolbar (ToolRow.vue mobileRow template) from two rows into three left-aligned rows and updated FR-049 to match.

Changes:
- ToolRow.vue: row 1 groups the time-format toggle, timezone selector, and 3/7-days switch at the left edge with a compact `tw-gap-x-2` (removed the justify-between/center binding). Row 2 renders Show best times or, on timed events with zero responses, the inline Show all hours switch in its own `tw-flex tw-w-full tw-items-center` wrapper. Row 3 renders the More options menu as a sibling with `menu-activator-class="tw-w-fit"` so the button sizes to its text at the left edge (an earlier `tw-self-start` shrink-wrap collapsed the Vuetify button, fixed by sizing the activator instead of the wrapper). Desktop compact layout untouched.
- FR-049 updated in place (still proposed): retitled "Arrange mobile event-page controls in three rows"; statement pins row 1 left grouping, row 2 Show best times/days, row 3 left-aligned content-sized More options, and the Dates-Only exclusion. docs/requirements/README.md index row retitled; markdown formatted and linted.
- Tests: ToolRow.test.ts source-structure and justify behavior tests updated to the three-row left-aligned arrangement; e2e event-toolbar-mobile-layout.spec.ts asserts compact equal row-1 gaps, shared left edges across rows 1-3, More options stacked below Show best times with bounded height/width, and left alignment when the days switch is hidden (FR-114 case); event-mobile-editing-options.spec.ts row wording updated.

Evidence: frontend lint (2 pre-existing NewEvent.test.ts warnings only), fmt:check, typecheck, build, and test:unit (138 files, 993 tests) all pass. chromium-mobile e2e: 6/6 pass across event-toolbar-mobile-layout.spec.ts and event-mobile-editing-options.spec.ts, including the renamed "mobile timed toolbar groups row 1 left and stacks the action rows".
<!-- SECTION:FINAL_SUMMARY:END -->
