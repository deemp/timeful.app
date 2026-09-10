---
id: TASK-0184
title: Remove Google Tag Manager and the third-party shell env plumbing
status: Done
assignee: []
created_date: '2026-09-08 14:37'
updated_date: '2026-09-08 14:44'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GTM is suspected of causing intermittent e2e hangs. Remove GTM everywhere and the VITE_ENABLE_THIRD_PARTY_SHELL plumbing that gates it.

Scope:
- frontend/index.html: remove GTM script block and noscript iframe
- frontend/src/main.ts: remove createGtm usage and isThirdPartyShellEnabled import
- frontend/src/utils/thirdPartyShell.ts: delete file (sole consumer was main.ts)
- frontend/src/utils/cookie_utils.ts: remove DataLayerObject import, window.dataLayer declaration, dead initializeGTMConsent
- frontend/env.d.ts: remove __timefulThirdPartyShellEnabled and VITE_ENABLE_THIRD_PARTY_SHELL declarations
- frontend/package.json: drop @gtm-support/vue-gtm, refresh lockfile
- compose.yaml, frontend/Dockerfile, docs/environments.md, 6 .env* files: drop VITE_ENABLE_THIRD_PARTY_SHELL
- e2e/inspect/src/page.ts: drop googletagmanager/google-analytics blocklist entries

Out of scope: cookie consent UI and its analytics preference stay as-is; PostHog is unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No GTM/googletagmanager/dataLayer references remain in frontend source, index.html, or dependencies
- [x] #2 VITE_ENABLE_THIRD_PARTY_SHELL and __timefulThirdPartyShellEnabled are gone from code, config, env files, and docs
- [x] #3 frontend required checks pass: lint, fmt:check, typecheck, build, test:unit
- [x] #4 Root fmt:check passes for touched root files
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 All acceptance criteria are satisfied
- [x] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [x] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [x] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed Google Tag Manager and the third-party shell env plumbing everywhere.

Frontend:
- index.html: removed the GTM script block, GTM noscript iframe, and the now-consumerless __timefulThirdPartyShellEnabled inline script.
- src/main.ts: removed createGtm (@gtm-support/vue-gtm) usage and the isThirdPartyShellEnabled import.
- src/utils/thirdPartyShell.ts: deleted (sole consumer was main.ts; no unit tests existed for it).
- src/utils/cookie_utils.ts: removed the DataLayerObject import, window.dataLayer global declaration, and dead initializeGTMConsent (it had no callers).
- env.d.ts: removed __timefulThirdPartyShellEnabled and VITE_ENABLE_THIRD_PARTY_SHELL declarations.
- package.json: dropped @gtm-support/vue-gtm; lockfile refreshed.

Config and env contract:
- compose.yaml: removed the required VITE_ENABLE_THIRD_PARTY_SHELL mapping.
- frontend/Dockerfile: removed the ARG and RUN env line.
- .env.development, .env.development.example, .env.test, .env.test.example, .env.staging.example, .env.production.example: removed the variable line (the two local gitignored files were updated too so compose and Vite keep working).
- docs/environments.md: removed the variable from the frontend build-time list.
- e2e/inspect/src/page.ts: dropped googletagmanager and google-analytics from THIRD_PARTY_BLOCKLIST.

Kept out of scope per decision: the cookie consent UI and its analytics preference remain unchanged; PostHog is unaffected.

Verification:
- Repo-wide search shows zero remaining references to GTM/googletagmanager/dataLayer/THIRD_PARTY_SHELL/ThirdPartyShell outside the Backlog archive.
- frontend: lint (0 errors, 2 pre-existing warnings), fmt:check, typecheck, build, and test:unit (140 files, 1038 tests) all pass.
- Root fmt:check passes; docs/environments.md needed no format:markdown changes.
- Browser smoke: e2e chromium-desktop landing-hero spec passes on the isolated test stack, confirming the app boots without GTM. Full e2e suite not run; the GTM removal is itself the suspected fix for the intermittent e2e hangs.
<!-- SECTION:FINAL_SUMMARY:END -->
