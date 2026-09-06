---
id: TASK-0165
title: Add cross-cutting E2E CI workflow running broader browser coverage
status: To Do
assignee: []
created_date: '2026-09-06 15:49'
labels:
  - e2e
  - ci
dependencies:
  - TASK-0164
references:
  - .github/workflows/backend-ci.yml
  - .github/workflows/frontend-ci.yml
  - flake.nix
documentation:
  - docs/environments.md
  - .github/workflows/backend-ci.yml
  - AGENTS.md
priority: medium
type: chore
ordinal: 176300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser E2E signal is currently lopsided: frontend CI never runs E2E, and Backend CI runs exactly one Firefox spec (timed-event-postgres-plugin-firefox). A server change that breaks browser flows gets no E2E signal. After TASK-0164 relocates the suite to the root e2e package (providing nix run .#e2e), a cross-cutting E2E workflow should give both frontend and server changes browser-level coverage.

Outcome: a new E2E CI workflow triggered by frontend, server, e2e, compose, env-test, and flake changes runs the broad E2E suite in CI, replacing the single-spec browser step in Backend CI.

Confirmed decisions and constraints:
- Scope per user decision: start with the chromium projects (chromium-desktop, chromium-mobile) plus the relocated postgres-plugin Firefox spec; the full Firefox suite (workers:1, slow) stays local-only for now and can be added later.
- The workflow should mirror Backend CI's proven isolated-stack setup (Buildx-cached server test image, cached migrator image, external Go cache volumes, npm cache) rather than reinventing it; duplication of those steps between workflows is acceptable unless a reusable workflow is straightforward.
- The isolated test stack rules still apply: browser E2E always targets the test stack on 3003 and never a development database.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new e2e CI workflow (e.g. .github/workflows/e2e-ci.yml) exists with path triggers on frontend/**, server/**, e2e/**, compose*.yaml, .env.test.example, and the Nix flake
- [ ] #2 The workflow runs nix run .#e2e over the chromium-desktop and chromium-mobile projects and they pass on a clean runner
- [ ] #3 The firefox-desktop timed-event-postgres-plugin-firefox spec moves from backend-ci.yml into the new workflow, and backend-ci.yml no longer runs browser E2E itself
- [ ] #4 The workflow reuses the hardened cache setup proven in backend-ci.yml (buildx GHA cache for the server test image, migrator image tarball, external Go build/module cache volumes, npm cache) so server compilation stays incremental
- [ ] #5 actionlint passes on the new workflow, consistent with the repo's workflow linting enforcement
- [ ] #6 backend-ci.yml and frontend-ci.yml trigger/concurrency configuration remain correct after the browser step moves (no job reruns the same e2e scope twice on one push)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
