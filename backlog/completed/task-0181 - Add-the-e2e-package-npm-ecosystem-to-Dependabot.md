---
id: TASK-0181
title: Add the e2e package npm ecosystem to Dependabot
status: Done
assignee:
  - opencode
created_date: '2026-09-08 12:24'
updated_date: '2026-09-08 15:13'
labels:
  - ci
  - dependencies
dependencies: []
references:
  - .github/dependabot.yml
  - e2e/package.json
  - docs/ci.md
priority: low
type: chore
ordinal: 177300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-0164 relocated the browser E2E suite to the self-contained root e2e/ package with its own package.json and package-lock.json, but .github/dependabot.yml only configures npm ecosystems for / and /frontend. e2e/package-lock.json therefore gets no automated dependency updates, even though e2e-ci.yml caches and installs from it.

Outcome: .github/dependabot.yml gains an npm ecosystem entry for directory /e2e with the same weekly schedule as the root and frontend entries, so e2e devDependencies (@playwright/test, vite, eslint stack, oxfmt/oxlint, tsx, etc.) are kept up to date by Dependabot.

Constraints:
- Match the existing entries' style (ecosystem npm, directory /e2e, schedule interval weekly).
- docs/ci.md states Dependabot covers "the root and frontend directories"; update that sentence to include the e2e directory.
- Confirm with a docs/ or CI maintainer that no npmrc/registry constraints block the new directory entry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 .github/dependabot.yml contains an npm ecosystem entry for directory /e2e with a weekly schedule, matching the existing root and frontend entry style
- [x] #2 docs/ci.md Dependabot sentence includes the e2e directory
- [x] #3 No npmrc/registry constraint blocks the new directory entry
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
1. Add an npm ecosystem entry for directory /e2e to .github/dependabot.yml, matching the existing root and frontend entries (weekly schedule, quoted values).
2. Update docs/ci.md line 16 so the Dependabot sentence covers the root, frontend, and e2e directories; keep one sentence per physical line.
3. npmrc check: e2e/.npmrc and frontend/.npmrc only set legacy-peer-deps=true; no registry/auth constraints block the new entry.
4. Run npm run format:markdown for changed Markdown; no unit/e2e tests exist or apply to Dependabot config (CI-config + docs change).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification evidence: .github/dependabot.yml now has four updates (github-actions /, npm /, npm /frontend, npm /e2e), all weekly; node parse of the YAML confirms the e2e npm entry. docs/ci.md line 16 updated. format:markdown, format:markdown:check, lint:markdown, test:markdown-rules (30/30), test:markdown-format (30/30) all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an npm ecosystem entry for directory /e2e to .github/dependabot.yml with the same weekly schedule and quoted-value style as the existing root and frontend entries, so e2e/package-lock.json devDependencies (@playwright/test, vite, eslint stack, oxfmt/oxlint, tsx, etc.) now get automated Dependabot updates. Updated the docs/ci.md Dependabot sentence to cover the root, frontend, and e2e directories, keeping one sentence per physical line.

Verified the third constraint: e2e/.npmrc and frontend/.npmrc only set legacy-peer-deps=true, with no registry or auth configuration, so nothing blocks Dependabot from resolving the /e2e directory.

Verification: npm run format:markdown and format:markdown:check pass clean; npm run lint:markdown passes; the repo markdown rule suites (test:markdown-rules and test:markdown-format) pass 30/30 tests each. No unit or e2e test suites apply to a Dependabot config change; dependabot.yml is not a workflow file, so actionlint scope is unaffected.
<!-- SECTION:FINAL_SUMMARY:END -->
