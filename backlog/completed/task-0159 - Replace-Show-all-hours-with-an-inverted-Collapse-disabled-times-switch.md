---
id: TASK-0159
title: Replace Show all hours with an inverted Collapse disabled times switch
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-04 16:36'
updated_date: '2026-09-05 10:15'
labels:
  - frontend
dependencies: []
references:
  - backlog/backlog.md
documentation:
  - docs/terminology/glossary.md
  - docs/terminology/README.md
  - docs/requirements/AGENTS.md
  - docs/requirements/functional/fr/FR-011.md
  - docs/requirements/functional/fr/FR-014.md
  - docs/requirements/functional/fr/FR-048.md
  - docs/requirements/functional/fr/FR-105.md
  - docs/requirements/functional/fr/FR-111.md
  - docs/design/architecture/adr/ADR-001.md
modified_files:
  - frontend/src/views/Event.vue
  - frontend/src/components/schedule_overlap/EventOptions.vue
  - frontend/src/components/schedule_overlap/ToolRow.vue
  - frontend/src/components/schedule_overlap/ScheduleOverlap.vue
  - frontend/src/components/schedule_overlap/ScheduleOverlapSidebar.vue
  - frontend/src/components/schedule_overlap/ScheduleOverlapMobileOverlay.vue
  - frontend/src/components/schedule_overlap/ScheduleOverlapRespondentsPanel.vue
  - frontend/src/components/schedule_overlap/useTimedGridPresentation.ts
  - frontend/src/components/schedule_overlap/useScheduleOverlapViewModels.ts
  - >-
    frontend/src/components/schedule_overlap/scheduleOverlapViewModelContracts.ts
  - frontend/src/composables/schedule_overlap/scheduleOverlapStorage.ts
  - frontend/src/composables/event/types.ts
  - frontend/src/views/Event.test.ts
  - frontend/src/components/schedule_overlap/EventOptions.test.ts
  - frontend/src/components/schedule_overlap/ToolRow.test.ts
  - frontend/src/components/schedule_overlap/RespondentsList.test.ts
  - >-
    frontend/src/components/schedule_overlap/ScheduleOverlap.collapsedHours.test.ts
  - >-
    frontend/src/components/schedule_overlap/ScheduleOverlapGridDragBinding.test.ts
  - >-
    frontend/src/components/schedule_overlap/ScheduleOverlap.inactiveGapInteraction.test.ts
  - >-
    frontend/src/components/schedule_overlap/ScheduleOverlap.specificTimes.test.ts
  - frontend/src/components/schedule_overlap/useTimedGridPresentation.test.ts
  - frontend/src/components/schedule_overlap/scheduleOverlapTestUtils.ts
  - frontend/src/composables/event/useEventEditing.test.ts
  - frontend/e2e/event-page-no-responses-layout.spec.ts
  - frontend/e2e/event-mobile-editing-options.spec.ts
  - frontend/e2e/event-toolbar-mobile-layout.spec.ts
  - frontend/e2e/inspect/src/scenarios/event-collapse-hours.ts
  - docs/terminology/glossary.md
  - docs/terminology/README.md
  - docs/requirements/README.md
  - docs/requirements/functional/fr/FR-011.md
  - docs/requirements/functional/fr/FR-014.md
  - docs/requirements/functional/fr/FR-048.md
  - docs/requirements/functional/fr/FR-105.md
  - docs/requirements/functional/fr/FR-111.md
priority: medium
type: enhancement
ordinal: 170300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On timed event pages a persisted `Show all hours` switch (default off) controls grid extent: off collapses inactive runs of at least three consecutive whole hours (FR-011), on expands to the full civil-day axis (FR-014). Owner decision: replace it with a switch of inverted polarity labeled `Collapse disabled times`.

Desired behavior:
- The switch state mirrors whether disabled times are collapsed: on (the new default) collapses disabled times exactly as the current collapsed rendering, including manual collapse-band expansion; off renders the full axis exactly as the current expanded rendering.
- Placement and visibility of the control stay as they are today (desktop inline switch, More options item, mobile inline switch with zero responses); applicability rules (timed events only, not during availability editing, the scheduling page, or the excluded editing states) are unchanged.
- The preference persists across reloads with the new polarity and migrates the existing preference: a stored `Show all hours` value of true becomes the new switch off; false or absent becomes on.
- Internal naming must express the new concept without double negatives.

