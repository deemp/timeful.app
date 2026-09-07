---
id: TASK-0169
title: Convert remaining e2e repro scripts to firefox specs and remove the repro area
status: Done
assignee: []
created_date: '2026-09-07 11:57'
updated_date: '2026-09-07 13:38'
labels:
  - e2e
  - tech-debt
  - browser-e2e
dependencies: []
documentation:
  - e2e/AGENTS.md
  - frontend/AGENTS.md
  - docs/requirements/functional/fr/FR-002.md
  - docs/requirements/functional/fr/FR-013.md
  - docs/requirements/functional/fr/FR-051.md
  - docs/terminology/glossary.md
modified_files:
  - e2e/specs/timed-event-date-added-header-layout-firefox.spec.ts
  - e2e/specs/timed-event-viewer-tz-column-duplication-firefox.spec.ts
  - e2e/helpers/timed-event-helpers.ts
  - e2e/package.json
  - e2e/tsconfig.json
  - e2e/eslint.config.ts
  - e2e/AGENTS.md
  - frontend/AGENTS.md
priority: medium
type: chore
ordinal: 178300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

`e2e/repro/` holds 7 one-off diagnostic repro scripts from past bug fixes. They are not Playwright tests: they launch their own browser, print verdicts such as "BUG REPRODUCED" instead of failing, use raw `page.waitForSelector`/`page.waitForTimeout`, and default to the dev frontend at `FRONTEND_URL ?? http://127.0.0.1:4173` instead of the isolated E2E stack on 4174. Only 4 of 7 are wired to npm scripts.

Coverage audit against `e2e/specs/` found 5 of 7 already superseded:

- repro-specific-times-firefox.ts (subset preserved on save) — covered by timed-event-create-firefox.spec.ts and timed-event-specific-times-edit-firefox.spec.ts with stronger API-level assertions
- repro-anonymous-timed-create-firefox.ts — covered by "anonymous specific-times create flow survives save, reload, and reopen with canonical slots intact"
- repro-edit-date-preserves-selection.ts — covered by "timed date edits preserve active subsets on add and remove slots on delete"
- repro-utc4-edit-clears-active-slots.ts — exact conversion already exists as timed-event-utc4-edit-firefox.spec.ts
- repro-date-added-clears-grid-selections.ts — covered end-to-end by saved-state assertions in timed-event-specific-times-edit-firefox.spec.ts

Two encode real regression behaviors with no spec coverage anywhere:

1. Date-added header layout: after adding a non-consecutive Event Picked Date while viewing at +02:00, the grid header recomputation historically rendered a duplicated "June 4" Projected Date Column and misplaced spacers, separating the consecutive Jun 3 and Jun 4 columns with a spacer that belongs only between non-consecutive dates. Source material: repro-date-added-visual-gap-and-duplicate.ts and repro/scenarios/specifict-times-event-keeps-after-adding-date.md.
2. Display Timezone column duplication: with eventTimezone Asia/Bangkok and slots spanning midnight, switching the Display Timezone to Etc/GMT-6 historically collapsed the Jun 15 column into a duplicated Jun 14 column because the Jun 15 display seed (Jun 14 17:00 UTC) converted to Jun 14 23:00 +06 and truncated to Jun 14. Source material: repro-viewer-tz-column-duplication.ts. This is FR-013 plus FR-002 territory.

## Requirements alignment

- FR-002 (accepted): the Timed Grid renders one Projected Date Column per distinct Civil Date in the Display Timezone to which at least one Time Slot projects. Both bugs violate exactly-one-column-per-distinct-Civil-Date.
- FR-013 (accepted): changing the Display Timezone updates each slot's projected date and Projected Date Column; a Time Slot renders no more than once, including across midnight. The viewer-TZ spec is FR-013's regression test.
- FR-051 (proposed): a newly added Event Picked Date contributes its full Enabled Domain without adding Active Slots; the UI manifestation is prior selection renders active and the added date's column has none.

