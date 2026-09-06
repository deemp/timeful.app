---
id: TASK-0167
title: >-
  Restyle event-page Delete buttons to outlined trash-icon buttons and drop
  pale-fill tokens
status: To Do
assignee: []
created_date: '2026-09-06 16:20'
labels:
  - frontend
  - design-system
  - styling
dependencies:
  - TASK-0166
references:
  - frontend/src/views/Event.vue
  - frontend/src/index.css
  - >-
    backlog/completed/task-0156 -
    Soften-solid-event-page-Delete-buttons-from-bright-red-to-pale-red-fill.md
priority: medium
type: enhancement
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to completed TASK-0156, which softened the event-page Delete buttons from solid bright red to a pale red fill. Product decision since then: the Delete button should not be a filled tonal button at all. Final design is an outlined button with a trash icon (not solid, no tint fill).

This task depends on TASK-0166 (unify all frontend reds on one canonical hue #DB1616 with role-based tokens). That task provides the canonical red token and keeps the dark destructive foreground #991b1b only as a transitional contrast measure for the pale fill; this task removes the fill and therefore the reason for the dark step.

Scope:
- Restyle both event-page Delete buttons (desktop and mobile editing actions, currently styled by the `.destructive-tonal-button` class in frontend/src/views/Event.vue) to the Vuetify outlined variant with a trash icon, using the canonical red for text, border, and icon.
- Add a low-opacity wash of the canonical red as the hover state instead of any solid fill.
- Remove the now-unused pale-fill tokens (`--timeful-destructive-btn-bg`, `--timeful-destructive-btn-fg`, `--timeful-destructive-btn-border`) and the transitional dark red foreground from frontend/src/index.css once nothing references them.
- The existing outlined red Cancel/Clear buttons on the event page (e.g. desktop cancel, clear schedule, mobile cancel) are the visual reference for the outlined destructive style, except they carry no icon.

UX rationale: an outline plus icon differentiates Delete from Cancel while dropping the tint; canonical red on white passes WCAG AA (~5.1:1), so the dark foreground step is no longer needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Desktop and mobile event-page Delete buttons render as outlined buttons with a trash icon in the canonical red
- [ ] #2 The outlined Delete button hover state uses a low-opacity wash of the canonical red instead of a solid fill
- [ ] #3 The outlined Delete button text and icon meet WCAG AA contrast on their background
- [ ] #4 The pale-red-fill destructive button tokens and their dark-red foreground are removed and no longer referenced anywhere in the frontend
- [ ] #5 No unit test pins the removed tokens or the previous tonal button styling
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
