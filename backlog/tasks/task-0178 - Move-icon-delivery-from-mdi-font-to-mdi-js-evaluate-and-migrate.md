---
id: TASK-0178
title: Move icon delivery from @mdi/font to @mdi/js (evaluate and migrate)
status: To Do
assignee: []
created_date: '2026-09-08 12:11'
labels:
  - frontend
  - vuetify
dependencies:
  - TASK-0173
references:
  - frontend/package.json
  - 'https://vuetifyjs.com/en/features/icon-fonts/'
priority: low
type: chore
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The frontend ships @mdi/font ^7.4.47, which delivers the full MDI icon font (CSS plus woff2 files) to every page, while Vuetify 4's MD3 direction and Vuetify documentation favor @mdi/js SVG path icons. Evaluate the switch: inventory all v-icon mdi-* call sites, measure the dist bundle delta with @mdi/js, and migrate if the delta and visual parity hold. Record the decision either way.

Known complexity to scope during the audit: icons referenced by dynamic strings or class names (if any) cannot become static imports directly and need explicit handling. Any rendered icon must remain visually identical in size, color inheritance, and hover state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Icon call-site inventory is recorded, including any dynamic class-based icon usages that complicate migration
- [ ] #2 Bundle-size delta for CSS and JS is measured from dist output and recorded, whether or not migrating
- [ ] #3 Either the migration is completed with visual parity verified on desktop and mobile plus the required frontend checks (lint, fmt:check, typecheck, build, test:unit), or a documented decision to stay on @mdi/font is recorded with reasons
- [ ] #4 If migrating: no missing-icon regressions; every mdi-* usage maps to an imported SVG path and renders identically
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
