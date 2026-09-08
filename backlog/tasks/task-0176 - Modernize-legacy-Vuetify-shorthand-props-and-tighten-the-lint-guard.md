---
id: TASK-0176
title: Modernize legacy Vuetify shorthand props and tighten the lint guard
status: To Do
assignee: []
created_date: '2026-09-08 12:11'
labels:
  - frontend
  - vuetify
dependencies:
  - TASK-0171
  - TASK-0172
  - TASK-0173
references:
  - frontend/eslint/rules/noLegacyVBtnPropsRule.ts
  - frontend/src/views/Landing.vue
  - frontend/src/views/Event.vue
priority: medium
type: chore
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the Tailwind v4 and Vuetify v4 upgrades (TASK-0171, TASK-0172, TASK-0173), legacy Vuetify 2-era shorthand props remain in frontend templates. Modernize them to explicit current-version props and close the lint-guard gaps that let them through. Appearance parity is required: rendered icon and button sizes must not change.

Legacy usage inventory (2026-09-08 audit):
- Roughly 25 v-icon shorthand occurrences: `small`, `x-small`, and `left small` on v-icon in EventItem.vue, sign_up_form/SignUpBlock.vue, CreateSpeedDial.vue, home/Dashboard.vue, schedule_overlap/RespondentsList.vue, NewEvent.vue, AuthUserMenu.vue, general/UserChip.vue, UpvoteRedditSnackbar.vue, schedule_overlap/EditingAvailabilityAs.vue, ScheduleOverlapMobileOverlay.vue, ScheduleOverlapDaysOnlyGrid.vue, ScheduleOverlapTimeGrid.vue.
- v-btn legacy props that bypass frontend/eslint/rules/noLegacyVBtnPropsRule.ts: views/Landing.vue has bare `large` plus `:x-large="display.mdAndUp"` (large/x-large are absent from the rule map), and views/Event.vue has bound `:small="isPhone"` and `:icon="isPhone"` (the rule skips bound directives entirely).

Outcome: all templates use explicit current-version props (size/icon), and the lint guard covers the full legacy-prop surface including v-icon and bound props, so the modernization cannot regress.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Grep gate: zero legacy shorthand props remain in frontend/src templates (no bare small/x-small/large/left/right on v-icon; no bare or bound legacy size props on v-btn)
- [ ] #2 The legacy-prop lint guard rejects large and x-large on v-btn and no longer skips bound :prop directives
- [ ] #3 v-icon legacy shorthand (small, x-small, large, left, right) is rejected by lint with replacement guidance
- [ ] #4 Lint-rule regression unit tests cover the new cases (bare large, bound :small, v-icon small)
- [ ] #5 Rendered icon and button sizes are visually unchanged on desktop and mobile, and the required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
