---
id: TASK-0142
title: >-
  Unify invalid-field styling via shared class and remove the App.vue global
  error outline rule
status: To Do
assignee: []
created_date: '2026-09-02 14:49'
updated_date: '2026-09-06 09:40'
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
- [ ] #1 App.vue no longer styles error fields with an outline or border-radius
- [ ] #2 A single shared invalid-field class in frontend/src/index.css implements the invalid treatment for outlined and solo variants
- [ ] #3 NewEvent.vue name field uses the shared class with no duplicate local invalid-state rules
- [ ] #4 NewSignUp and the other inventoried rule-driven fields adopt the shared treatment using the theme error color
- [ ] #5 No component-local raw palette values remain for invalid-field styling
- [ ] #6 npm run lint + fmt:check + typecheck + build + test:unit pass and affected e2e specs pass
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
created: 2026-09-06 09:40
---
Inventory update from TASK-0158's follow-up round: the Edit guest name dialog field (schedule_overlap/EditingAvailabilityAs.vue) is another outlined error-capable field that currently carries a scoped copy of the NewEvent outline neutralization (class editing-availability-as__guest-name-field); migrate it onto the shared invalid-field class when this task executes.
---
<!-- COMMENTS:END -->
