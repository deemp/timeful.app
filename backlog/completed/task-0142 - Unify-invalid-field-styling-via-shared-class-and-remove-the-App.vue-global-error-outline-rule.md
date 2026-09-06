---
id: TASK-0142
title: >-
  Unify invalid-field styling via shared class and remove the App.vue global
  error outline rule
status: Done
assignee:
  - opencode
created_date: '2026-09-02 14:49'
updated_date: '2026-09-06 12:50'
labels:
  - frontend
dependencies: []
references:
  - TASK-0141
  - frontend/src/App.vue
  - frontend/src/index.css
  - frontend/src/components/NewSignUp.vue
  - frontend/src/components/NewGroup.vue
  - frontend/src/components/GuestDialog.vue
  - frontend/src/components/sign_up_form/SignUpForSlotDialog.vue
  - frontend/src/components/event/EmailInput.vue
  - frontend/src/components/schedule_overlap/ConfirmDetailsDialog.vue
  - frontend/src/components/schedule_overlap/EditingAvailabilityAs.vue
modified_files:
  - frontend/src/App.vue
  - frontend/src/index.css
  - frontend/src/components/NewEvent.vue
  - frontend/src/components/NewSignUp.vue
  - frontend/src/components/NewGroup.vue
  - frontend/src/components/GuestDialog.vue
  - frontend/src/components/sign_up_form/SignUpForSlotDialog.vue
  - frontend/src/components/event/EmailInput.vue
  - frontend/src/components/schedule_overlap/ConfirmDetailsDialog.vue
  - frontend/src/components/schedule_overlap/EditingAvailabilityAs.vue