Documentation alignment: the `"Show all hours" Option` glossary term is replaced by a canonical term for the new option, and affected requirements (FR-011, FR-014, FR-048, FR-105, FR-111) plus the requirements README index are updated, following docs/requirements/AGENTS.md and docs/terminology/README.md.

Source item: backlog/backlog.md line 306 ("Replace Show all hours with an option to collapse disabled hours"). Related but separate: TASK-0087 (general code-naming alignment).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On timed event pages (desktop and mobile), every `Show all hours` control is replaced by a switch labeled `Collapse disabled times` in the same placements, including the More options item and the mobile zero-response inline switch
- [x] #2 With the switch on (the default), the grid renders collapsed disabled runs exactly as the previous collapsed behavior, and manually expanding a collapse band still works
- [x] #3 With the switch off, the grid renders the full civil-day axis with no collapse bands, exactly as the previous expanded behavior
- [x] #4 The new preference persists across reloads with the new polarity, and an existing `Show all hours` preference migrates: true maps to the new switch off, false or absent maps to on
- [x] #5 Dates-only events and states where the option never applied (availability editing, the scheduling page, sign-up-block and specific-times editing) show no switch where none appeared before and no rendering regression
- [x] #6 Unit and e2e coverage asserts the new label, the inverted polarity, and the preference migration; stale `Show all hours` assertions are updated
- [x] #7 The glossary entry for the option and the affected requirement records (FR-011, FR-014, FR-048, FR-105, FR-111) plus the requirements README index use the renamed option with the new semantics, and the requirements and terminology format checks pass
- [x] #8 The switch state is derived globally: it reads on only while every collapsible run across all grid pages is collapsed, manual band expansion turns it off, switch-on collapses every collapsible run (collapse-all), and switch-off renders the full axis on every page
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
1. Storage (scheduleOverlapStorage.ts): replace read/writeShowAllHoursPreference with read/writeCollapseDisabledTimesPreference over new key `collapseDisabledTimes`, default true (collapsed). On read: new key wins; else legacy `showAllHours` migrates inverted (legacy true → false), persists the new key and removes the legacy key so the migrated preference sticks.
2. State/logic renames (polarity inverts, renderings unchanged): ScheduleOverlap.vue ref/watch/expose/listeners/preferences; useTimedGridPresentation.ts option `collapseDisabledTimes`, canCollapseTimes drops the `!`, updateCollapseDisabledTimes clears manual expansions when value is false (expanding); useScheduleOverlapViewModels.ts option + canCollapseHours drops the `!` + VM fields; scheduleOverlapViewModelContracts.ts fields + updateCollapseDisabledTimes action; composables/event/types.ts ScheduleOverlapInstance.
3. UI renames: EventOptions.vue (prop/emit/computed, id collapse-disabled-times-toggle, label `Collapse disabled times`, menu + section variants); ToolRow.vue (collapseDisabledTimesDirect, id mobile-collapse-disabled-times-toggle, label, action wiring); ScheduleOverlapSidebar.vue + ScheduleOverlapMobileOverlay.vue relay emits; Event.vue desktop computeds/handlers (`?? true` fallbacks), inline switch id/label, CSS class desktop-event-header-options__all-hours-switch → __collapse-disabled-times-switch.
4. Tests: flip seeded/default polarity where mocks used showAllHours:false → collapseDisabledTimes:true; rename ids/labels/emits in EventOptions/ToolRow/RespondentsList/Event/useEventEditing/ScheduleOverlapGridDragBinding/collapsedHours/inactiveGapInteraction/specificTimes/useTimedGridPresentation tests; add legacy-migration coverage in ScheduleOverlap.collapsedHours.test.ts (legacy true → expanded + persisted false; legacy false → collapsed). e2e: event-page-no-responses-layout, event-mobile-editing-options, event-toolbar-mobile-layout locator/wording renames; inspect scenario seed.
5. Docs: glossary entry + ToC → `\"Collapse disabled times\" Option` (#collapse-disabled-times-option, collapsed-first definition); terminology README capitalization example; FR-011 (collapse when enabled), FR-014 (full axis when disabled), FR-048/FR-105/FR-111 label renames; docs/requirements/README.md index rows.
6. Verification: frontend lint/fmt:check/typecheck/build/test:unit; targeted e2e (chromium-desktop event-page-no-responses-layout, chromium-mobile editing-options + toolbar layout); root lint:markdown, format:markdown:check, test:markdown-rules, test:markdown-format; graphify update.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the timed-event `Show all hours` switch with an inverted `Collapse disabled times` switch, then extended it per the owner's follow-up into a derived global control.

## Behavior

- The switch reads ON only while every collapsible run across all grid pages is collapsed. Manual band expansion turns it OFF (band clicks stay local to their slots); switch ON collapses every collapsible run (collapse-all); switch OFF renders the full civil-day axis on every page.
- The persisted preference (`collapseDisabledTimes`, default ON) stores the collapsed/expanded baseline; manual expansions remain session-only and are cleared by any switch action. Legacy `showAllHours` migrates inverted at read time (legacy true → OFF), persists the new key, and removes the legacy key.
- Visibility gating (`canCollapseTimes`, legend's `canCollapseHours`) consumes the baseline mode, not the derived state, so one manual expansion does not hide bands or the legend item.
- Placements, visibility, and applicability rules are unchanged (desktop inline switch, More options item, mobile zero-response inline switch; timed events only, excluded during availability editing, scheduling, sign-up-block/specific-times states).

## Implementation

- `useTimedGridPresentation.ts`: option renamed to `collapseDisabledTimesPreference`; new derived computed `collapseDisabledTimes` (mode && both manual-expansion sets empty); `updateCollapseDisabledTimes` always clears both expansion sets; returns the derived value.
- `ScheduleOverlap.vue`: persisted ref renamed `collapseDisabledTimesPreference` (watch persists it); destructures the derived value, exposes it, and passes mode + derived to the VM builder.
- `useScheduleOverlapViewModels.ts` + `scheduleOverlapViewModelContracts.ts`: opts take mode + derived; `canCollapseHours` keeps mode; ToolRow/RespondentsPanel VMs carry the derived switch value. `composables/event/types.ts` `ScheduleOverlapInstance.collapseDisabledTimes` is now the derived state. `Event.vue`, `EventOptions.vue`, `ToolRow.vue`, sidebar/overlay relays unchanged in markup (they consume the derived value; `?? true` fallbacks remain).

## Tests

- `useTimedGridPresentation.test.ts`: renamed seed, full-axis test, and a new derived-state test (manual expansion → OFF, collapse-all → ON).
- `ScheduleOverlap.collapsedHours.test.ts`: new component-level global-scope test (band expansion flips the exposed switch OFF with no persisted write; switch ON re-collapses bands) plus legacy migration tests (legacy true → expanded/persisted false; legacy false → collapsed/persisted true).
- Polarity fixes in `ToolRow.test.ts` (inline switch seeds ON, click emits `false`); full suite: 139 files / 1018 tests green.
- e2e updated (locators/wording/seeds in `event-page-no-responses-layout`, `event-mobile-editing-options`, `event-toolbar-mobile-layout`, inspect scenario); chromium-desktop (3) and chromium-mobile (6) targeted runs green.

## Docs

- Glossary `"Collapse disabled times" Option` redefined (derived global state, session-only manual expansions, persisted baseline); FR-011 gained derived-state/collapse-all body and AC; FR-014 full-axis sentence extended with per-page uncollapse; FR-048/FR-105/FR-111 are placement-only and unchanged; root markdown lint/rules/format checks pass.

## Verification

- `frontend`: lint (0 errors), fmt:check, typecheck, build, test:unit (1018 passed) all green.
- e2e: `event-page-no-responses-layout.spec.ts` (chromium-desktop) and `event-mobile-editing-options.spec.ts` + `event-toolbar-mobile-layout.spec.ts` (chromium-mobile) all pass.
- Root `lint:markdown`, `test:markdown-rules`, `test:markdown-format`, `format:markdown:check` pass; `graphify update .` run.

Note: `backlog/backlog.md:306` source item not ticked because that file holds TASK-0158's concurrent WIP edits.
<!-- SECTION:FINAL_SUMMARY:END -->
