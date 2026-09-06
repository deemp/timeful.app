---
id: TASK-0154
title: >-
  Move the "no time when all respondents are available" note above the Responses
  section
status: Done
assignee:
  - opencode
created_date: '2026-09-04 14:09'
updated_date: '2026-09-04 14:25'
labels:
  - frontend
  - mobile
dependencies: []
priority: medium
type: enhancement
ordinal: 165300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The schedule-overlap note "Note: There's no time when all {N} respondents are available" currently renders below the timed grid only (ScheduleOverlapTimeGrid.vue). Move it above the Responses section so it is adjacent to the list it describes, and extend it to days-only events.

Placement:
- Desktop: in the sidebar, directly above the Responses heading (RespondentsList).
- Mobile: in the sticky overlay panel above its Responses section, and on the page (sidebar below the grid) when the overlay panel is not visible. Rendering the note inside the shared respondents panel covers all three mounts; mobile sticky-panel and page visibility are naturally exclusive because the sticky panel hides once the user scrolls to the respondents list.

Wording:
- Timed events: "Note: There's no time when all {N} respondents are available."
- Days-only events: "Note: There's no day when all {N} respondents are available."
- Group events: use "members" instead of "respondents" to match the Members heading.

Constraints:
- Remove the note from below the timed grid; do not show it in both places.
- Keep the existing visibility conditions: hidden while editing availability, hidden while responses are loading, shown only when at least one response exists and best availability (max) is below the respondent count.
- Match the existing styling: small muted text, no close button, not a hint banner.
- Centralize the note's condition and wording (including the time/day variant) in the view-model layer rather than duplicating it per mount, consistent with the schedule-overlap view-model contracts.
- Layout-based styling only; reuse existing text classes and tokens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The note no longer renders below the timed grid in ScheduleOverlapTimeGrid.vue
- [x] #2 Desktop timed events with at least one response and no slot where all respondents are available show the note above the Responses heading in the sidebar
- [x] #3 Desktop and mobile days-only events show "There's no day when all {N} respondents are available" in the same position and conditions
- [x] #4 On phones the note appears above Responses in the sticky overlay panel when that panel is visible, and above Responses in the page sidebar when the overlay panel is not visible
- [x] #5 Group events use "members" instead of "respondents" in the note wording
- [x] #6 The note is hidden while editing availability and while responses are loading, and only appears when at least one response exists and max availability is below the respondent count
- [x] #7 Unit tests cover note visibility conditions and the timed/days-only and respondents/members wording variants
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
1. Contracts (scheduleOverlapViewModelContracts.ts): add `allAvailableNote: string | null` to ScheduleOverlapRespondentsPanelViewModel; remove `max`, `respondentsLength`, `fetchedResponses` from ScheduleOverlapTimeGridViewModel (keep `loadingResponsesLoading`, still used by the grid template).
2. useScheduleOverlapViewModels.ts: export a pure `buildAllAvailableNote` helper (conditions: not EDIT_AVAILABILITY, not loading, at least one fetched response, max < respondents count; wording time/day by daysOnly, respondents/members by isGroup) and wire it into the shared `respondentsPanel` computed; drop the removed fields from timedGridViewModel.
3. ScheduleOverlapRespondentsPanel.vue: render the note above RespondentsList (outside the scrollable list) with the existing muted small-text styling.
4. ScheduleOverlapTimeGrid.vue: delete the note block below the grid.
5. Test fixtures: add `allAvailableNote: null` to buildRespondentsPanelViewModel; remove `max`/`respondentsLength`/`fetchedResponses` from the ScheduleOverlapGridDragBinding time-grid fixture.
6. Tests: new useScheduleOverlapViewModels.test.ts covering the helper condition matrix and wording variants; ScheduleOverlapRespondentsPanel.test.ts for rendering above the list and hiding when null; ScheduleOverlap.childViewModels.test.ts integration cases driving vm state/fetchedResponses/responsesFormatted for timed, days-only ("day"), group ("members"), and editing-hidden.
7. Checks: npm run lint / fmt:check / typecheck / build / test:unit; format:markdown for the task file. No e2e references to the note exist.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The note is computed once in the shared respondentsPanel view model (useScheduleOverlapViewModels.ts), so all three mounts (desktop sidebar, mobile sticky overlay panel, mobile page sidebar) render it from a single source. Rendering it inside ScheduleOverlapRespondentsPanel above RespondentsList keeps it outside the scrollable list and the sticky heading.

