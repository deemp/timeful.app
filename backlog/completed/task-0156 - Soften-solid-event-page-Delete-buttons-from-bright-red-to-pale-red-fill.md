---
id: TASK-0156
title: Soften solid event-page Delete buttons from bright red to pale red fill
status: Done
assignee:
  - opencode
created_date: '2026-09-04 15:29'
updated_date: '2026-09-04 16:22'
labels:
  - ui-styling
dependencies: []
priority: low
type: enhancement
ordinal: 167300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The event page Delete buttons were recently made solid red (TASK-0119) using Vuetify `color="error"`, which resolves to the bright theme error color #DB1616 (frontend/src/plugins/vuetify.ts:13). The user finds this too bright and wants the buttons softened.

Scope: the two solid (filled) Delete buttons on the event response editing page (frontend/src/views/Event.vue):
- Desktop editing header Delete button (~line 649): `variant="flat"` `color="error"`, id `desktop-delete-availability-btn`.
- Mobile editing action bar Delete button (~line 924): `color="error"` default elevated variant.

Desired outcome: a pale red fill inside the buttons instead of the bright red, using a red in the 500-600 shade range (e.g. #ef4444 for red-500 or #dc2626 for red-600), and a font color adjusted correspondingly so the label stays legible on the new fill.

Project context:
- The project already defines the semantic token `--timeful-error-foreground: #dc2626` (Tailwind red-600) in frontend/src/index.css:13, plus the Tailwind token `red: #DB1616` in tailwind.config.cjs.
- Per frontend AGENTS.md styling rules, shared visual states should use `--timeful-*` semantic tokens instead of component-local raw palette values, so the new fill/foreground colors likely belong in src/index.css as dedicated tokens.
- Confirmation-dialog confirm buttons (variant="text") and the Settings "Delete account" outlined button are out of scope; only the solid filled Delete buttons above.
- Unit tests assert style blocks in Event.test.ts / NewEvent.test.ts; check whether any assertions cover these button styles.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On the desktop event editing view, the Delete button (#desktop-delete-availability-btn) renders with the user-confirmed tonal style: pale red #fee2e2 fill (via shared --timeful-destructive-btn-bg token) instead of the bright #DB1616 error fill.
- [x] #2 On the mobile event editing view, the Delete button in the editing action bar renders with the same pale red #fee2e2 fill as the desktop Delete button.
- [x] #3 The Delete button label uses #991b1b (red-800, 6.8:1 contrast on the fill, WCAG AA) with a 1px #991b1b outline matching the font color, consistently on desktop and mobile.
- [x] #4 Delete button click behavior, the confirmation dialog flow, and disabled states are unchanged; the mobile Save button (green) and Cancel button (red outline/text) styling are unchanged.
- [x] #5 The pale red values are defined via new shared --timeful-* semantic tokens in src/index.css rather than component-local raw palette values.
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
User-confirmed design (WCAG-compliant tonal destructive style):
- Fill: #fee2e2 (Tailwind red-100 tint)
- Text: #991b1b (red-800; 6.8:1 on the fill, passes AA)
- Outline: 1px solid #991b1b (same color as font; satisfies non-text contrast 1.4.11)
- Both solid Delete buttons keep no elevation shadow (tonal style).

Steps:
1. frontend/src/index.css: add shared semantic tokens --timeful-destructive-btn-bg: #fee2e2, --timeful-destructive-btn-fg: #991b1b, --timeful-destructive-btn-border: var(--timeful-destructive-btn-fg) near the existing --timeful-error-foreground token.
2. Event.vue desktop Delete (~649): remove color="error", keep variant="flat", add shared class destructive-tonal-button to the existing class list.
3. Event.vue mobile Delete (~924): remove color="error", add destructive-tonal-button; keep tw-text-sm tw-normal-case (replace tw-shadow-none with shadow:none in the shared class).
4. Event.vue non-scoped style block: add .destructive-tonal-button { background-color/color/border from tokens + box-shadow:none, !important } following the .desktop-primary-availability-button pattern; keep .desktop-editing-delete-button's inline-size:100% rule intact (asserted by Event.test.ts).
5. Verify Event.test.ts delete-button assertions still hold (classes, style block substring).
6. Run npm run lint, fmt:check, typecheck, build, test:unit in frontend/.

Out of scope: dialog confirm (variant=text) buttons, Settings outlined Delete account, Save/Cancel styling, all click behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design refinement during execution: the user clarified "pale-red inside (500 or 600)" via follow-up questions. Red text requires a paler fill than red-500/600, so the confirmed design became a tonal button: #fee2e2 fill, #991b1b (red-800) label and matching 1px outline. #dc2626 on #fee2e2 (3.95:1) was rejected for failing WCAG AA at 14px label size; #991b1b gives 6.8:1. Acceptance criteria were updated to the confirmed design (user-approved, not a silent scope change).

Implementation notes: dropped the color="error" prop entirely instead of overriding --v-theme-error, so the tonal style is owned CSS rather than a framework-internal override. Shared .destructive-tonal-button class guarantees desktop/mobile consistency (AC2/AC3). Mobile tw-shadow-none was replaced by box-shadow:none inside the shared rule. The first e2e attempt failed with a transient page.goto 30s timeout while the Playwright-owned stack warmed up; the isolated retry passed in 6.0s, matching the documented cold-start behavior with persistent Go cache volumes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restyled the two solid Delete buttons on the event response editing page from the bright #DB1616 error fill to a WCAG-compliant tonal style, per user-confirmed design (fill #fee2e2 red-100, label #991b1b red-800 at 6.8:1 AA, 1px outline in the same #991b1b as the font, no elevation shadow).

Changes:
- frontend/src/index.css: added shared semantic tokens --timeful-destructive-btn-bg (#fee2e2), --timeful-destructive-btn-fg (#991b1b), and --timeful-destructive-btn-border (references the fg token).
- frontend/src/views/Event.vue: desktop Delete (#desktop-delete-availability-btn) dropped color=\"error\" and gained the shared destructive-tonal-button class (variant=\"flat\" kept); mobile editing-bar Delete dropped color=\"error\" and tw-shadow-none and gained the same shared class. New non-scoped .destructive-tonal-button rule applies background, label color, 1px outline, and box-shadow:none from the tokens, following the existing .desktop-primary-availability-button override pattern. The .desktop-editing-delete-button inline-size rule that Event.test.ts asserts remains intact.

No behavior changes: click handlers, confirmation dialog flow, and Save/Cancel styling are untouched. The initial e2e run hit a transient 30s page.goto cold-start timeout; the isolated retry passed in 6.0s.

Checks: npm run lint (2 pre-existing unrelated warnings), fmt:check, typecheck, build, and test:unit (139 files, 1009 tests) all pass; e2e event-mobile-editing-options spec (chromium-mobile, real-browser rendering of the mobile editing bar including the restyled Delete button) passes. The compiled dist CSS was verified to contain the .destructive-tonal-button rule and token definitions. E2E color assertions do not exist for these buttons, consistent with TASK-0119 precedent; visual verification is available via the local debug entry points.
<!-- SECTION:FINAL_SUMMARY:END -->