priority: medium
type: enhancement
ordinal: 155300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: every rules-driven invalid field in the app shows one consistent invalid treatment using the brand error color (Vuetify theme error #DB1616 from src/plugins/vuetify.ts) with no per-component color overrides and no doubled outlines.

Context:
- App.vue (~line 399) carries a Vuetify 2-era global rule: `.v-input--error .v-field, .v-field--error { outline: red solid; border-radius: 3px; }`. A CSS outline ignores the Vuetify label notch, so on outlined fields it draws a second outline crossing the floating label. Outlined fields already get a native red border in error state, so the outline is harmful duplication there; solo fields (no native border) currently rely on it as their only red border cue.
- Error-capable fields inventory: NewEvent.vue name field (outlined; migrated in TASK-0141 with temporary scoped overrides), NewSignUp.vue name field (solo), NewGroup.vue (solo), GuestDialog.vue (solo), sign_up_form/SignUpForSlotDialog.vue (solo), event/EmailInput.vue (solo), schedule_overlap/ConfirmDetailsDialog.vue (outlined).
- NewEvent.vue currently holds temporary scoped rules (outline: none, append-inner icon visibility, 2px border width) that should migrate into the shared treatment.

Outcome details:
- Add a shared invalid-field class in frontend/src/index.css following the .timeful-solo-field pattern: outlined fields keep the native theme-error border with a 2px width override; solo fields get an outline replacement colored by the theme error; append-inner icon space is hidden until error and shown on error.
- Remove the App.vue global rule, including its border-radius: 3px side effect.
- Adopt the class (plus append-inner-icon="mdi-alert-circle" where the alert icon is wanted) on the inventoried fields.
- Confirm the design/user intent that solo forms change from the current pure-red outline to the brand theme-error treatment.
- Update unit style-contract tests and run affected e2e specs for the migrated forms.

Follow-up to TASK-0141 (single bold red invalid state for the event name field).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 App.vue no longer styles error fields with an outline or border-radius
- [x] #2 A single shared invalid-field class in frontend/src/index.css implements the invalid treatment for outlined and solo variants
- [x] #3 NewEvent.vue name field uses the shared class with no duplicate local invalid-state rules
- [x] #4 NewSignUp and the other inventoried rule-driven fields adopt the shared treatment using the theme error color
- [x] #5 No component-local raw palette values remain for invalid-field styling
- [x] #6 npm run lint + fmt:check + typecheck + build + test:unit pass and affected e2e specs pass
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [x] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `.timeful-invalid-field` to frontend/src/index.css after `.timeful-solo-field`: neutralize `.v-field` outline, hide `__append-inner` until `.v-input--error`, 2px `.v-field__outline` border width on error (outlined), and `outline: 2px solid rgb(var(--v-theme-error))` on `.v-field--variant-solo` on error (solo replacement for the removed App.vue rule).
2. Remove the App.vue `/** Error color */` global rule (outline + border-radius).
3. Outlined name fields: replace local classes (`new-event-name-field`, `guest-dialog__name-field`, `editing-availability-as__guest-name-field`) with `timeful-invalid-field` and delete the duplicated local CSS blocks (GuestDialog and EditingAvailabilityAs lose their entire style blocks).
4. Outlined adopters: ConfirmDetailsDialog email combobox, TimefulImportDialog event URL field.
5. Solo adopters (add class next to `timeful-solo-field`): GuestDialog email, NewGroup name, NewSignUp name, SignUpForSlotDialog name + email, EmailInput combobox, SignIn email + otp, SignInDialog email + otp, ICSCredentials feed URL. These keep a themed invalid cue after App.vue rule removal ( SignIn/SignInDialog/ICSCredentials/TimefulImportDialog were missing from the original inventory; they are error-capable so they are adopted per the outcome "every rules-driven invalid field").
6. Skip `v-input` wrappers carrying selectedDaysRules (NewEvent, NewGroup, NewSignUp): they render no `.v-field`, so neither the App.vue rule nor the shared class applies to them.
7. Update style-contract tests: NewEvent.test.ts (assert shared class via appCssSource pattern), GuestDialog.test.ts and EditingAvailabilityAs.test.ts (add readFileSync appCssSource, assert shared class usage, no local style block, index.css contract).
8. Verify: lint, fmt:check, typecheck, build, test:unit, then affected e2e specs.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-06 09:40
---
Inventory update from TASK-0158's follow-up round: the Edit guest name dialog field (schedule_overlap/EditingAvailabilityAs.vue) is another outlined error-capable field that currently carries a scoped copy of the NewEvent outline neutralization (class editing-availability-as__guest-name-field); migrate it onto the shared invalid-field class when this task executes.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Unified invalid-field styling behind a single shared class and removed the Vuetify 2-era global error outline.

Changes:
- frontend/src/index.css: added `.timeful-invalid-field` after `.timeful-solo-field`. Outlined fields: neutralize `.v-field` outline, hide `__append-inner` until `.v-input--error`, 2px `__outline` border width on error. Solo fields: `outline: 2px solid rgb(var(--v-theme-error))` on `.v-field--variant-solo` in error (brand error #DB1616 from src/plugins/vuetify.ts replaces the old raw `red` global outline).
- frontend/src/App.vue: removed the `/** Error color */` global rule (`.v-input--error .v-field, .v-field--error { outline: red solid; border-radius: 3px }`).
- Replaced the three duplicated local CSS blocks with the shared class: NewEvent name field (`new-event-name-field`), GuestDialog guest name (`guest-dialog__name-field`), EditingAvailabilityAs guest-name dialog field (`editing-availability-as__guest-name-field`); GuestDialog and EditingAvailabilityAs no longer have any style block.
- Adopted the shared class on the remaining error-capable fields, including four missing from the original inventory: outlined ConfirmDetailsDialog email combobox and TimefulImportDialog URL field; solo GuestDialog email, NewGroup name, NewSignUp name, SignUpForSlotDialog name + email, EmailInput combobox, SignIn email + otp, SignInDialog email + otp, ICSCredentials feed URL. `v-input` wrappers carrying selectedDaysRules were skipped: they render no `.v-field`, so neither the removed rule nor the shared class applied to them.
- Visual delta: outlined fields unchanged; solo fields shift from pure-red 3px-radius outline to 2px brand #DB1616 outline following the field radius; append-inner alert icon now appears only in error state on fields that declare one.

Verification:
- Unit style-contract tests updated in NewEvent.test.ts, GuestDialog.test.ts, EditingAvailabilityAs.test.ts (assert shared class usage, no local overrides, and the index.css contract via readFileSync("src/index.css")).
- npm run lint (0 errors; 2 pre-existing vue/one-component-per-file warnings in NewEvent.test.ts), fmt:check (after oxfmt reordering the ConfirmDetailsDialog class attribute), typecheck, build, test:unit (140 files, 1034 tests) all pass.
- E2E (firefox-desktop, isolated test stack): full affected set of 12 specs green — 16 passed, 2 conditional skips, including all 6 timed-event-specific-times-edit tests. Two earlier failures were environmental, not caused by this change: the seed-assertion failure in timed-event-time-format-toggle-alignment reproduced only while a concurrent session was operating the e2e stack (A/B via file-scoped stash: passes clean, passes with this change), and the specific-times-edit tooltip failures matched TASK-0162's pre-existing regression whose locator fix is already in the working tree and now passes.
- Note: TASK-0162 (separate, in progress) remains the owner of that spec's tooltip fix.
<!-- SECTION:FINAL_SUMMARY:END -->