The old grid condition used `max !== respondentsLength`; the new helper uses `max >= respondentsLength` per the acceptance criterion ("max availability is below the respondent count"). max can never exceed the respondent count, so behavior is equivalent.

The pure helper buildAllAvailableNote is exported for exhaustive condition-matrix testing; integration tests drive the real component by assigning the exposed/setup bindings vm.state, vm.fetchedResponses, and vm.responsesFormatted after letting the mount-time fetch settle (setTimeout(0)) so the fetch handler does not clobber the assignments.

ScheduleOverlapTimeGridViewModel lost max, respondentsLength, and fetchedResponses (only the note used them); loadingResponsesLoading stays because the grid template still uses it. The GridDragBinding fixture was updated accordingly.

Checks: lint (0 errors; 2 pre-existing vue/one-component-per-file warnings in NewEvent.test.ts), fmt:check, typecheck, build, and test:unit (139 files, 1008 tests) all pass. No e2e references to the note exist. graphify update . ran after the code changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Move the "no time when all respondents are available" note above the Responses section and extend it to days-only events.

Changes:
- ScheduleOverlapRespondentsPanel.vue: renders the note above RespondentsList (outside the scrollable list) with the existing muted small-text styling (tw-text-sm tw-text-dark-gray, no close button). This single mount covers the desktop sidebar, the mobile sticky overlay panel, and the mobile page sidebar; the sticky panel and page visibility are naturally exclusive because the sticky panel hides once the user scrolls to the respondents list.
- useScheduleOverlapViewModels.ts: new exported pure helper `buildAllAvailableNote` centralizing the note's condition (not editing availability, not loading responses, at least one fetched response, best availability below the respondent count) and wording ("time" for timed events, "day" for days-only; "members" for group events, "respondents" otherwise), wired into the shared `respondentsPanel` view model so all three mounts render from one source.
- ScheduleOverlapTimeGrid.vue: removed the note block below the timed grid (moved, not duplicated).
- scheduleOverlapViewModelContracts.ts: `ScheduleOverlapRespondentsPanelViewModel` gained `allAvailableNote: string | null`; `ScheduleOverlapTimeGridViewModel` lost `max`, `respondentsLength`, and `fetchedResponses` (only the note used them); `loadingResponsesLoading` stays because the grid template still uses it.
- Test fixtures: `buildRespondentsPanelViewModel` defaults `allAvailableNote: null`; the ScheduleOverlapGridDragBinding time-grid fixture dropped the removed fields.

Tests:
- New useScheduleOverlapViewModels.test.ts: exhaustive helper condition matrix (editing, loading, no fetched responses, max >= respondent count) and wording variants (time/day, respondents/members).
- ScheduleOverlapRespondentsPanel.test.ts: note renders above the respondents list and is hidden when the view model provides none.
- ScheduleOverlap.childViewModels.test.ts: integration cases through the real ScheduleOverlap component asserting the note in the sidebar respondents panel VM for timed events, days-only "day" wording, group "members" wording, omission when a slot exists where everyone is available, omission while editing availability, and omission when no responses have been fetched.

Checks: lint (0 errors; 2 pre-existing vue/one-component-per-file warnings in NewEvent.test.ts), fmt:check, typecheck, build, and test:unit (139 files, 1008 tests) all pass. No e2e specs reference the note.
<!-- SECTION:FINAL_SUMMARY:END -->
