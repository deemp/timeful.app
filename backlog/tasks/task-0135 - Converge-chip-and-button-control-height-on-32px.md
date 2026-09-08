---
id: TASK-0135
title: Converge chip and button control height on 32px
status: To Do
assignee: []
created_date: '2026-09-02 10:27'
updated_date: '2026-09-08 15:42'
labels:
  - frontend
  - styling
  - design-tokens
dependencies:
  - TASK-0187
references:
  - frontend/src/App.vue
  - frontend/src/index.css
  - frontend/src/components/SignInGoogleBtn.vue
  - frontend/src/components/ExpandableSection.vue
  - frontend/src/components/TimeRangePicker.vue
  - frontend/src/components/general/UserChip.vue
  - frontend/src/components/EventItem.vue
  - frontend/src/components/home/Dashboard.vue
  - frontend/src/views/Event.vue
  - frontend/src/components/schedule_overlap/TimezoneSelector.vue
  - frontend/src/components/schedule_overlap/ScheduleOverlapCompactSwitch.css
  - frontend/src/components/TimeRangePicker.test.ts
  - frontend/src/components/schedule_overlap/TimezoneSelector.test.ts
documentation:
  - frontend/AGENTS.md
  - docs/design/architecture/adr/ADR-001.md
priority: medium
type: enhancement
ordinal: 148300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome

Converge the standard control height for chips and buttons on **32px** so chips, buttons, and the existing compact fields form one size scale. This decision was made in a sizing-inventory session (Sept 2026): 32px is the app's native chip height and the app is chip-heavy, so buttons move to chips instead of overriding chips away from the framework.

Fold-in decision (Sept 2026): adopt **Vuetify v4-native switch metrics** for the compact switch (see constraints and the discussion comment) instead of keeping v3-era pixel pins.

## Verified current state (frontend/src)

Vuetify defaults (recorded pre-v4-upgrade; re-verify against installed Vuetify v4 per TASK-0173 before implementing): v-btn 36px, v-chip 32px (chip "small" would be 26px, x-small 20px). Real heights in the app today: 20 / 26 / 28 / 32 / 36 / 38 / 40 / 58px, with two silent no-ops and one dead rule.

- `App.vue:361-369` — `.v-btn:not(.v-btn--round, .v-btn-toggle > .v-btn).v-size--default { height: 38px !important; border-radius: 0.375rem !important }` is dead CSS: `.v-size--default` is a Vuetify 2 class that does not exist in Vuetify 3+, so nothing matches. Buttons actually render at the Vuetify default 36px.
- `components/SignInGoogleBtn.vue:63` — custom 40px button (the only 40px control).
- `components/ExpandableSection.vue:79` — 38px min-height compact accordion header.
- `components/schedule_overlap/TimezoneSelector.vue` — compact fields/buttons already 32px (its test asserts these values); inline selects are 26px. No change needed; they converge automatically.
- `components/schedule_overlap/ScheduleOverlapCompactSwitch.css` — 28px switch track pinned with v3-era MD2 pixel metrics (38.4x22.4 track, 15.2 thumb, custom thumb translate math). Now in scope: migrate to Vuetify v4-native sizing via density props and `--v-switch-*` custom properties (`--v-switch-track-height`, `--v-switch-thumb-height/width`, `--v-switch-scale`); colors and borders remain `--timeful-*` token-driven.
- Legacy no-op chip props (Vuetify 2 booleans, inert attributes in Vuetify 3+, so these chips render default 32px): `components/EventItem.vue:48` (`small`), `components/home/Dashboard.vue:36` (`small`), `views/Event.vue:168` (`:small="isPhone"`, whose original intent was a smaller chip on phone).
- `components/general/UserChip.vue:4` — `size="x-small"` (20px) is the intended dense step for user chips; keep.
- `components/TimeRangePicker.vue:112` — `--time-range-chip-height: 58px` is an intentional two-line field, already pinned by `TimeRangePicker.test.ts`; keep as the documented exception.

## Constraints

