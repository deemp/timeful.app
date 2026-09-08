---
id: TASK-0179
title: Bump stale Go dependencies and raise the go.mod directive
status: To Do
assignee: []
created_date: '2026-09-08 12:11'
labels:
  - server
dependencies: []
references:
  - server/go.mod
  - server/Dockerfile
  - server/utils/mail_utils.go
  - server/utils/utils.go
priority: medium
type: chore
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
server/go.mod declares `go 1.20` while the Docker toolchain is golang:1.26.4-alpine (server/Dockerfile:5), and several modules are years stale (2026-09-08 audit). Raise the directive and bump stale modules; replace unmaintained ones or record why they stay. No route or behavior change.

Notable stale or unmaintained direct dependencies:
- gopkg.in/gomail.v2 (unmaintained since 2016; SMTP OTP mail in server/utils/mail_utils.go)
- github.com/brianvoe/sjwt v0.5.1 (JWT handling in server/utils/utils.go)
- github.com/gin-gonic/gin v1.9.1 plus gin-contrib/cors and gin-contrib/sessions
- github.com/bwmarrin/discordgo v0.27.1
- go.mongodb.org/mongo-driver v1.12.1
- github.com/swaggo/files v1.0.1 and swaggo/gin-swagger v1.6.0
- github.com/jonyTF/go-webdav v0.5.2 (fork) and github.com/emersion/go-ical pinned to a 2024 pseudo-version

Bump within API compatibility. If swag changes, keep `swag init --parseDependency` and `npm run gen:api` output stable or update them together. Verify with the isolated Mongo test stack (compose.test.yaml overlay) rather than host Mongo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The go.mod go directive is raised to the language level supported by the Docker toolchain (no older than golang:1.26.4 features)
- [ ] #2 Stale direct dependencies are bumped to current stable, with explicit recorded keep-decisions for anything not bumped (gomail and sjwt decisions must be explicit)
- [ ] #3 go build and go vet are clean; if swag is bumped, swag regen plus frontend npm run gen:api produce no unintended diffs
- [ ] #4 Mongo-backed route tests pass via the isolated compose.test.yaml overlay stack per the root AGENTS.md workflow, with no route or behavior change
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
