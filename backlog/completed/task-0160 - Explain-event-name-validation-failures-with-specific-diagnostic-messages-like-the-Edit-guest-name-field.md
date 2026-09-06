---
id: TASK-0160
title: >-
  Explain event name validation failures with specific diagnostic messages like
  the Edit guest name field
status: Done
assignee:
  - opencode
created_date: '2026-09-06 11:02'
updated_date: '2026-09-06 11:31'
labels:
  - frontend
dependencies: []
references:
  - frontend/src/components/NewEvent.vue
  - frontend/src/composables/event/useEventEditorState.ts
  - frontend/src/utils/guestName.ts
  - frontend/src/components/schedule_overlap/EditingAvailabilityAs.vue
modified_files:
  - frontend/src/components/NewEvent.vue
  - frontend/src/components/NewEvent.test.ts
priority: medium
type: enhancement
ordinal: 171300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The new-event/edit-event form's name field (frontend/src/components/NewEvent.vue) currently shows only a generic "Event name is required" message (shared required rule from frontend/src/composables/event/useEventEditorState.ts) plus the FR-119 100-character rule message. The diagnostic under the input should instead explain what is actually wrong with the input, following the Edit guest name field's pattern (frontend/src/components/schedule_overlap/EditingAvailabilityAs.vue + frontend/src/utils/guestName.ts): a coded validator with one specific explanatory message per failure mode.

Failure modes to cover:
- Empty or whitespace-only name: currently whitespace-only values pass the required rule (`!!value`) and are blocked only by the silent `hasName` submit gate; this must get an explanatory message. Follow the established precedent from TASK-0158 that the required-class message explains non-emptiness (for example "must be non-empty") and shows immediately, without requiring blur or a save attempt, like the Edit guest name dialog.
- Over-length name: keep the FR-119 100-character cap and its explanatory message (reachable via legacy >100-character names in edit mode; maxlength="100" on the field stays).
- Any other failure mode only if it is a real, validated constraint for event names; do not import guest-specific semantics such as the objectIdLike account-ID check. If control/format-only characters are not validated anywhere for event names, either validate and explain them consistently with the guest-name precedent or leave them out deliberately and record the decision.

Constraints:
- Keep the TASK-0141 invalid-field treatment (single red outline, red message, red alert icon) driven by the same validation state; only the messages and their trigger semantics change.
- Keep the empty-name early-return guard in submit() as a backstop.
- The shared nameRules in useEventEditorState.ts are also consumed by NewSignUp.vue, whose name field has no "(required)" label; do not regress it (TASK-0140 constraint).
- Preserve event-editor behavior: enter-to-blur, reset flows, and the edit hydration path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An empty event name in the new-event/edit-event form shows a diagnostic message that explains the name must be non-empty, displayed immediately without requiring blur or a save attempt
- [x] #2 A whitespace-only event name is treated the same as empty: it shows the non-empty diagnostic message immediately and is not silently accepted by the field rules while being blocked only by the submit gate
- [x] #3 An over-length event name (for example a legacy >100-character name in edit mode) shows a diagnostic message that explains the 100-character limit
- [x] #4 Every failure mode the implementation validates has its own explanatory message; no failure mode that blocks submission is left without an explanatory diagnostic
- [x] #5 The TASK-0141 single-error treatment (red outline, red message, red alert icon) still works for all failure modes
- [x] #6 The sign-up form name field in NewSignUp.vue keeps its current validation behavior and messages
- [x] #7 Unit tests cover each failure mode's diagnostic message and the immediate-required display semantics
- [x] #8 npm run lint, fmt:check, typecheck, build, and test:unit pass from frontend/, and affected e2e specs pass
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
Research findings (verified against installed Vuetify 3 source):
- The v-form's `lazy-validation` attr is a Vuetify 2 leftover; Vuetify 3's makeFormProps defaults validateOn to "input" (node_modules/vuetify/lib/composables/form.js:16) and no validate-on prop is set on the form or the name field, so field rules run live on every model change (validation.js:102-113), silently on mount (pristine, no visible error), and on blur. Therefore rules-driven validation already gives "immediately without blur/save-attempt" once the user types or blurs; a pristine untouched empty form correctly shows nothing (empty is the normal initial state of the New event form, unlike the guest dialog where empty is abnormal).
- Current whitespace-only gap: the shared required rule `(value) => !!value` passes for " ", so whitespace-only names show no diagnostic while the Create button is silently disabled by the hasName submit gate.
- NewSignUp.vue (line 41/368) consumes the shared nameRules for its event-name field (placeholder "Name your event..."), so useEventEditorState.ts must stay untouched.
- The NewEvent.test.ts v-text-field stub accepts maxlength as [Number, String], so binding the exported constant is safe.
- e2e specs have no references to the old "Event name is required" text or the name-field classes; only NewEvent.test.ts:1385-1394 asserts the current 2-rule behavior.
- FR-119 (docs/requirements/functional/fr/FR-119.md) requires blocking >100-char event names on save; message wording "Event name must be 100 characters or fewer" is already in place and stays.

