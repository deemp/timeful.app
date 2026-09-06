---
id: TASK-0164
title: Move the browser E2E suite to a self-contained root e2e package
status: To Do
assignee: []
created_date: '2026-09-06 15:48'
labels:
  - e2e
  - tooling
dependencies: []
references:
  - frontend/config/tooling.ts
  - frontend/playwright.config.ts
  - frontend/e2e/isolated-test-stack.ts
  - flake.nix
  - .github/workflows/backend-ci.yml
documentation:
  - docs/environments.md
  - frontend/e2e/AGENTS.md
  - frontend/e2e/inspect/AGENTS.md
  - frontend/AGENTS.md
  - AGENTS.md
priority: medium
type: chore
ordinal: 175300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser E2E suite is not a frontend-only concern: its global setup boots the full isolated stack (mongo-test, postgres-test, server-test via root compose.yaml + compose.test.yaml) and the specs exercise the integrated system. It should live at the repository root as a self-contained package instead of inside frontend/.

Outcome: a new root-level e2e/ package owns all browser E2E tooling (Playwright config, specs, helpers, inspect diagnostics, repro entrypoints, stack orchestration), and frontend/ no longer carries any E2E wiring. The root package.json stays a markdown-tooling-only package; the e2e suite gets its own package.json, lockfile, tsconfig, ESLint config, and oxfmt config.

Confirmed decisions and constraints:
- Full relocation: inspect/ and repro/ move with the specs (user chose full move over a specs-only split).
- The e2e package must not import frontend source modules; it consumes the documented repo-root env contract (.env.test / .env.development). The landing sign-in flag read used by landing-hero.spec.ts must resolve from that env contract at the boundary.
- The Playwright webServer must keep starting the frontend Vite dev server from frontend/ (currently npm run dev:test), and isolated-test-stack.ts keeps orchestrating the root Compose test stack; only the file locations and package wiring change.
- frontend/config/tooling.ts is split: e2e-only exports move into the e2e package; frontend dev-server/preview helpers stay for vite.config.ts.
- flake.nix renames its frontend-e2e runner to e2e and .github/workflows/backend-ci.yml is updated to match.
- Documentation and agent guides move with the code and are corrected for new paths; the E2E_* environment variable contract in docs/environments.md keeps its current values.
- No behavior change to the app; this is infrastructure relocation, so existing specs must pass unchanged apart from path and package adjustments.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A self-contained e2e/ package exists at the repository root containing the Playwright config, all specs, helpers, isolated-test-stack.ts, inspect/, repro/, and their AGENTS.md guides; frontend/e2e no longer exists
- [ ] #2 Running npm run test:e2e from e2e/ boots the isolated Compose test stack (mongo-test, postgres-test, server-test) plus the frontend Vite dev server, the full chromium-desktop project passes, and per-run artifact directories under /tmp/opencode/timeful-e2e-artifacts (with E2E_ARTIFACTS_DIR override) still work
- [ ] #3 The firefox-desktop timed-event-postgres-plugin-firefox spec passes when run from the new e2e/ package
- [ ] #4 The e2e package has its own package.json, lockfile, tsconfig, ESLint config preserving the locator-hygiene, settle-exception, and repro raw-page rules, and oxfmt config; it imports no frontend source modules; the Playwright webServer still starts the frontend dev server from frontend/
- [ ] #5 frontend/config/tooling.ts retains only frontend dev-server, preview, and env helpers; e2e-only tooling (tooling mode, isolated E2E network, healthcheck URL, artifacts dir, Playwright config factory) lives in the e2e package with no vite dependency; vite.config.ts behavior is unchanged
- [ ] #6 frontend/ cleanup removes the @playwright/test dependency, all test:e2e*/repro/inspect scripts, tsconfig.e2e.json and its typecheck segment, e2e lint/fmt globs, and e2e ESLint blocks; npm run lint, fmt:check, typecheck, build, and test:unit all pass in frontend/
- [ ] #7 flake.nix provides .#e2e (renamed from .#frontend-e2e) running npm ci and the e2e suite from e2e/, and .github/workflows/backend-ci.yml references .#e2e; nix flake check passes
- [ ] #8 The landing-hero spec determines landing sign-in expectations from the documented env contract without importing frontend source code
- [ ] #9 Docs updated: root AGENTS.md E2E sections, frontend/AGENTS.md Browser Verification, e2e/AGENTS.md and e2e/inspect/AGENTS.md paths, and docs/environments.md commands; the E2E_* environment variable contract values are unchanged
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