- Follow `frontend/AGENTS.md` styling rules: use existing `--timeful-*` semantic tokens from `frontend/src/index.css` rather than component-local raw values; prefer layout-based fixes and plain selectors in non-scoped style blocks; use `:deep(...)` only in scoped styles, and prefer Vuetify CSS custom properties over internal-class overrides where a var exists (see TASK-0187); verify rendered selectors in the browser.
- Introduce one shared token (for example `--timeful-control-height: 32px`) in `index.css :root` and wire it into the button/chip sizing rules, so future changes are one-line. Vuetify exposes `--v-btn-height` / `--v-chip-height` custom properties that sizing rules can pin.
- Note: migrating the no-op `small` props to working `size="small"` would change rendered size (32 -> 26px). Preserve current rendered size unless the original phone-smaller intent is explicitly wanted; when in doubt keep 32px and flag in the task notes.
- Switch migration is a deliberate visual change: expect MD3 proportions (track/thumb size, travel, border treatment). Verify in the browser and pin the new values with CSS-assertion tests. Do not keep the old pixel pins alongside the new vars.
- Mobile touch targets (44px) are explicitly out of scope; a phone-density bump for primary actions is a possible follow-up task.
- After changing route/API annotations this would need swag regen, but this task is CSS-only; no swag or server changes expected.

## Suggested starting points

Read `frontend/AGENTS.md` first, then `frontend/src/index.css` (token home), `frontend/src/App.vue` (dead rule), and the component files listed above. The CSS-assertion test patterns in `frontend/src/components/TimeRangePicker.test.ts` and `frontend/src/components/schedule_overlap/TimezoneSelector.test.ts` show how sizing rules are pinned in this repo. `frontend/src/components/schedule_overlap/ScheduleOverlapCompactSwitch.css` is consumed via `<style scoped src>` by six components; changes there affect every consumer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All standard v-btn and v-chip controls render at a shared 32px height; no standard control remains at 36px, 38px, or 40px.
- [ ] #2 The dead .v-size--default rule in App.vue is removed or replaced with a Vuetify 3-valid rule driven by the shared token; button border-radius matches the app's existing 0.375rem convention (0.375rem is used in TimezoneSelector and .timeful-solo-field) with the rendered result verified in the browser.
- [ ] #3 The shared height token is defined in frontend/src/index.css :root as a --timeful-* semantic token and consumed by the sizing rules; no new scattered height literals and no new !important overrides beyond what existing overrides already use.
- [ ] #4 All legacy Vuetify 2 boolean chip size props (small / :small="isPhone") are migrated to explicit Vuetify 3 size props; no inert size attributes remain in the codebase.
- [ ] #5 The 58px TimeRangePicker chip and the x-small (20px) dense chips/icon buttons keep their current rendering; TimeRangePicker.test.ts and TimezoneSelector.test.ts stay green.
- [ ] #6 Sizing rules are covered by unit-test assertions in the style of the existing CSS-assertion specs (TimeRangePicker.test.ts), including a check that pins the shared token value.
- [ ] #7 npm run lint, npm run typecheck, npm run build, and npm run test:unit all pass in frontend/.
- [ ] #8 ScheduleOverlapCompactSwitch.css switches render with Vuetify v4-native MD3 metrics via density props and --v-switch-* vars; v3-era pixel pins (38.4x22.4 track, 15.2 thumb) and the custom thumb translate math are removed; colors stay token-driven; browser-verified and pinned by unit assertions
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: opencode
created: 2026-09-08 15:38
---
**Discussion record (Sept 2026, from a `:deep()` audit session) — needs a decision before implementation.**

Proposed fold-in: alongside converging controls to 32px, replace the v3-era MD2 pixel pins in `ScheduleOverlapCompactSwitch.css` (38.4x22.4 track, 15.2 thumb, 28px control height, custom thumb translate math) with Vuetify v4 native sizing driven by density props and `--v-switch-*` custom properties (`--v-switch-track-height`, `--v-switch-thumb-height/width`, `--v-switch-scale`).

Visual deltas are expected (MD3 proportions, border treatment, thumb travel), so this is a design decision, not a refactor: adopt v4-native switch metrics here, or keep the current pinned visuals?

Sequencing note: a value-exact `:deep()`-to-var migration task was created separately (value-preserving only, explicitly defers the pixel-pin question to this task). No dependency conflict either way, but doing the migration first keeps this task's diff focused on value changes.
---

author: opencode
created: 2026-09-08 15:42
---
**Decision (Sept 2026, audit session):** adopt Vuetify v4-native switch metrics. Scope now includes migrating ScheduleOverlapCompactSwitch.css from the v3-era MD2 pixel pins (38.4x22.4 track, 15.2 thumb, 28px control height, custom thumb translate math) to density props plus `--v-switch-*` custom properties. Colors and borders remain `--timeful-*` token-driven. Description and acceptance criteria updated; depends on TASK-0187 (value-exact var migration) landing first so this diff stays focused on value changes. Also re-verify the v-btn/v-chip default heights against installed v4 (TASK-0173 MD3 refresh) before implementing.
---
<!-- COMMENTS:END -->
