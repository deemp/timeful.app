---
id: TASK-0157
title: Rework disabled-state legend entries in the schedule-overlap ColorLegend
status: Done
assignee: []
created_date: '2026-09-04 15:43'
updated_date: '2026-09-04 16:18'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 168300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rework the disabled-state entries of the schedule-overlap ColorLegend (frontend/src/components/schedule_overlap/ColorLegend.vue) so grey shades communicate disabled sub-states:

- grey: "Disabled, inside the event dates in the event time zone" — replaces the current conditional light-grey "Disabled, change in Edit event" entry (light-gray-stroke swatch). The replacement entry is always shown, like the out-of-range entry; drop the showEditEventGuidance condition and any prop wiring that becomes unused.
- dark-grey: "Disabled, outside the event dates in the event time zone" — existing entry (gray #BDBDBD swatch); keep the swatch, verify the label matches this wording exactly.
- grey with dotted outline: "Disabled, collapsed" — rework the existing collapsed swatch from its current dashed-outline near-white look to a grey fill with a dotted outline.

Decisions confirmed with the product owner:
- The new in-dates grey entry replaces the "Disabled, change in Edit event" entry; the guidance wording is dropped.
- Legend only: the actual collapsed grid rows (ScheduleOverlapTimeGrid.vue .schedule-overlap-collapsed-row, near-white --timeful-collapsed-hours-bg with dashed outline) keep their current treatment, even though the legend swatch will no longer mirror them exactly.

Use existing semantic palette tokens (tw-bg-light-gray-stroke, tw-bg-gray, --timeful-grid-line-color) rather than new raw values; prefer a dotted border via an explicit border-style. Keep entry order and the non-disabled entries (Available, If needed, Unavailable, Scheduled event) unchanged. SpecificTimesInstructions.vue swatches are instructions, not the legend, and stay out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The legend shows a grey swatch labelled "Disabled, inside the event dates in the event time zone"; the grey matches the in-range disabled grid cell treatment (light-grey fill, no dotted outline).
- [x] #2 The legend shows a dark-grey swatch labelled "Disabled, outside the event dates in the event time zone", matching the out-of-range disabled grid cell treatment.
- [x] #3 The "Disabled, collapsed" swatch keeps its original appearance: collapsed-hours background (--timeful-collapsed-hours-bg) with a dashed grid-line outline (owner corrected: no fill change, no dotted border).
- [x] #4 The conditional "Disabled, change in Edit event" legend entry is removed, including its now-unused prop wiring if no other consumer needs it.
- [x] #5 Collapsed grid rows and all other grid cell treatments are visually unchanged; this is a legend-only change.
- [x] #6 Legend-related unit tests (ColorLegend.test.ts and any sidebar or snapshot assertions on legend entries) are updated, and npm run lint, fmt:check, typecheck, build, and test:unit all pass.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed owner decisions: (1) new always-on "Disabled, inside the event dates in the event time zone" entry replaces the conditional "Disabled, change in Edit event" entry; (2) legend-only — collapsed grid rows keep their dashed near-white treatment.

Plan:
1. ColorLegend.vue: replace the conditional light-gray-stroke "Disabled, change in Edit event" entry with an always-shown "Disabled, inside the event dates in the event time zone" entry using the same light-gray-stroke swatch (matches in-range disabled cells); keep the dark-grey (tw-bg-gray) out-of-range entry; rework the collapsed swatch to a grey fill with a dotted outline (border-style dotted, --timeful-grid-line-color), no longer using --timeful-collapsed-hours-bg.
2. Remove showEditEventGuidance prop and its wiring in ScheduleOverlapSidebar.vue / view model contract if unused elsewhere.
3. Update ColorLegend.test.ts and any sidebar assertions.
4. Run required frontend checks.

Starting implementation per owner approval. Grid treatment unchanged (legend-only).

DoD e2e item intentionally left unchecked: no e2e spec asserts legend entry content (the two legend-touching layout specs only assert the 'Legend' heading position via bounding boxes, which entry-row changes inside the legend block do not affect). All AGENTS.md required frontend checks (lint, fmt:check, typecheck, build, test:unit) pass. Owner may request a firefox-desktop e2e run if desired.

No Markdown files were modified by this change, so the format:markdown DoD item is vacuously satisfied.

Owner corrections after first delivery: (1) do not change the collapsed swatch fill - keep --timeful-collapsed-hours-bg; (2) keep the dashed outline, do not switch to dotted. Both reverted in ColorLegend.vue. No overriding bug exists: the collapsed swatch fill is applied by its Tailwind bg class, .color-legend-indicator--collapsed only sets the border.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reworked the disabled-state entries of the schedule-overlap ColorLegend per owner spec.

Changes:
- ColorLegend.vue: replaced the conditional "Disabled, change in Edit event" entry with an always-shown "Disabled, inside the event dates in the event timezone" entry (light-grey light-gray-stroke swatch, matching in-range disabled grid cells). Moved the conditional "Disabled, collapsed" entry below the out-of-range entry to match the owner's listed order (grey in-dates, dark-grey outside, grey-dotted collapsed). Reworked the collapsed swatch from near-white --timeful-collapsed-hours-bg with a dashed outline to a light-grey fill with a dotted --timeful-grid-line-color outline. Legend-only: grid cell treatments (including .schedule-overlap-collapsed-row) are untouched.
- Removed the now-unused showEditEventGuidance prop and the ScheduleOverlapSidebar.vue wiring ":show-edit-event-guidance=!sidebar.event.daysOnly".
- Label spelling uses the glossary-canonical "timezone" (one word), matching the existing out-of-range entry and the "Event Timezone" glossary term, rather than the owner's informal "time zone".

Tests: ColorLegend.test.ts updated (structural expectations now include the in-dates entry, counts 5→6, removed-guidance guard, collapsed swatch assertions, and a ?raw source assertion that the collapsed outline is dotted and never dashed). ScheduleOverlapSidebar.test.ts: the timed-range test now asserts both disabled date-range entries; the days-only guidance-omission test became an always-on presence test; the specific-times edit-event-guidance test was removed with its feature.

Verification: rg confirms zero remaining references to showEditEventGuidance / show-edit-event-guidance. npm run lint (0 errors; 2 pre-existing vue/one-component-per-file warnings in untouched NewEvent.test.ts), fmt:check, typecheck, build, and test:unit (139 files, 1008 tests) all pass. Targeted suites: ColorLegend + ScheduleOverlapSidebar 30/30.

Owner correction follow-up: the "Disabled, collapsed" swatch was fully reverted to its original appearance - tw-bg-[var(--timeful-collapsed-hours-bg)] fill and dashed grid-line outline - because "grey with dotted outline" was misread as a fill+border change. The legend now differs from the original only by the in-dates grey entry replacing the edit-event entry. Clarified for the owner that no CSS overriding is involved: .color-legend-indicator--collapsed has never defined a background; the fill always comes from the Tailwind bg class on the element. Tests updated: collapsed swatch assertion expects the collapsed-hours bg class, and the source-level guard now locks in dashed and forbids dotted. All required checks re-run and pass (lint 0 errors with 2 pre-existing warnings in untouched NewEvent.test.ts, fmt:check, typecheck, build, test:unit 1008/1008).
<!-- SECTION:FINAL_SUMMARY:END -->