Note: the intentional single spacer between non-consecutive dates (rendered via the isConsecutive flag in frontend/src/components/schedule_overlap/ScheduleOverlapTimeGrid.vue around lines 68-73) has no explicit FR. Assert "exactly 1 spacer before Jun 9" as a current-behavior guard and mark that assertion with a comment saying it is design-pinned, not FR-mandated, and may be relaxed if the header design changes.

## Work order

### 1. New spec: e2e/specs/timed-event-date-added-header-layout-firefox.spec.ts

Filename must match the firefox-desktop project testMatch /timed-event-.*firefox\.spec\.ts/ (chromium projects ignore it automatically). The firefox-desktop project pins browser timezoneId to UTC and viewport 1440x1600, so the +02:00 Display Timezone must be set in-app, never via browser TZ.

Setup: seed with seedCanonicalTimedEvent + buildSpecificDateSeed from helpers/timed-event-helpers.ts: eventTimezone "Europe/Paris" (June 2026 is CEST +02:00), selectedDays ["2026-06-03", "2026-06-04"], full-day enabled window (00:00 through 24:00 local semantics; match how existing specs express endTimeLocal; the old UI repro produced a full-day enabled domain), Active Slots 00:00-01:00 local Paris on both dates, 15-minute increment. Compute instants in UTC (Jun 3 00:00 CEST = Jun 2 22:00Z) or reuse buildUtcSpecificTimesRangeInstants.

Flow: openEventPage, set the page's Display Timezone to Europe/Paris via the grid-page control, openEditDialog, clickDateCell "2026-06-09", proceedToSpecificTimesGrid (test.step-wrapped), then assert. Preserve the scenario doc's 16 steps as a comment block at the top of the spec; the doc is deleted with the repro directory.

Assertions (web-first expect, no hand-rolled polling):
- Header shows exactly 3 day columns with unique labels covering Jun 3, Jun 4, Jun 9; no duplicated label.
- No spacer between the consecutive Jun 3 and Jun 4 columns (FR-013 AC3 artifact class: no structural split gaps between consecutive Projected Date Columns).
- Exactly 1 spacer, positioned between Jun 4 and Jun 9 (current-behavior guard, comment as not FR-mandated).
- Grid selection survives the edit: countGridCellsByClass(page, "tw-bg-white") equals the seeded active slot count, confined to the first two columns; the Jun 9 column renders no active cells (FR-051).

### 2. New spec: e2e/specs/timed-event-viewer-tz-column-duplication-firefox.spec.ts

Setup: seed eventTimezone "Asia/Bangkok", selectedDays ["2026-06-14", "2026-06-15"], slotGeneration 00:00-23:45 local at 15-minute increments, Active Slots from 2026-06-14T17:00:00Z through 2026-06-15T16:45:00Z (89 slots; 17:00Z Bangkok = Jun 15 00:00 +07). Historical bug arithmetic lives in repro-viewer-tz-column-duplication.ts; carry it into a comment.

Flow: openEventPage, enter the specific-times grid (openSpecificTimesEditor/proceedToSpecificTimesGrid), then with test.step: set Display Timezone to Etc/GMT-6 and assert, then to Etc/GMT-7 and assert. Assert via collectGridState or direct header-column locators: exactly 2 day columns and exactly 2 unique date labels (Jun 14 and Jun 15) at each offset.

### 3. New helpers in e2e/helpers/timed-event-helpers.ts

