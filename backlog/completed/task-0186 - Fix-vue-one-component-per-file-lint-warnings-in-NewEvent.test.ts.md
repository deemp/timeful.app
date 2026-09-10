---
id: TASK-0186
title: Fix vue/one-component-per-file lint warnings in NewEvent.test.ts
status: Done
assignee: []
created_date: '2026-09-08 15:25'
updated_date: '2026-09-08 15:45'
labels: []
dependencies: []
modified_files:
  - frontend/src/components/NewEvent.test.ts
priority: low
type: chore
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
npm run lint in frontend/ currently reports two vue/one-component-per-file warnings in src/components/NewEvent.test.ts (lines 195 and 223, on the VBtnStub and VTextFieldCaptureStub components defined with defineComponent). Clear these warnings so the frontend lint run is warning-free, using a fix consistent with how the other test stubs in the file are declared. Do not disable the rule or add eslint-disable suppressions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running npm run lint from frontend/ completes with 0 errors and 0 warnings
- [x] #2 The two vue/one-component-per-file warnings on VBtnStub and VTextFieldCaptureStub in src/components/NewEvent.test.ts are resolved without weakening or disabling the rule
- [x] #3 npm run test:unit passes with no changes to test behavior or coverage
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
Research findings:

- The warnings come from eslint-plugin-vue's vue/one-component-per-file rule (oxlint run is clean), reported at lines 195 and 223 on the two stubs defined with defineComponent: VBtnStub and VTextFieldCaptureStub.
- The rule counts "component definition" object expressions (defineComponent calls, export default objects); the file's other five stubs are plain-object components and are not counted.
- Sibling multi-stub test files (GuestDialog.test.ts, home/Dashboard.test.ts) silence the same warning with a file-level /* eslint-disable vue/one-component-per-file */ comment. This task's acceptance criteria explicitly forbid disabling/suppressing the rule, so that approach is out.
- Plain-object stubs are proven sufficient in this file: TimezoneSelectorStub, TimeFormatToggleStub, DatePickerModelStub, VCheckboxSlotStub, and VSwitchSlotStub are declared as plain objects and are used in global.stubs maps and even wrapper.getComponent(DatePickerModelStub).

Plan:

1. Convert VBtnStub (line 195) and VTextFieldCaptureStub (line 223) from defineComponent({...}) to plain object component options, matching the declaration style of the other stubs in the file (name, props, emits, template unchanged).
2. Remove defineComponent from the "vue" import in src/components/NewEvent.test.ts (nextTick and ref remain in use).
3. Verification: npm run lint (expect 0 errors/0 warnings), npm run fmt:check, npm run typecheck, npm run build, npm run test:unit — all from frontend/.

Risk: none expected; the stubs' props/emits/template are unchanged and the runtime component behavior in @vue/test-utils is identical for plain options objects.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial attribution was wrong: the warnings looked like they came from oxlint because npm run lint concatenates oxlint and eslint output, but isolated runs proved the reporter is eslint (eslint-plugin-vue), while oxlint is clean.

Investigated why only NewEvent.test.ts was flagged when other test files also declare multiple stubs: GuestDialog.test.ts and home/Dashboard.test.ts carry a file-level /* eslint-disable vue/one-component-per-file */ comment, and single-stub files do not trip the count>1 threshold.

Chose plain-object conversion over the sibling-file disable-comment convention because the task acceptance criteria forbid weakening or disabling the rule; plain-object stubs are already the dominant style in this file and are proven sufficient (e.g., wrapper.getComponent(DatePickerModelStub)).

During investigation, temporary __probe*.test.ts files were created under src/components/ for bisection and all were deleted afterward.

Checks run after the fix from frontend/: lint (0 errors, 0 warnings), fmt:check, typecheck, build, and test:unit (140 files, 1038 tests) — all passing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cleared the two vue/one-component-per-file warnings in frontend/src/components/NewEvent.test.ts.

What changed: VBtnStub and VTextFieldCaptureStub were the only stubs in the file declared with defineComponent(...); all other test stubs are plain-object component options, which the eslint-plugin-vue rule does not count. Both stubs were converted to plain object declarations with identical name, props, emits, and template, and defineComponent was removed from the "vue" import (nextTick and ref remain in use). No rule was disabled and no eslint-disable comment was added.

Context: sibling multi-stub test files (GuestDialog.test.ts, home/Dashboard.test.ts) suppress the same warning via a file-level eslint-disable comment, but this task's acceptance criteria explicitly forbade that approach, so the declaration-style fix was used instead.

Verification (all from frontend/): npm run lint reports 0 errors and 0 warnings; npm run fmt:check clean; npm run typecheck clean; npm run build succeeds; npm run test:unit passes 140 files / 1038 tests. No e2e run was needed because no runtime code changed and browser behavior is unaffected.

Risks/follow-ups: none. Other test files that legitimately need multiple defineComponent stubs remain suppressed by their existing file-level disable comments; converting them similarly could be a future cleanup if desired.
<!-- SECTION:FINAL_SUMMARY:END -->