Plan:
1) New frontend/src/utils/eventName.ts mirroring utils/guestName.ts: export EVENT_NAME_MAX_LENGTH = 100, EventNameValidationCode = "required" | "tooLong", validateEventName (required when not a string or trim-empty; tooLong when the raw value exceeds EVENT_NAME_MAX_LENGTH, preserving current .length semantics and maxlength alignment), and getEventNameValidationMessage (required -> "Event name must be non-empty" per the TASK-0158 user-approved precedent; tooLong -> the existing 100-character message).
2) NewEvent.vue: replace eventNameRules with a single validator-driven rule `(value) => getEventNameValidationMessage(validateEventName(value).code) ?? true` (same pattern as the guest dialog rule); remove the local EVENT_NAME_MAX_LENGTH const and the now-unused nameRules destructure; bind :maxlength="EVENT_NAME_MAX_LENGTH" on the field. useEventEditorState.ts is untouched. Error styling (red outline, message, alert icon), submit() empty-name guard, enter-to-blur, and reset flows are unchanged.
3) Tests: new frontend/src/utils/eventName.test.ts mirroring guestName.test.ts (empty/whitespace/null -> required, 100 vs 101 chars, messages). Update NewEvent.test.ts name-field test: single rule, "" and whitespace-only return "Event name must be non-empty", valid values return true, 101 chars returns the length message, maxlength prop is number 100 and the DOM attr stays "100".
4) Checks: npm run lint, fmt:check, typecheck, build, test:unit from frontend/; then affected e2e specs via npm run test:e2e -- --project=firefox-desktop (create + edit).

Scope decisions recorded:
- No invalidFormatting code for event names: no server constraint and no FR validates control/format characters for event names (server only enforces binding:"required"); adding one would create a frontend-only constraint. Guest-specific objectIdLike is likewise not applicable to creator-chosen event titles.
- The tooLong check stays on the raw value length (UTF-16 .length), matching the browser maxlength=100 units and the current shipped rule; no normalization of the submitted name is added (out of scope).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The event name field in the new-event/edit-event form now explains what is wrong with the input using a coded validator, mirroring the Edit guest name field pattern.

Changes:
- New frontend/src/utils/eventName.ts (mirrors utils/guestName.ts): exports EVENT_NAME_MAX_LENGTH = 100, EventNameValidationCode ("required" | "tooLong"), validateEventName (required for empty/whitespace-only/non-string, tooLong past 100 raw characters), and getEventNameValidationMessage ("Event name must be non-empty" per the TASK-0158 precedent; "Event name must be 100 characters or fewer" unchanged).
- frontend/src/components/NewEvent.vue: eventNameRules is now a single validator-driven rule `(value) => getEventNameValidationMessage(validateEventName(value).code) ?? true` — the same pattern as the guest dialog rule; removed the shared nameRules spread (useEventEditorState.ts untouched, so NewSignUp.vue keeps its current behavior), the local EVENT_NAME_MAX_LENGTH const, and the literal maxlength="100" is now `:maxlength="EVENT_NAME_MAX_LENGTH"`. The TASK-0141 error treatment (single red outline, red message, red alert icon), the submit() empty-name guard, enter-to-blur, and reset/hydration flows are unchanged.
- Whitespace-only names are no longer silently accepted by the field rules (the old `!!value` rule passed them); they now show the non-empty message immediately, and the disabled Create button is explained.
- Scope decisions recorded in the plan: no invalidFormatting or objectIdLike codes for event names (no server constraint or FR validates formatting for event names; objectIdLike is guest-specific); the tooLong check uses raw UTF-16 length to match browser maxlength semantics and the prior rule.

Trigger semantics: Vuetify 3's form validateOn defaults to "input", so rules run live on every keystroke — empty/whitespace-only and over-length messages appear immediately while typing (no blur or save attempt needed); a pristine untouched form still shows nothing, which is correct for the New event form where empty is the initial state.

Tests: new src/utils/eventName.test.ts (required/valid/tooLong/message mapping); NewEvent.test.ts name-field test updated to single-rule behavior with empty, whitespace-only, valid, 100-char, and 101-char cases plus the numeric maxlength binding.

Concurrent-session note: TASK-0161 (GuestDialog) WIP was in flight in the shared worktree during this task's check runs; its transient lint error (unused import) was not from this task and was fixed by that session before final verification. All final checks ran clean on the shared tree.

Verification:
- npm run lint: 0 errors (2 pre-existing vue/one-component-per-file warnings in NewEvent.test.ts); fmt:check, typecheck, build: pass.
- npm run test:unit: 140 files / 1034 tests pass, including the new eventName suite and updated NewEvent name-field assertions.
- e2e firefox-desktop: timed-event-create-firefox.spec.ts 6/6 pass; timed-event-specific-times-edit-firefox.spec.ts 4/4 non-tooltip tests pass. The 2 slot-tooltip tests fail both with and without this task's changes (proven via a stash-and-rerun A/B); they are a pre-existing regression from the collapseDisabledTimes default change (commit e16791e0) and are unrelated to event name validation — follow-up recommended for the owners of that change.
<!-- SECTION:FINAL_SUMMARY:END -->
