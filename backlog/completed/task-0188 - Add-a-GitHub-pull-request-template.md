---
id: TASK-0188
title: Add a GitHub pull request template
status: Done
assignee: []
created_date: '2026-09-08 18:23'
updated_date: '2026-09-08 21:06'
labels:
  - developer-experience
  - github
dependencies: []
modified_files:
  - .github/pull_request_template.md
priority: low
type: chore
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a single default GitHub pull request template at `.github/pull_request_template.md` so new PR descriptions consistently capture what the repository's best PRs already record: a summary with motivation or root cause, key changes (one subsection per Backlog task for multi-task PRs), Backlog task references, the validation commands actually run, and risk/impact notes such as breaking changes, env var contract changes, migrations, or plugin payload changes.

Constraints settled during planning:

- One default template only; no multi-template `?template=` variants.
- Guidance hints use HTML comments so the rendered PR stays clean; the Validation section uses visible checkboxes with instructions to remove non-applicable lines.
- The template must satisfy the root Markdown pipeline: Markdown CI triggers on `**/*.md`, so the sentences-per-line Prettier formatting and markdown lint apply to it.
- Documentation-only change: no runtime code, tests, build, or CI workflow changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 .github/pull_request_template.md exists in the standard GitHub template location so new PR bodies are pre-populated with it
- [x] #2 Template contains the sections Summary, Changes, Backlog tasks, Validation, and Risk and impact, with section guidance expressed as HTML comments so rendered PR bodies stay clean
- [x] #3 The Validation section is a checklist reflecting the repo's actual checks: frontend required checks (lint, fmt:check, typecheck, build, test:unit), e2e via npm run test:e2e from e2e/, backend route tests via the compose.test.yaml overlay, actionlint for workflow changes, and the root markdown checks for markdown changes
- [x] #4 npm run format:markdown:check and npm run lint:markdown pass from the repository root with the new template in place
- [x] #5 No runtime code, tests, build configuration, or CI workflow files are modified
- [x] #6 Template additionally contains Non-goals and Reviewer notes sections with HTML-comment guidance; the Changes hint allows grouping per Backlog task or per area; the Validation hint instructs pasting the exact commands including required env vars and e2e projects; the Risk and impact hint covers migration backfill and downgrade policy, rollout notes, PLUGIN_API_README.md, and stale documentation updates
- [x] #7 npm run format:markdown:check and npm run lint:markdown pass from the repository root after the amendments
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
Create `.github/pull_request_template.md` with sections Summary, Changes, Backlog tasks, Validation, Risk and impact; HTML-comment guidance per section; Validation checklist mirrors AGENTS.md required checks plus e2e, backend compose overlay, actionlint, and markdown checks.

Run `npm run format:markdown` (DoD item 4), then verify with `npm run format:markdown:check` and `npm run lint:markdown` from the repo root; adjust formatting if the pipeline rewrites the file.

Check acceptance criteria with evidence, record final summary, mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-08 revision: drafting a real PR description for the implement-identities branch against the template exposed five gaps: no slot for deliberately deferred scope, migration/rollout contracts buried in a generic risk hint, no reviewer-guidance prompt, Validation checkboxes inviting ticks instead of exact commands, and no per-area grouping alternative in Changes. Reopened the task to apply: a Non-goals section, a Reviewer notes section, extended Risk and impact hint (backfill, downgrade policy, rollout notes, PLUGIN_API_README.md, stale docs), a paste-exact-commands Validation hint, and per-task-or-per-area Changes grouping.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added `.github/pull_request_template.md`, the standard GitHub location, so new PR bodies are pre-populated with the agreed structure: Summary (motivation or root cause), Changes (one subsection per Backlog task for multi-task PRs), Backlog tasks, a Validation checklist mirroring the repo's actual checks (frontend required checks, e2e projects, backend route tests via the compose.test.yaml overlay, actionlint, markdown checks), and Risk and impact. Section guidance uses HTML comments so rendered PR bodies stay clean. Evidence: `npm run format:markdown`, `npm run format:markdown:check`, and `npm run lint:markdown` all pass from the repo root; `git status` shows no runtime code, tests, build config, or CI workflow changes. Documentation-only change, so unit and e2e tests are exempt per BACKLOG_WORKFLOW.md.

2026-09-08 revision: amended the template with a Non-goals section (deliberately deferred scope with follow-up tasks), a Reviewer notes section (riskiest files and decisions), a per-task-or-per-area Changes grouping hint, a paste-the-exact-commands Validation hint (env vars and e2e projects included), and an extended Risk and impact hint covering migration backfill and downgrade policy, rollout notes (`docs/postgres-staging-rollout.md`), `PLUGIN_API_README.md`, and stale documentation. Motivation and gaps are recorded in Implementation Notes; the amendments came from drafting a real description for the `implement-identities` branch. Evidence: `npm run format:markdown`, `npm run format:markdown:check`, and `npm run lint:markdown` all pass from the repo root after the changes; scope remains documentation-only.
<!-- SECTION:FINAL_SUMMARY:END -->