- A grid-page Display Timezone switcher (the existing changeTimezone helper targets the editor card's Event Timezone select, not the event-page Display Timezone control). Proven interaction pattern from event-toolbar-mobile-layout.spec.ts lines 282-308: `#timezone-select-container`, `getByTestId("timezone-select-trigger")`, `[data-testid="timezone-select-option"]:visible`. Verify option value/label shapes against frontend/src/components/schedule_overlap/TimezoneSelector.vue (the old repro used `[data-timezone-value="Etc/GMT-6"]` and `.v-list-item:has-text("GMT-6")` fallbacks). Prefer optionLabelPattern matching so "Etc/GMT-6" resolves regardless of display formatting; the select may render offset text like "(GMT+6:00)".
- A header-geometry reader that returns day-column labels plus spacer elements (header children of .schedule-overlap-time-grid__header that are not .schedule-overlap-time-grid__day-column) with bounding boxes, so the spec can assert spacer count and that no spacer box sits between the first two column boxes.

Authoring rules from e2e/AGENTS.md: no page.waitForSelector, no raw page.waitForTimeout (settlePage only when no state-based wait exists), expect-based auto-retrying assertions, explicit timeouts only with a reason, one behavior per test, test.step for long journeys, seed through the request fixture.

### 4. Cleanup

- Delete e2e/repro/ entirely (7 scripts plus scenarios/), after copying the scenario doc steps into the date-added spec comment.
- Delete e2e/helpers/firefox-timed-event-harness.ts; only repro scripts import it (verified by grep; specs use timed-event-helpers.ts).
- e2e/package.json: remove test:e2e:repro, test:e2e:repro:anonymous-create, test:e2e:repro:edit-date-preserves-selection, test:e2e:repro:utc4-edit-clears-active-slots.
- e2e/tsconfig.json: remove the "repro/**/*.ts" include.
- e2e/eslint.config.ts: remove the repro exemption block (currently lines 118-130, comment "Diagnostic repro entrypoints run outside test:e2e and intentionally use raw page APIs"); keep the helpers/settle.ts block.
- e2e/AGENTS.md line 5: remove `repro/` from the package-root layout list.
- frontend/AGENTS.md: update the line "keep repo-tracked Playwright specs, helpers, and repro entrypoints under `../e2e`" to drop repro entrypoints.
- Run `graphify update .` after code changes per root AGENTS.md.

### 5. Verification

From e2e/: `npm run lint`, `npm run fmt:check`, `npm run typecheck`. Then run each new spec in isolation (`npm run test:e2e -- --project=firefox-desktop -g "<test title>"`), widen to the full firefox-desktop project, and confirm no new failures. Do not run browser E2E against the dev API on 3002; the Playwright webServer owns the isolated stack. Failure-diagnosis loop per e2e/AGENTS.md (artifacts under /tmp/opencode/timeful-e2e-artifacts, show-trace).

### Constraints

- No frontend source changes; specs and helpers only. If an assertion fails against current app behavior, diagnose before changing the fixture; the two regressions are believed fixed, and a genuine failure is a new bug — stop and report rather than loosening assertions.
- Keep civil-date semantics explicit: Paris June 2026 is +02:00 (CEST), Bangkok and Etc/GMT-N offsets are fixed.
- Do not rely on identity semantics for Temporal values; compare instants as normalized strings via sortIsoInstants where relevant.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two new firefox-desktop specs exist and pass: e2e/specs/timed-event-date-added-header-layout-firefox.spec.ts (date-added Projected Date Column layout regression) and e2e/specs/timed-event-viewer-tz-column-duplication-firefox.spec.ts (Display Timezone column duplication regression), runnable via npm run test:e2e -- --project=firefox-desktop from e2e/
- [x] #2 The date-added spec asserts: after adding a non-consecutive Event Picked Date at +02:00 Display Timezone, the header shows exactly 3 Projected Date Columns (Jun 3, Jun 4, Jun 9) with no duplicated Civil Date label, no spacer between the consecutive Jun 3 and Jun 4 columns, exactly one spacer positioned before Jun 9, previously selected Time Slots still render active, and the added date's column has no Active Slots
- [x] #3 The viewer-TZ spec asserts: seeded Asia/Bangkok event renders unique Projected Date Column labels with no duplicated Civil Date label after switching the Display Timezone to Etc/GMT-6 (UTC+6: jun 13/jun 14/jun 15 - the full-day enabled domain crosses the +6 display midnight; user-amended) and again after switching to Etc/GMT-7 (exactly 2: jun 14/jun 15). Original 'exactly 2 unique labels at +6' premise amended per browser-verified diagnosis
- [x] #4 e2e/repro/ (7 scripts plus scenarios/) and e2e/helpers/firefox-timed-event-harness.ts are deleted with no remaining references: 4 test:e2e:repro* scripts removed from e2e/package.json, repro/**/*.ts include removed from e2e/tsconfig.json, repro exemption block removed from e2e/eslint.config.ts, repro/ removed from the layout line in e2e/AGENTS.md and from frontend/AGENTS.md's Playwright entrypoints line
- [x] #5 e2e npm run lint, npm run fmt:check, and npm run typecheck pass, and the full firefox-desktop project still passes with no new failures
- [x] #6 The scenario steps from e2e/repro/scenarios/specifict-times-event-keeps-after-adding-date.md are preserved as comments in the date-added spec before the file is deleted
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
## Implementation plan

Researched current system. Key findings recorded here; user approved asserting both grid states in the viewer-TZ spec.

### Helpers (e2e/helpers/timed-event-helpers.ts)
1. `changeDisplayTimezone(page, options)` — switches the grid-page (sidebar ToolRow) Display Timezone select. Scope `.schedule-overlap-sidebar #timezone-select-container` + `[data-testid="timezone-select-trigger"]` (event-toolbar-mobile-layout.spec.ts:282-308 pattern + timed-event-timezone-menu-firefox.spec.ts open loop). Prefer `optionValue` (`data-timezone-value`) with `optionLabelPattern` fallback on `.timezone-select__item-title`; verify the compact selection text (offset like "+6:00") updates.
2. `readTimeGridHeaderGeometry(page)` — evaluates `.schedule-overlap-time-grid__header` children: day-column labels + boxes, and spacer boxes (header children that are not `.schedule-overlap-time-grid__day-column`, ScheduleOverlapTimeGrid.vue:68-73).

### Spec 1: timed-event-date-added-header-layout-firefox.spec.ts
- Scenario doc's 16 steps preserved as a top comment block (AC #6).
- Seed: Europe/Paris (June 2026 = CEST +02:00), Jun 3-4, full-day window as startTimeLocal/endTimeLocal "00:00"/"00:00" (equal start/end = 24h wrapped semantics, per server deriveEnabledSlots + fullDaySlotGeneration), activeSlots 00:00-01:00 Paris both days (Jun 2 22:00Z + Jun 3 22:00Z batches), 15-min increment.
- Display TZ: Paris is served by the menu's "Europe/Brussels" entry ("Brussels, Copenhagen, Madrid, Paris", +2:00) since allTimezones has no Europe/Paris.
- Flow: openEventPage → changeDisplayTimezone(+2) → openEditDialog → clickDateCell 2026-06-09 → proceedToSpecificTimesGrid → assert 3 unique columns, no spacer Jun3-Jun4, exactly 1 spacer before Jun 9 (design-pinned comment), 4 active cells confined to cols 0-1, col 2 (Jun 9) none (FR-051).

### Spec 2: timed-event-viewer-tz-column-duplication-firefox.spec.ts (two tests, user-approved)
- Seed: Asia/Bangkok, Jun 14-15, slotGeneration 00:00-23:45, activeSlots Jun 14 17:00Z → Jun 15 16:45Z (96 slots; task said 89 but 17:00Z→16:45Z inclusive at 15-min is 96 — same as the repro's generator). Historical bug arithmetic carried in a comment.
- POSIX mapping comment: Etc/GMT-6/-7 are UTC+6/+7; the app menu exposes civil zones — UTC+6 = Asia/Dhaka ("(GMT+6:00) Astana, Dhaka"), UTC+7 = Asia/Bangkok ("(GMT+7:00) Bangkok, Hanoi, Jakarta").
- Test A (view state, AC #3): openEventPage → step: switch to +6 → assert exactly 2 day columns, unique labels jun 14/jun 15; step: switch to +7 → same.
- Test B (edit grid): openSpecificTimesEditor (SET_SPECIFIC_TIMES) → switch to +6 → 3 columns, unique labels jun 13/14/15, no duplicates (enabled domain crosses display midnight; unit-confirmed useCalendarGrid.test.ts:1451); switch to +7 → 2 columns jun 14/15.

### Cleanup
Delete e2e/repro/ and e2e/helpers/firefox-timed-event-harness.ts; remove 4 test:e2e:repro* scripts (package.json), "repro/**/*.ts" include (tsconfig.json), repro eslint exemption block (keep helpers/settle.ts block), repro/ from e2e/AGENTS.md line 5, and "repro entrypoints" from frontend/AGENTS.md Browser Verification line. Then `graphify update .`.

### Verification
e2e lint/fmt:check/typecheck; run each new spec isolated (firefox-desktop, -g), then full firefox-desktop project; artifacts under /tmp/opencode/timeful-e2e-artifacts. Frontend unchanged (no frontend checks needed). format:markdown from repo root for changed Markdown files (e2e/AGENTS.md, frontend/AGENTS.md).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Executed per the handoff (ses_f8444a92cffeof4o49JL2zo7u4). Fixed the outstanding oxlint error in readTimeGridHeaderGeometry by removing the unnecessary `?? ""` after htmlChild.textContent and making the evaluate-local normalizeText accept string | null | undefined so the null-safe intent survives (e2e lint + typecheck pass).

Fixture diagnosis 1 (spec 1): first run failed the white-cell count (5 not 4 per column). buildUtcSpecificTimesRangeInstants treats endHour/endMinute as an INCLUSIVE slot start, so endHour 23/endMinute 0 seeded 00:00-01:00 inclusive (5 cells) instead of the scenario's 00:00-01:00 range (4 cells). Fixed the seed to endHour 22/endMinute 45; not an app bug.

Fixture diagnosis 2 (spec 2, user-approved): Test A (event-page view state) rendered 3 UNIQUE columns (jun 13/14/15) at UTC+6, not AC #3's 'exactly 2'. Root cause: the view state derives columns from the derived enabled domain (canonicalTimedSlots -> getEventEnabledSlots, useCalendarGrid.ts:743-753), which is always full Bangkok civil days per the server contract, so it crosses the +6 display midnight and legitimately adds jun 13. The unit test at useCalendarGrid.test.ts:826 only showed picked-date columns because its incomplete event shape made derived enabled slots empty (fallback to active slots). The duplication bug itself is absent (labels unique, browser-confirmed). User chose to assert 3 at +6 and amend AC #3; spec comments record the diagnosis.

Spec 2 also covers the SET_SPECIFIC_TIMES edit grid (3 unique labels jun 13/14/15 at +6, 2 at +7), per the earlier user-approved two-test decision; the 89-slot estimate was corrected to 96 (17:00Z Jun 14 through 16:45Z Jun 15 inclusive at 15 min = 28 + 68, matching the deleted repro's generator).

Cleanup: e2e/repro/ (7 scripts + scenarios/) and e2e/helpers/firefox-timed-event-harness.ts deleted via git rm after re-verifying no references outside repro/; removed the 4 test:e2e:repro* scripts, the repro tsconfig include, the repro eslint exemption block (helpers/settle.ts block kept), repro/ from e2e/AGENTS.md, and 'repro entrypoints' from frontend/AGENTS.md. e2e/helpers/visual-gap-helpers.ts kept - it is imported by a tracked spec. graphify update . run after code changes.

Verification evidence: e2e npm run lint, fmt:check, typecheck all pass; each new test passed in isolation (firefox-desktop -g), then the full firefox-desktop project passed 28/28 with 2 pre-existing conditional skips (postgres-plugin, timerange-width) and no new failures. Repo-root npm run format:markdown run; changed Markdown diffs are exactly the intended single-line edits. Frontend source untouched (docs-only line in frontend/AGENTS.md).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Converted the two remaining `e2e/repro/` diagnostic scripts that encode real regression behaviors into Playwright `firefox-desktop` specs, added two grid helpers, and removed the entire repro area and its wiring. Frontend source untouched.

### New regression specs

- `e2e/specs/timed-event-date-added-header-layout-firefox.spec.ts` — date-added header layout regression (FR-002/FR-013/FR-051). Seeds a Europe/Paris event (June 2026 CEST) with 00:00-01:00 Paris active slots on Jun 3-4, switches the in-app Display Timezone to +02:00 (Europe/Brussels menu entry), adds Jun 9 in the edit dialog, and asserts exactly 3 Projected Date Columns with unique labels (jun 3/jun 4/jun 9), no spacer between the consecutive Jun 3/Jun 4 columns, exactly one design-pinned spacer before Jun 9 (commented as not FR-mandated), 8 active cells confined to columns 0-1, and none in the Jun 9 column. The deleted scenario doc's 16 steps are preserved verbatim as a comment block.
- `e2e/specs/timed-event-viewer-tz-column-duplication-firefox.spec.ts` — viewer-TZ column duplication regression (FR-013 + FR-002). Seeds an Asia/Bangkok event with slots spanning midnight (96 slots, Jun 14 17:00Z through Jun 15 16:45Z; the task's 89 estimate corrected in comments), then switches the Display Timezone to UTC+6 (Asia/Dhaka) and UTC+7 (Asia/Bangkok) in both the event-page view state and the SET_SPECIFIC_TIMES edit grid, asserting unique Civil Date labels at each offset (3 unique at +6 — the full-day enabled domain crosses display midnight; exactly jun 14/jun 15 at +7). Historical bug arithmetic, POSIX Etc/GMT-N mapping, and the user-approved AC amendment are recorded in comments.

### Helpers (`e2e/helpers/timed-event-helpers.ts`)

- `changeDisplayTimezone` — grid-page (sidebar) Display Timezone switcher scoped to avoid the editor card's Event Timezone select; verifies the selection via full-label-or-compact-offset.
- `readTimeGridHeaderGeometry` — reads day-column labels plus spacer boxes with geometry so specs can assert spacer count and placement. Fixed the outstanding oxlint `no-unnecessary-condition` error by making the evaluate-local normalizer accept `string | null | undefined`.

### Cleanup

Deleted `e2e/repro/` (7 scripts + scenarios/) and `e2e/helpers/firefox-timed-event-harness.ts` after verifying no remaining references. Removed the 4 `test:e2e:repro*` npm scripts, the `repro/**/*.ts` tsconfig include, the repro eslint exemption block (kept the `helpers/settle.ts` block), `repro/` from `e2e/AGENTS.md`, and "repro entrypoints" from `frontend/AGENTS.md`. Ran `graphify update .`.

### Tests

- e2e `npm run lint`, `npm run fmt:check`, `npm run typecheck`: pass.
- Each new test passed in isolation via `npm run test:e2e -- --project=firefox-desktop -g`.
- Full `firefox-desktop` project: 28 passed, 2 pre-existing conditional skips, no new failures (isolated Playwright stack, 5.2 min).
- Repo-root `npm run format:markdown` run; changed Markdown diffs are exactly the intended single-line edits.

### Notable diagnoses

- Spec 1 fixture fix: `buildUtcSpecificTimesRangeInstants` treats `endHour/endMinute` as an inclusive slot start; the seed now ends at 22:45Z to express the 00:00-01:00 Paris range (4 cells/column).
- AC #3 amended (user-approved): the view state derives columns from the derived enabled domain (always full civil days), which legitimately renders jun 13 at UTC+6; the duplication bug itself is confirmed absent (unique labels, browser-verified).

### Risks / follow-ups

- None known. The two converted specs now guard FR-002/FR-013 at the browser level; FR-051's proposed wording is asserted as current behavior in spec 1.
<!-- SECTION:FINAL_SUMMARY:END -->
