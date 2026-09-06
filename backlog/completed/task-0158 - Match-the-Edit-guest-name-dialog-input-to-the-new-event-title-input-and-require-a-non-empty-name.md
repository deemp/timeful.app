---
id: TASK-0158
title: >-
  Match the Edit guest name dialog input to the new event title input and
  require a non-empty name
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-04 16:31'
updated_date: '2026-09-06 10:45'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 169300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Edit guest name dialog in the frontend (frontend/src/components/schedule_overlap/EditingAvailabilityAs.vue) shows a "Guest name" filled-variant field with no in-field validation; an empty name only surfaces a toast from the save action. Restyle the field to match the New event form's title input (variant="outlined", "(required)" label suffix, hide-details="auto"), drop the now-unneeded bg-color="white" filled-variant workaround, and add non-empty validation using the canonical guest-name validator from frontend/src/utils/guestName.ts, gating Save/Enter behind form validation so saveGuestName is only emitted for valid names. Scope is limited to this dialog's field and its component tests; no reusable wrapper component (evaluated and rejected as too thin a pass-through).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The guest name field in the Edit guest name dialog (EditingAvailabilityAs.vue) uses variant="outlined", label "Guest name (required)", and hide-details="auto", matching the New event name field's input style
- [x] #2 Saving with an empty or whitespace-only name shows the inline validation message from the canonical guest-name validator and does not emit saveGuestName
- [x] #3 A valid name emits saveGuestName via both the Save button and Enter key, and the Cancel action behaves as before
- [x] #4 The required frontend checks pass: lint, fmt:check, typecheck, build, and unit tests
- [x] #5 Blurring the guest name field (clicking outside) with an empty or whitespace-only name shows the inline required-name message before Save is clicked, and blurring with a valid name shows no message
- [x] #6 The invalid guest name field shows a single error outline matching the New event name field treatment: the App.vue global red error outline is neutralized and the native theme-error border is 2px
- [x] #7 The guest name input disallows typing or pasting a name longer than the canonical allowed length: the field binds maxlength to the exported GUEST_NAME_MAX_LENGTH
- [x] #8 The inline required-name message reads "Name must be non-empty" instead of "Name is required"
- [x] #9 The required-name message shows immediately whenever the input value is empty or whitespace-only, without requiring blur or a save attempt
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
1. No reusable component: surveyed six "required name" fields; variants and validation semantics diverge, a wrapper would forward the whole VTextField API, and the codebase shares styling via classes (timeful-solo-field) plus shared validators (utils/guestName.ts). Reuse validateGuestName + getGuestNameValidationMessage for the rule.
2. In EditingAvailabilityAs.vue: change the dialog's v-text-field to variant="outlined", label "Guest name (required)", hide-details="auto"; remove bg-color="white" (outlined has no gray fill); keep autofocus and the model-value relay.
3. Add guestNameRules = [(v) => getGuestNameValidationMessage(validateGuestName(v).code) ?? true]; wrap the field in v-form ref="formRef"; Save and Enter call saveIfValid (await validate(), emit saveGuestName only when valid), mirroring NewEvent.vue's submit gate. Parent useGuestAvailabilityActions.saveGuestName empty-guard stays as backstop.
4. Extend EditingAvailabilityAs.test.ts: assert field props (variant, label, hide-details, rules behavior: empty/whitespace -> "Name is required", valid -> true); local v-form stub with controllable validate() to prove the gate (invalid -> no saveGuestName, valid -> emitted once); keep existing relay tests passing.
5. Run required frontend checks from frontend/: npm run lint, fmt:check, typecheck, build, test:unit. No e2e (component-level change covered by unit tests).
6. Verify the task file was renamed by the retitle, record final summary, mark Done.

