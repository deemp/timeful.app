---
id: TASK-0187
title: >-
  Replace :deep() Vuetify-internal overrides with Vuetify CSS custom properties
  where a value-exact var exists
status: To Do
assignee: []
created_date: '2026-09-08 15:38'
labels:
  - css
  - vuetify
dependencies: []
references:
  - frontend/src/components/schedule_overlap/ScheduleOverlapCompactSwitch.css
  - frontend/src/components/schedule_overlap/TimezoneSelector.vue
  - frontend/src/views/Event.vue
  - frontend/src/components/ExpandableSection.vue
  - frontend/src/components/schedule_overlap/TimezoneSelector.test.ts
  - frontend/src/views/Event.test.ts
documentation:
  - frontend/AGENTS.md
priority: low
type: chore
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

Reduce fragility from targeting Vuetify-internal class names across Vuetify upgrades by replacing scoped `:deep()` rules with Vuetify CSS custom properties set on owned wrapper classes — strictly where an installed Vuetify v4 var reproduces the current rendered value exactly. Pure, zero-visual-change refactor. Rules without a var equivalent stay as `:deep()`; that remains normal practice for structural overrides.

## Verified current state (Sept 2026 audit)

- ~70 `:deep(` matches in scoped styles: `frontend/src/components/schedule_overlap/ScheduleOverlapCompactSwitch.css` (shared via `<style scoped src>` by 6 components), `frontend/src/components/schedule_overlap/TimezoneSelector.vue`, `frontend/src/views/Event.vue`, `frontend/src/components/ExpandableSection.vue`, `frontend/src/components/landing/GithubStarButton.vue`.
- Var-based precedent already exists in-repo: `.schedule-overlap-compact-switch { --v-input-control-height: 28px; --v-input-padding-top: 0px }` and TimezoneSelector's `--v-field-padding-start: 8px`.
- Installed Vuetify v4 exposes (among others): `--v-input-control-height`, `--v-input-padding-top`, `--v-field-padding-start/end/top/bottom`, `--v-field-input-padding-top/bottom`, `--v-selection-control-size`, `--v-switch-scale`, `--v-switch-track-height`, `--v-switch-thumb-height/width`, `--v-field-border-width/opacity`.
- TASK-0185 already removed the invalid non-scoped `:deep()` usages; no invalid usages remain.

## Constraints

- Value-exact migration only: rendered computed styles must be identical before/after. Verify in browser (fast UI debug at `/test`, or e2e inspect) for the compact switch, timezone compact/inline selects, desktop header switches, availability toggle, and ExpandableSection toggle.
- Keep `:deep()` for structural/layout/transform/custom-border overrides that have no var (e.g. `min-width: 0`, `flex-wrap`, `display`, `order`, thumb `translate()` math, the 2px token border on the switch track). Do not introduce new `!important`.
- Do not change any rendered values. The v3-era pixel pins (38.4x22.4 track, 15.2 thumb, 28px control height) are TASK-0135 decision territory; keep them as-is here.
- Update CSS-assertion tests that pin current selectors (`TimezoneSelector.test.ts`, `Event.test.ts`).
- `GithubStarButton.vue`'s `:deep(> *)` is required (targets DOM injected imperatively by `github-buttons`); out of scope.
- Follow `frontend/AGENTS.md` styling rules.

## Bonus cleanup (same files, trivial)

Remove the redundant no-space `.compact-inline-select:deep(.v-input)` selectors in TimezoneSelector.vue (~lines 316 and 325): they duplicate the spaced variant in the same selector list and compile identically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every audited :deep() rule that has an existing installed-Vuetify-v4 var equivalent is replaced by a custom property set on the owned wrapper class, preserving the pre-change computed value (browser-verified)
- [ ] #2 Rules without var equivalents remain :deep() and unchanged in effect; no new !important and no rendered-value changes introduced
- [ ] #3 The redundant no-space .compact-inline-select:deep(.v-input) selectors in TimezoneSelector.vue are removed and TimezoneSelector.test.ts assertions updated
- [ ] #4 All CSS-assertion unit tests referencing changed selectors (TimezoneSelector.test.ts, Event.test.ts) are updated and pass
- [ ] #5 Required frontend checks pass: npm run lint, npm run fmt:check, npm run typecheck, npm run build, npm run test:unit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
