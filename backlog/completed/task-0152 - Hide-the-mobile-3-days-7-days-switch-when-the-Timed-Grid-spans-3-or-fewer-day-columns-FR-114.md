---
id: TASK-0152
title: >-
  Hide the mobile 3 days/7 days switch when the Timed Grid spans 3 or fewer day
  columns (FR-114)
status: Done
assignee: []
created_date: '2026-09-04 13:26'
updated_date: '2026-09-04 13:39'
labels: []
dependencies: []
references:
  - docs/requirements/functional/fr/FR-114.md
  - frontend/src/components/schedule_overlap/ToolRow.vue
  - frontend/src/components/schedule_overlap/useScheduleOverlapViewModels.ts
  - frontend/src/composables/schedule_overlap/useCalendarGrid.ts
documentation:
  - docs/requirements/README.md
  - docs/requirements/functional/README.md
  - docs/terminology/README.md
modified_files:
  - frontend/src/components/schedule_overlap/ToolRow.vue
  - frontend/src/components/schedule_overlap/ToolRow.test.ts
  - >-
    frontend/src/components/schedule_overlap/scheduleOverlapViewModelContracts.ts
  - frontend/src/components/schedule_overlap/useScheduleOverlapViewModels.ts
  - frontend/src/components/schedule_overlap/scheduleOverlapTestUtils.ts
  - >-
    frontend/src/components/schedule_overlap/ScheduleOverlapGridDragBinding.test.ts
  - frontend/e2e/event-toolbar-mobile-layout.spec.ts
priority: medium
type: enhancement
ordinal: 163300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FR-114 (docs/requirements/functional/fr/FR-114.md, status proposed) specifies that on a mobile Timed Event Page the 3 days/7 days range switch is shown only when the Timed Grid can display more than 3 day columns, hidden otherwise with every day column displayed. The switch currently renders unconditionally in ToolRow.vue mobile row 1 for timed events, so the visibility rule is not implemented.

Context:
- Mobile row 1 (ToolRow.vue, timed events) holds the time-format toggle, the timezone selector, and the 3 days/7 days switch with justify-between.
- The grid's total day-column count is already available to useScheduleOverlapViewModels via the allDays option. Derive one boolean (Timed Grid can display more than 3 day columns) in the view-model layer, add it to ScheduleOverlapToolRowViewModel, and conditionally render the switch in ToolRow.vue from that flag. Weekly Timed Events always span 7 day columns per page, so they always show the switch; specific-dates events span picked dates plus cross-midnight neighbor columns, so they hide it when the total is 3 or fewer.
- Layout decision confirmed with the user (2026-09-04): when the switch is hidden, center the time-format toggle and timezone selector together in row 1; when visible, keep the current justify-between layout.
- Do not change the persisted mobileNumDays value (localStorage persistence in useCalendarGrid.ts with a 3 days default); hiding the switch must not reset the preference.
- Desktop is unaffected: the switch is mobile-only and maxDaysPerPage stays 7 on non-phone viewports.
- FR-114.md wording stays as-is; no requirement record changes in this task.
- Per frontend/AGENTS.md, read ADR-001 before editing, and follow glossary rules for Timed Grid and Timed Event Page terms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a mobile Timed Event Page the 3 days/7 days range switch is shown only when the Timed Grid can display more than 3 day columns, and is hidden when the grid can display 3 or fewer day columns (FR-114)
- [x] #2 When the switch is hidden the Timed Grid displays every day column and the stored mobileNumDays browser-local preference is left unchanged
- [x] #3 When the switch is hidden the mobile row 1 time-format toggle and timezone selector are centered as a group; when the switch is visible, row 1 keeps the existing justify-between three-control layout
- [x] #4 Dates-Only Event pages never show the range switch
- [x] #5 ToolRow unit tests cover the switch visibility rule and the centered fallback layout
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
"1. Read ADR-001 (required by frontend/AGENTS.md).
2. useScheduleOverlapViewModels.ts: compute a boolean in toolRowViewModel from opts.allDays.value.length > 3 and expose it on ScheduleOverlapToolRowViewModel (scheduleOverlapViewModelContracts.ts) as showMobileNumDaysSwitch.
3. ToolRow.vue: v-if the 3 days/7 days switch on the new flag; switch row 1 between justify-between (switch visible) and justify-center (switch hidden).
4. Update fixtures and tests: ToolRow.test.ts baseToolRow gains showMobileNumDaysSwitch: true; update the source-assertion test for the row-1 class change; add unit tests for hidden switch + centered row and visible switch; update scheduleOverlapTestUtils.ts and any other contract fixtures.
5. Run frontend checks: lint, fmt:check, typecheck, build, test:unit."
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the FR-114 visibility rule for the mobile Timed Grid 3 days/7 days range switch. `useScheduleOverlapViewModels` now derives `showMobileNumDaysSwitch` from the grid's total day-column span (`allDays.length > 3`) and exposes it on `ScheduleOverlapToolRowViewModel`; `ToolRow.vue` renders the switch only when the flag is true and switches mobile row 1 between the existing `justify-between` three-control layout (switch visible) and a centered layout for the remaining time-format toggle and timezone selector (switch hidden). Weekly Timed Events always span 7 columns so they always show the switch; specific-dates events hide it when their picked-date plus cross-midnight span is 3 or fewer. The stored `mobileNumDays` browser-local preference is untouched while hidden, and every day column displays because the page slice is bounded by the span. Desktop and Dates-Only pages are unchanged.

Tests: added ToolRow unit tests asserting the switch presence/absence and the row-1 justify classes for both layouts, and updated contract fixtures (`scheduleOverlapTestUtils`, `ScheduleOverlapGridDragBinding.test`). Updated `e2e/event-toolbar-mobile-layout.spec.ts`: the equal-gaps test now seeds four picked days so the switch stays visible per FR-114, and a new chromium-mobile test asserts a single-day event hides the switch and centers row 1 within 2px of viewport center.

Checks: frontend lint (0 errors), fmt:check, typecheck, and build pass; unit suite 993/993 green; targeted e2e green: event-toolbar-mobile-layout (4 passed, chromium-mobile), schedule-overlap-mobile-scroll plus event-mobile-editing-options (3 passed), event-page-days-only-layout (11 passed, 7 skipped).
<!-- SECTION:FINAL_SUMMARY:END -->
