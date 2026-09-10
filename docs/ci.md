# Continuous Integration

GitHub-hosted CI runs as GitHub Actions workflows defined in `.github/workflows/`.
Each workflow validates one area of the repository, and Dependabot opens weekly pull requests to keep actions and npm dependencies up to date.

## Workflows

| Workflow    | File              | Purpose                                                                                                                                                           |
| ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown CI | `markdown-ci.yml` | Checks Markdown formatting and linting, and lints all workflow files with `actionlint`                                                                            |
| Frontend CI | `frontend-ci.yml` | Lints, type-checks, unit-tests, and builds the frontend                                                                                                           |
| Backend CI  | `backend-ci.yml`  | Runs the Go server tests against an isolated MongoDB and PostgreSQL Compose stack                                                                                 |
| E2E CI      | `e2e-ci.yml`      | Runs the browser E2E suite against the isolated Compose test stack, covering the Chromium desktop and mobile projects plus the Firefox desktop and touch projects |

Markdown CI triggers on Markdown changes and on changes to any file matching `.github/workflows/*.yml`, so every workflow edit is validated in CI.
Dependabot is configured in `.github/dependabot.yml` with weekly updates for the `github-actions` ecosystem and the npm ecosystems for the root, frontend, and e2e directories.

## Validating workflow files locally

`actionlint` validates workflow syntax, shell snippets in `run:` steps, and common workflow mistakes before CI does.
The Nix development shell defined in `flake.nix` provides `actionlint`, so it is available on `PATH` after entering the shell with `nix develop`.
Run `actionlint` from the repository root; with no arguments it checks every workflow file in `.github/workflows/`.
Run it before pushing any workflow change, because Markdown CI runs the same check on GitHub-hosted runners.

## Action reference pinning

Every `uses:` reference to a GitHub-hosted action is pinned to a full-length commit SHA with a same-line version comment, such as `actions/checkout@<full-length commit SHA> # v7.0.1`.
Full-length SHA pinning prevents tag-move supply-chain attacks because a moved tag cannot change what a pinned workflow executes.
Docker image references in `uses:` are pinned by image digest with a same-line comment recording the version tag, such as the `actionlint` step in `markdown-ci.yml`.
Dependabot updates pinned SHA references and their version comments together in its weekly `github-actions` pull requests.
When adding a new action reference, resolve the SHA from the official action repository with `git ls-remote`, and never guess it or copy it from a fork.

## Recommended repository settings

Enable "Require actions to be pinned to full-length commit SHA" under Settings > Actions > General in the GitHub repository settings.
This setting is the enforcement backstop for the pinning policy above: GitHub rejects any workflow change that references an action by mutable tag, even when a review misses it.
The Dependabot configuration already opens pull requests with SHA-pinned references, so enabling the setting does not block dependency updates.
