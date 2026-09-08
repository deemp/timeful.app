---
id: TASK-0174
title: >-
  Self-host Google Fonts via @fontsource to remove external render-blocking
  requests
status: Done
assignee: []
created_date: '2026-09-08 09:51'
updated_date: '2026-09-08 10:00'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 182300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser E2E landing-page navigation stalled ~12s because the render-blocking Google Fonts stylesheet in frontend/index.html (Chivo Mono) hung ~10s on DNS in the Firefox test browser; Firefox holds rendering and main.ts execution until head stylesheets settle. A second external reference (@import in App.vue for DM Sans) compounds this. Fresh Playwright contexts have empty HTTP caches, so caching cannot fix the per-test cold start. External font CSS is also a production reliability liability.

Fix at the source: self-host the fonts with @fontsource npm packages instead of the Google Fonts CDN. Keep the same family names ("Chivo Mono", "DM Sans") and weights (Chivo Mono 300/400/500, DM Sans 400) so existing font-family rules stay untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Runtime frontend (dev and production build) makes no requests to fonts.googleapis.com or fonts.gstatic.com; built dist contains no external font URLs
- [x] #2 Chivo Mono weights 300/400/500 and DM Sans 400 are self-hosted via @fontsource packages and render with the same font-family names, so existing font-family rules in index.css and App.vue need no changes
- [x] #3 Required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the Google Fonts CDN dependency with self-hosted @fontsource packages after an e2e trace showed the render-blocking fonts.googleapis.com stylesheet hanging ~10s on DNS (Firefox DNS lookup) and holding rendering plus main.ts execution until head stylesheets settled — ~12s total landing-page load per fresh (cache-empty) Playwright context.

Changes:
- frontend: added @fontsource/chivo-mono and @fontsource/dm-sans; imported Chivo Mono 300/400/500 and DM Sans 400 in src/main.ts next to the existing @mdi/font import.
- frontend/index.html: removed the two fonts.* preconnects and the render-blocking Chivo Mono stylesheet link.
- frontend/src/App.vue: removed the @import url(fonts.googleapis.com DM Sans) in the global style block; the font-family: "DM Sans" rule is untouched (fontsource registers the same family names).

Evidence:
- Required frontend checks pass: lint (0 errors), fmt:check, typecheck, build, test:unit (1038 passed).
- dist contains no fonts.googleapis/fonts.gstatic URLs and bundles the self-hosted woff2 files (22 font assets).
- Cold navigation against the production preview in Firefox: domcontentloaded 336-553ms, interactive 336-638ms (was ~12s), zero external font requests, computed body font resolves to "DM Sans".
- e2e firefox-touch project re-run: 7 passed (previously failing "touching a timeslot keeps its mobile tooltip anchored while scrolling" now passes as well).

Note: the unrelated expect.poll(...).catch fragility at specs/schedule-overlap-mobile-touch-firefox.spec.ts:294 was intentionally left unchanged per task scope decision.
<!-- SECTION:FINAL_SUMMARY:END -->
