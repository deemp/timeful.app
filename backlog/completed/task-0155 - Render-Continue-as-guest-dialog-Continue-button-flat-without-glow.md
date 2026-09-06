---
id: TASK-0155
title: Render Continue-as-guest dialog Continue button flat without glow
status: Done
assignee: []
created_date: '2026-09-04 15:06'
updated_date: '2026-09-04 15:07'
labels:
  - styling
  - frontend
dependencies: []
modified_files:
  - frontend/src/components/GuestDialog.vue
  - frontend/src/components/GuestDialog.test.ts
  - frontend/src/index.css
type: enhancement
ordinal: 166300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a guest saves added availability, the Continue-as-guest dialog's Continue button uses the shared timeful-elevated-button styling, which adds a green glow shadow and border. The button shall instead be flat and without glow.

Outcome:
- Add a shared flat button class in frontend/src/index.css that zeroes box shadow, mirroring the existing shared elevated-button class pattern.
- Apply the flat class to the Continue button in frontend/src/components/GuestDialog.vue in place of timeful-elevated-button, keeping the green background and white text.
- Add unit regression coverage in frontend/src/components/GuestDialog.test.ts asserting the button carries the flat class and not the elevated class, and that the shared class zeroes box shadow in index.css.

Constraints:
- Scope is the Continue as guest dialog's Continue button only; do not change other elevated buttons such as the sign-up-for-slot dialog.
- Follow frontend styling rules: shared classes over framework-internal overrides, existing tokens over raw palette values.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Continue button in the Continue as guest dialog uses a shared flat button class with box shadow removed and without the elevated green glow or border
- [x] #2 A unit regression test asserts the Continue button carries the flat class and not the elevated class, and that the shared class zeroes box shadow in index.css
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added shared .timeful-flat-button class (box-shadow: none !important) in frontend/src/index.css and applied it to the Continue button in frontend/src/components/GuestDialog.vue in place of timeful-elevated-button, removing the green glow shadow and border while keeping the green background and white text. Added a GuestDialog.test.ts regression test asserting the flat class is applied, the elevated class is absent, and the shared class zeroes box shadow in index.css.

Evidence: targeted GuestDialog suite passes (7 tests) and full frontend unit suite passes (139 files, 1009 tests); lint, fmt:check, typecheck, and build all pass.

Delivered in commit 432bab9b. e2e was not run for this isolated styling change; behavior is covered by the unit regression test.
<!-- SECTION:FINAL_SUMMARY:END -->