Follow-up round (user-reported): the field validated only on Save because errors are driven solely by the submit-attempt flag; add @blur on the field to set the same flag so blur with an invalid name shows the inline message before Save (mirrors Vuetify's validate-on-blur UX).

The doubled red outline comes from the App.vue global Vuetify 2-era rule (.v-input--error .v-field { outline: red solid }); per the TASK-0141 precedent, add a component class with the same scoped neutralization NewEvent.vue uses (outline: none + 2px error border width), leaving the app-wide unification to TASK-0142; register this file in TASK-0142's inventory.

Extend EditingAvailabilityAs.test.ts: blur tests (invalid shows message without emitting, valid shows none), a class assertion in the style test, and a source-based style-contract test for the outline rules.

Follow-up round (user-requested, 2026-09-06): disallow typing or pasting a longer-than-allowed name by exporting GUEST_NAME_MAX_LENGTH from frontend/src/utils/guestName.ts and binding :maxlength on the dialog field; native maxlength blocks typing and truncates pastes and mirrors the NewEvent.vue title-input maxlength="100" precedent. Change the canonical required-name message from "Name is required" to "Name must be non-empty" in getGuestNameValidationMessage. Update guestName.test.ts and EditingAvailabilityAs.test.ts message assertions and extend the field style test with a maxlength regression assertion.

Next follow-up round (recorded for a new session, intentionally not implemented here): the validation message ("Name must be non-empty") shall show immediately whenever the input is empty, rather than appearing only after blur or a save attempt.

Follow-up round (user-confirmed semantics, 2026-09-06): show the required-name message immediately whenever the value is empty, including on dialog open, because the guest name cannot be empty; keep non-empty invalid codes (invalidFormatting, objectIdLike, tooLong) gated behind the blur/save-attempt flag so transient mid-typing states do not flash errors. Implementation: compute the canonical validator result once in guestNameValidation; guestNameErrorMessages returns the message unconditionally for the required code and via showSaveValidationError otherwise.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate mechanism: Save/Enter call saveIfValid, which consults the canonical guest-name validator (validateGuestName + getGuestNameValidationMessage from @/utils/guestName) and only emits saveGuestName when valid; an invalid save attempt sets showSaveValidationError, driving :error-messages (red inline "Name is required" under the outlined field via hide-details="auto"). The watch resets the attempt flag whenever the dialog opens; the parent useGuestAvailabilityActions.saveGuestName empty-toast guard is retained as backstop.

A v-form + rules + validate() gate (NewEvent's exact mechanism) was considered first, but the schedule-overlap tests stub v-text-field/v-form layers, so a form-based gate would have broken the real relay tests in EditingAvailabilityAs.test.ts and ScheduleOverlapMobileOverlay.test.ts and required a shared-stub change. The single-field dialog needs no form orchestration; error-messages driven by a submit-attempt flag mirrors NewEvent's submitAttempted/showSubmitError pattern with identical visible behavior.

variant="outlined" supersedes the earlier bg-color="white" filled-variant workaround (outlined fields have no gray fill), so bg-color was removed.

Test adjustments: added 6 regression tests (field style props; empty and whitespace-only blocked with inline message; valid save via Save and Enter; auto-clear on becoming valid; attempt-flag reset on reopen). Restored an accidentally dropped await cancelButton.trigger("click") in the existing cancel-relay test. ScheduleOverlapMobileOverlay.test.ts harness now seeds newGuestName: "d" in the overlay view model, mirroring the real open-dialog flow where the parent fills the name before the dialog opens; the test's re-emit intent is unchanged.

The task file was renamed on disk with mv because the Backlog MCP title edit updates content but not the file name (explicit user request).

Follow-up round: the blur behavior reuses the existing submit-attempt flag (@blur sets showSaveValidationError) instead of switching to :rules, keeping the relay tests' stub-based assertions intact while reproducing NewEvent's visible blur-validation behavior; the validator message computed already gates the flag's visibility. The outline fix copies the TASK-0141 scoped treatment (outline: none on .v-field in all states, --v-field-border-width: 2px on error) because the App.vue global rule is equal-or-lower specificity and the error-state selector (0,3,0) wins regardless of style-injection order; no append-icon rules were needed since this field has no append icon. EditingAvailabilityAs.vue was added to TASK-0142's inventory (references and modified files) so the future shared-class migration covers this dialog.

Follow-up round progress (2026-09-06): GUEST_NAME_MAX_LENGTH is exported from frontend/src/utils/guestName.ts and the canonical "required" message is now "Name must be non-empty"; GuestDialog.vue shares this validator, so its required message changes identically.

EditingAvailabilityAs.vue binds :maxlength="GUEST_NAME_MAX_LENGTH" on the guest name field, mirroring NewEvent.vue's native maxlength title-input precedent; the browser enforces the cap for both typing and pasting, and the tooLong validator message remains as a backstop.

Tests: guestName.test.ts asserts the new message, the six EditingAvailabilityAs.test.ts message assertions were updated, and the style test now asserts maxlength and was renamed to match NewEvent's "caps it at 100 characters" naming.

Verification: focused suites pass (guestName.test.ts + EditingAvailabilityAs.test.ts, 24/24), and all required checks pass: lint (0 errors, 2 pre-existing vue/one-component-per-file warnings), fmt:check (after one oxfmt fix to the test file), typecheck, build, and test:unit 1021/1021; acceptance criteria #4, #7, and #8 are marked complete and the task stays In Progress for the recorded next round.

SignUpForSlotDialog.vue keeps its own separate local "Name is required" message and was intentionally left unchanged as out of scope.

No Backlog MCP tools were available in this session, so this record is updated by hand at the user's request.

Follow-up round (2026-09-06): EditingAvailabilityAs.vue now computes the canonical validator result once (guestNameValidation) and shows the inline message immediately when the code is required (empty or whitespace-only), regardless of blur or save attempts; other invalid codes keep the showSaveValidationError gate (blur and invalid save set it; dialog reopen resets it). The @blur handler and the saveIfValid flag-setting remain for those codes. Tests: replaced the blur-with-empty test with immediate-message tests (empty and whitespace-only with no interaction; message appears as soon as a valid name is cleared), added a test pinning that an object-id-like name stays silent until blur, and rewrote the reopen test to use an object-id-like name so it still exercises the attempt-flag reset (with immediate required validation, reopening with an empty name shows the message again by design). Verification: focused suites 26/26; lint 0 errors (2 pre-existing warnings), fmt:check (after one oxfmt line-wrap), typecheck, build, and test:unit 1023/1023 all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restyled the Edit guest name dialog's field (frontend/src/components/schedule_overlap/EditingAvailabilityAs.vue) to match the New event form's title input and added required-name validation.

Changes:
- v-text-field now uses variant="outlined", label "Guest name (required)", hide-details="auto"; the filled-variant bg-color="white" workaround was removed (outlined fields have no gray fill).
- Validation reuses the canonical guest-name validator (validateGuestName + getGuestNameValidationMessage from @/utils/guestName) instead of new rule code. Save and Enter call saveIfValid, which emits saveGuestName only when the name is valid; an invalid attempt shows the inline message ("Name is required" for empty/whitespace). The attempt flag resets whenever the dialog opens, and the parent save action's empty-toast guard remains as backstop.
- No reusable wrapper component was introduced: the surveyed "required name" fields diverge in variant and validation semantics, and the codebase's established sharing granularity is CSS classes plus shared validators, making a wrapper a too-thin pass-through.

Verification:
- 6 new regression tests in EditingAvailabilityAs.test.ts: style props (variant/label/hide-details/autofocus), empty and whitespace-only names blocked with the inline message via both Enter and Save, valid names emitted via both paths, message auto-clears when the name becomes valid, and the attempt flag resets on reopen. Existing relay tests (including chip variant and Cancel) pass.
- ScheduleOverlapMobileOverlay.test.ts harness seeds newGuestName: "d" in the overlay view model, mirroring the real flow where the parent fills the name before the dialog opens; the re-emit test intent is unchanged.
- npm run lint: 0 errors (2 pre-existing unrelated vue/one-component-per-file warnings in NewEvent.test.ts).
- npm run fmt:check, npm run typecheck, npm run build: pass.
- npm run test:unit: 1014 of 1016 tests pass. The 2 failures are in ToolRow.test.ts ("Collapse disabled times switch" cases) and stem from the unrelated in-progress task-0159 work already present in the shared worktree (ToolRow.vue, ToolRow.test.ts, ScheduleOverlap.vue, and related files are modified by that WIP); none of this task's three changed files are in ToolRow's import chain.
- No e2e required: component-level change covered by unit tests.

Follow-up round (user-reported regression fixes):
- Blur validation: the field now sets the same submit-attempt flag on @blur, so clicking outside with an empty or whitespace-only name shows the inline "Name is required" message before Save (mirrors Vuetify's validate-on-blur UX); the Save/Enter gate, auto-clear on becoming valid, and reopen reset behave as before.
- Single error outline: the doubled red outline came from the App.vue global Vuetify 2-era rule (.v-input--error .v-field { outline: red solid }), the same root cause fixed for the event name field in TASK-0141. Added the identical scoped treatment via .editing-availability-as__guest-name-field (outline: none plus a 2px theme-error border on error); app-wide unification remains TASK-0142, whose inventory now includes this file.
- Tests: 3 new regression tests (blur-with-empty shows the message without emitting; blur-with-valid shows none; source-based style contract for the outline rules) plus a class assertion in the style test. Focused schedule-overlap suites pass (54 tests).
- All required checks now pass on the committed tree: lint 0 errors (2 pre-existing warnings), fmt:check, typecheck, build, and test:unit 1021/1021 (the previously failing ToolRow tests were resolved by the task-0159 commit e16791e0), so AC #4 is satisfied.

Follow-up round (immediate required-name message, 2026-09-06): the Edit guest name dialog now shows "Name must be non-empty" immediately whenever the input value is empty or whitespace-only — on dialog open and as soon as the user clears the field — without requiring blur or a save attempt. Non-empty invalid states (e.g. object-id-like names) remain gated behind blur or an invalid save attempt so mid-typing transients do not flash errors, and the reopen reset still clears that attempt flag. Tests updated/added in EditingAvailabilityAs.test.ts (immediate empty/whitespace display, immediate display on clearing, object-id gating on blur, reopen flag reset via an object-id-like name); all required checks pass: lint 0 errors (2 pre-existing warnings), fmt:check, typecheck, build, and test:unit 1023/1023.
<!-- SECTION:FINAL_SUMMARY:END -->
