---
id: TASK-0166
title: Unify all frontend reds on one canonical hue with role-based tokens
status: To Do
assignee: []
created_date: '2026-09-06 16:20'
labels:
  - frontend
  - design-system
  - styling
dependencies: []
references:
  - frontend/src/index.css
  - frontend/tailwind.config.cjs
  - frontend/src/plugins/vuetify.ts
  - frontend/src/components/NewEvent.test.ts
  - >-
    backlog/completed/task-0156 -
    Soften-solid-event-page-Delete-buttons-from-bright-red-to-pale-red-fill.md
priority: medium
type: enhancement
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The frontend currently uses several near-identical but distinct reds: Tailwind `red` #DB1616 (tailwind.config.cjs) and the Vuetify theme `error` #DB1616 (src/plugins/vuetify.ts) for cancel/error accents and native Vuetify error outlines; `--timeful-error-foreground` #dc2626 (frontend/src/index.css) for the NewEvent submit error text and invalid-field outline; a pale-fill destructive button pair (#fee2e2 bg / #991b1b fg, introduced in completed TASK-0156); and unavailable-slot washes based on #e52323.

Agreed design decision: adopt one canonical red hue (#DB1616) with role-based steps, not one literal value everywhere. Roles legitimately need different lightness for WCAG AA contrast (e.g. red on white passes ~5.1:1, while the same red on the pale fill would be ~4.1:1, so the darker destructive fg stays until the outlined restyle follow-up removes the fill).

Constraints and intent:
- The canonical hue must be defined once and derived everywhere practical so future drift is impossible; washes should be derived from the canonical hue rather than independent literals (the tiny perceptual shift from the old #e52323 base is accepted).
- Aligning the custom error foreground with #DB1616 also resolves the known mismatch between Vuetify's native error outline and the custom invalid-field outline previously noted in completed TASK-0141.
- Follow the frontend styling rules: use `--timeful-*` semantic tokens for shared visual states; the tailwind config already has an established pattern of pointing palette entries at CSS variables (see `outline-neutral`).
- The pale-fill destructive button itself stays visually as-is in this task (except for hue unification of its fill); its restyle to an outlined icon button is a separate follow-up task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A single canonical red hue (#DB1616) is the only red hue used across error text, error outlines, destructive button styling, and calendar unavailable-slot washes
- [ ] #2 Custom error text and the invalid-field outline in the event form render the same red as Vuetify's native error color, removing the two-red mismatch in one form
- [ ] #3 Unavailable-slot washes derive from the canonical red rather than an independent red literal; any rendered color shift is visually imperceptible
- [ ] #4 The event-page Delete buttons keep WCAG AA contrast while they still use the pale red fill
- [ ] #5 Unit test expectations pinned to previous red hex values are updated to assert the consolidated tokens
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
